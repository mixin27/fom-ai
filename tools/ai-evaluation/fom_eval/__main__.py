import argparse
import datetime
import json
import os
import signal
from pathlib import Path
import random
import time
from .artifacts import ROOT, external, prepare, sha256
from .dataset import DEFAULT_DATASET, load
from .protocol import fingerprint, verify_freeze, machine


def write(path, value):
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )


def evaluate(args):
    from .baseline import run as baseline_run
    from .runtime import Server

    cases = load(args.dataset)
    config = json.loads((ROOT / "config.json").read_text())
    frozen = verify_freeze() if args.split == "heldout" else fingerprint()
    selected = [c for c in cases if c["split"] == args.split]
    if not selected:
        raise ValueError("No cases in requested split")
    if args.limit:
        if args.split == "heldout":
            raise ValueError("Held-out runs must include every case")
        selected = selected[: args.limit]
    directory = external(args.output)
    directory.mkdir(parents=True, exist_ok=True)
    output = directory / f"{args.extractor}-{args.split}.json"
    if output.exists():
        raise ValueError(
            "Run exists; choose a new output directory (no silent overwrites)"
        )
    private = args.dataset.resolve() != DEFAULT_DATASET.resolve()
    record = {
        "extractor": args.extractor,
        "split": args.split,
        "dataset_sha256": sha256(args.dataset),
        "private": private,
        "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "config": config,
        "freeze": frozen,
        "machine": machine(),
        "runs": [],
        "stability": [],
        "warmups": [],
        "cold_starts_ms": [],
    }
    repeats = random.Random(20261010).sample(selected, min(20, len(selected)))
    record["stability_case_ids"] = [c["id"] for c in repeats]
    write(output, record)
    if args.extractor == "baseline":
        record["runs"], metadata = baseline_run(selected)
        record["baseline_measurements"] = metadata
        for seed in config["stability_seeds"]:
            rows, _ = baseline_run(repeats)
            record["stability"] += [{**r, "seed": seed} for r in rows]
    else:
        server = None
        try:

            def start():
                instance = Server(args.extractor, directory, config).__enter__()
                record["cold_starts_ms"].append(instance.cold_start_ms)
                record["runtime_binary_sha256"] = instance.binary_sha256
                return instance

            server = start()
            # Development-only warmup content, never scored.
            warm = next(c for c in load() if c["split"] == "development")
            for i in range(config["warmup_requests"]):
                result = server.extract(warm, config["seed"])
                record["warmups"].append(result)
                if result.get("error") in (
                    "timeout",
                    "server_unavailable",
                    "transport_error",
                ):
                    server.__exit__(None, None, None)
                    server = start()
            schedule = [("runs", c, config["seed"]) for c in selected]
            schedule += [
                ("stability", c, seed)
                for seed in config["stability_seeds"]
                for c in repeats
            ]
            for index, (section, case, seed) in enumerate(schedule):
                result = server.extract(case, seed)
                record[section].append(result)
                write(output, record)
                print(
                    f'{args.extractor} {index+1}/{len(schedule)} {case["id"]}: {result.get("error") or "ok"} ({result["latency_ms"]:.0f} ms)',
                    flush=True,
                )
                if result.get("error") in (
                    "timeout",
                    "server_unavailable",
                    "transport_error",
                ):
                    # Stop unfinished inference before the NEXT case; never retry this case.
                    server.__exit__(None, None, None)
                    server = start()
        finally:
            if server:
                server.__exit__(None, None, None)
            write(output, record)
    record["completed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    write(output, record)
    print(output)


def main():
    os.umask(0o077)

    def interrupted(*_):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupted)
    parser = argparse.ArgumentParser(
        description="FOM local extraction evaluation (no production access)"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    validate = commands.add_parser("validate")
    validate.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    commands.add_parser("prepare")
    commands.add_parser("freeze")
    run = commands.add_parser("run")
    run.add_argument("extractor", choices=["baseline", "qwen3-1.7b", "qwen3-4b"])
    run.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    run.add_argument("--split", choices=["development", "heldout"], default="heldout")
    run.add_argument("--limit", type=int)
    run.add_argument("--output", type=Path, required=True)
    report = commands.add_parser("report")
    report.add_argument("runs", nargs="+", type=Path)
    report.add_argument("--output", type=Path, default=ROOT / "reports")
    private = commands.add_parser("private-report")
    private.add_argument("runs", nargs="+", type=Path)
    private.add_argument("--dataset", required=True, type=Path)
    private.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.command == "prepare":
        prepare()
    elif args.command == "validate":
        print(f"Validated {len(load(args.dataset))} cases")
    elif args.command == "freeze":
        path = ROOT / "frozen-public-v1.json"
        if path.exists():
            verify_freeze()
            print("Existing freeze verified")
        else:
            write(path, fingerprint())
            print("Configuration frozen; do not tune against held-out failures")
    elif args.command == "run":
        evaluate(args)
    elif args.command == "private-report":
        from .report import private_summary

        private_summary(args.runs, args.dataset, args.output)
    elif args.command == "report":
        from .report import generate

        generate(args.runs, args.output)


if __name__ == "__main__":
    main()
