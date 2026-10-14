"""Explicit local Qwen3-4B prompt A/B on known, provisional development cases."""

import argparse
import datetime
import json
import os
from pathlib import Path
import signal

from fom_eval.artifacts import ROOT, REPO, external, sha256
from fom_eval.protocol import machine, verify_freeze
from fom_eval.scoring import aggregate, score
from .__main__ import load, write_new
from .recipes import DATASET, ANNOTATIONS
from .runtime import DevelopmentServer

HERE = Path(__file__).resolve().parent
RESTART_ERRORS = {"timeout", "server_unavailable", "transport_error"}


def protocol(variant):
    verify_freeze()
    prompt = HERE / "prompts" / f"{variant}.txt"
    paths = [DATASET, ANNOTATIONS, HERE / "config.json", prompt]
    paths += sorted(HERE.glob("*.py"))
    return {
        "v1": verify_freeze(),
        "v2": {str(p.relative_to(REPO)): sha256(p) for p in paths},
    }


def save(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def evaluate(variant, output, server_factory=DevelopmentServer):
    frozen = protocol(variant)
    cases = load()
    config = json.loads((HERE / "config.json").read_text())
    prompt = (HERE / "prompts" / f"{variant}.txt").read_text()
    directory = external(output)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"qwen3-4b-{variant}.json"
    record = {
        "experiment": "development-v2-prompt-ab",
        "variant": variant,
        "extractor": "qwen3-4b",
        "split": "development",
        "private": False,
        "label_status": "provisional-not-language-reviewed",
        "config": config,
        "protocol": frozen,
        "machine": machine(),
        "prompt": prompt,
        "dataset_sha256": sha256(DATASET),
        "annotations_sha256": sha256(ANNOTATIONS),
        "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "status": "running",
        "runs": [],
        "warmups": [],
        "starts": [],
    }
    write_new(path, record)
    server = None

    def start():
        instance = server_factory("qwen3-4b", directory, config, prompt).__enter__()
        record["starts"].append(
            {
                "cold_start_ms": instance.cold_start_ms,
                "binary_sha256": instance.binary_sha256,
            }
        )
        return instance

    try:
        server = start()
        for index in range(config["warmup_requests"]):
            warm = {
                "id": f"warmup-{index}",
                "text": "Product: Tea\nQty: 1\nUnit price: 1000\nDelivery fee: 0",
            }
            result = server.extract(warm, config["seed"])
            record["warmups"].append(result)
            if result.get("error") in RESTART_ERRORS:
                server.__exit__(None, None, None)
                server = start()
        for index, case in enumerate(cases):
            result = server.extract(case, config["seed"])
            record["runs"].append(result)
            save(path, record)
            print(
                f'{variant} {index + 1}/{len(cases)} {case["id"]}: {result.get("error") or "ok"}',
                flush=True,
            )
            if result.get("error") in RESTART_ERRORS and index + 1 < len(cases):
                server.__exit__(None, None, None)
                server = start()  # Next case only. Never retry a scored request.
        if protocol(variant) != frozen:
            raise ValueError("Experiment inputs changed while running")
        scores = [
            score(case, run) for case, run in zip(cases, record["runs"], strict=True)
        ]
        record.update(
            status="complete",
            summary=aggregate(scores, record["runs"]),
            scores=scores,
            completed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        )
    except BaseException as error:
        record.update(status="failed", failure=type(error).__name__)
        raise
    finally:
        if server:
            server.__exit__(None, None, None)
        save(path, record)
    print(path, flush=True)
    return record


def main():
    os.umask(0o077)

    def interrupted(*_):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupted)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("variant", choices=["control", "candidate"])
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    evaluate(args.variant, args.output)


if __name__ == "__main__":
    main()
