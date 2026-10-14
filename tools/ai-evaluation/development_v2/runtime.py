"""V2 prompt injection with the frozen v1 request algorithm and lifecycle.

The extract method is intentionally copied to avoid mutating v1 globals or files.
A parity test detects drift other than the explicit prompt parameter.
"""

import time
import httpx
from fom_eval.contract import Extraction
from fom_eval.runtime import Server, deadline, DeadlineExceeded, decode_response


class DevelopmentServer(Server):
    def __init__(self, model, directory, config, prompt):
        super().__init__(model, directory, config)
        if not prompt.strip():
            raise ValueError("Prompt cannot be empty")
        self.prompt = prompt

    def extract(self, case, seed):
        start = time.perf_counter()
        result = {}
        response = {}
        try:
            if not 0 < len(case["text"]) <= self.config["max_input_characters"]:
                raise ValueError("input_character_overflow")
            messages = [
                {"role": "system", "content": self.prompt},
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
