"""Owned loopback llama.cpp process, one slot, hard request deadline, no retries."""

from contextlib import contextmanager
import json
import fcntl
import os
from pathlib import Path
import signal
import socket
import subprocess
import threading
import time
import httpx
from pydantic import ValidationError
from .artifacts import ROOT, cache_dir, manifest, sha256
from .contract import Extraction, check_evidence


class DeadlineExceeded(TimeoutError):
    pass


@contextmanager
def deadline(seconds):
    def expired(*_):
        raise DeadlineExceeded("request_deadline")

    previous = signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def decode_response(response: dict, text: str) -> dict:
    choice = response["choices"][0]
    if choice.get("finish_reason") != "stop":
        return {
            "error": "truncated_or_nonstop_output",
            "schema_valid": False,
            "evidence_valid": False,
        }
    raw = choice["message"].get("content", "")
    try:
        result = Extraction.model_validate_json(raw)
    except (ValidationError, ValueError, TypeError):
        return {
            "error": "invalid_json_or_schema",
            "schema_valid": False,
            "evidence_valid": False,
            "raw": raw,
        }
    errors = check_evidence(result, text)
    return {
        "draft": result.draft.model_dump(),
        "evidence": [e.model_dump() for e in result.evidence],
        "schema_valid": True,
        "evidence_valid": not errors,
        "error": "invalid_evidence" if errors else None,
        "evidence_errors": errors,
        "raw": raw,
    }


class Server:
    def __init__(self, model, directory: Path, config):
        self.model = model
        self.directory = directory
        self.config = config
        self.process = None
        self.log = None
        self.client = None
        self.lock = None
        self.peak = 0
        self.stopped = threading.Event()

    def __enter__(self):
        try:
            artifact = manifest()
            cache = cache_dir()
            info = artifact["models"][self.model]
            self.lock = (cache / "inference.lock").open("a")
            try:
                fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise RuntimeError("Another evaluation owns the inference lock")
            weights = cache / info["filename"]
            if not weights.exists() or sha256(weights) != info["sha256"]:
                raise ValueError("Weights missing or checksum mismatch; run prepare")
            binaries = list(
                (cache / artifact["runtime"]["release"]).rglob("llama-server")
            )
            if len(binaries) != 1:
                raise ValueError("Run prepare to install the pinned runtime")
            # Re-extracted runtime is verified during prepare; additionally pin executable hash per run.
            self.binary_sha256 = sha256(binaries[0])
            if self.binary_sha256 != artifact["runtime"]["executable_sha256"]:
                raise ValueError("Runtime executable checksum mismatch; run prepare")
            with socket.socket() as sock:
                sock.bind(("127.0.0.1", 0))
                port = sock.getsockname()[1]
            self.base = f"http://127.0.0.1:{port}"
            self.command = [
                str(binaries[0]),
                "-m",
                str(weights),
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
                "-c",
                str(self.config["context_tokens"]),
                "-np",
                "1",
                "-ngl",
                "99",
                "--fit",
                "off",
                "--flash-attn",
                "on",
                "--no-context-shift",
                "--jinja",
                "--reasoning",
                "off",
                "--chat-template-kwargs",
                '{"enable_thinking":false}',
                "--no-webui",
            ]
            self.log = (self.directory / f"{self.model}-server.log").open("a")
            start = time.perf_counter()
            self.process = subprocess.Popen(
                self.command,
                stdout=self.log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            self.client = httpx.Client(base_url=self.base, timeout=2, trust_env=False)

            def sample():
                while not self.stopped.wait(0.1):
                    try:
                        output = subprocess.check_output(
                            ["ps", "-o", "rss=", "-p", str(self.process.pid)],
                            text=True,
                            timeout=1,
                        )
                        self.peak = max(self.peak, int(output.strip()) * 1024)
                    except (ValueError, subprocess.SubprocessError):
                        pass

            self.monitor = threading.Thread(target=sample, daemon=True)
            self.monitor.start()
            while time.perf_counter() - start < 120:
                if self.process.poll() is not None:
                    raise RuntimeError("server_start_failed; inspect local server log")
                try:
                    if self.client.get("/health").status_code == 200:
                        self.cold_start_ms = round(
                            (time.perf_counter() - start) * 1000, 2
                        )
                        return self
                except httpx.HTTPError:
                    pass
                time.sleep(0.1)
            raise TimeoutError("server_start_deadline")
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *_):
        self.stopped.set()
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        if hasattr(self, "monitor"):
            self.monitor.join(timeout=2)
        if self.client:
            self.client.close()
        if self.log:
            self.log.close()
        if self.lock:
            self.lock.close()

    def extract(self, case, seed):
        start = time.perf_counter()
        result = {}
        response = {}
        try:
            if not 0 < len(case["text"]) <= self.config["max_input_characters"]:
                raise ValueError("input_character_overflow")
            messages = [
                {"role": "system", "content": (ROOT / "prompt.txt").read_text()},
                {"role": "user", "content": case["text"]},
            ]
            with deadline(self.config["deadline_seconds"]):
                template = self.client.post(
                    "/apply-template",
                    json={
                        "messages": messages,
                        "add_generation_prompt": True,
                        "chat_template_kwargs": {"enable_thinking": False},
                    },
                    timeout=self.config["deadline_seconds"],
                )
                template.raise_for_status()
                tokenized = self.client.post(
                    "/tokenize",
                    json={"content": template.json()["prompt"], "add_special": True},
                    timeout=self.config["deadline_seconds"],
                )
                tokenized.raise_for_status()
                input_tokens = len(tokenized.json()["tokens"])
                if (
                    input_tokens + self.config["output_tokens"] + 64
                    > self.config["context_tokens"]
                ):
                    raise ValueError("input_context_overflow")
                payload = {
                    "messages": messages,
                    "max_tokens": self.config["output_tokens"],
                    "temperature": self.config["temperature"],
                    "top_p": self.config["top_p"],
                    "top_k": self.config["top_k"],
                    "seed": seed,
                    "stream": False,
                    "cache_prompt": False,
                    "chat_template_kwargs": {"enable_thinking": False},
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": {
                            "name": "fom_order_extraction",
                            "strict": True,
                            "schema": Extraction.model_json_schema(),
                        },
                    },
                }
                request = self.client.post(
                    "/v1/chat/completions",
                    json=payload,
                    timeout=self.config["deadline_seconds"],
                )
                request.raise_for_status()
                response = request.json()
                result = decode_response(response, case["text"])
                result["preflight_input_tokens"] = input_tokens
        except (DeadlineExceeded, httpx.TimeoutException):
            result = {"error": "timeout"}
        except httpx.ConnectError:
            result = {"error": "server_unavailable"}
        except httpx.HTTPStatusError as error:
            result = {"error": f"http_{error.response.status_code}"}
        except httpx.HTTPError:
            result = {"error": "transport_error"}
        except (KeyError, IndexError, ValueError, TypeError) as error:
            result = {
                "error": (
                    str(error)
                    if isinstance(error, ValueError)
                    else "invalid_server_response"
                )
            }
        result.update(
            id=case["id"],
            seed=seed,
            latency_ms=round((time.perf_counter() - start) * 1000, 2),
            rss_bytes=self.peak,
            usage=response.get("usage"),
        )
        return result
