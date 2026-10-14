import json
import subprocess
import time
import threading
from .artifacts import REPO
from .contract import Draft, Extraction, check_evidence, flatten, normalize


def adapt(result, text):
    raw = result["suggested_order"]
    meta = result["parse_meta"]
    draft = {
        "customer": raw["customer"],
        "items": [
            {k: item[k] for k in ("product_name", "qty", "unit_price")}
            for item in raw["items"]
        ],
        "delivery_fee": raw["delivery_fee"],
        "note": raw["note"],
    }
    defaults = [
        k
        for k, v in meta["field_sources"].items()
        if v == "default" and k in flatten(draft)
    ]
    evidence = []
    for field, info in meta["field_evidence"].items():
        if (
            field not in flatten(draft)
            or flatten(draft)[field] is None
            or field in defaults
        ):
            continue
        quote = info.get("raw")
        if quote and normalize(quote) in normalize(text):
            # Parser evidence has already normalized Myanmar digits and whitespace.
            # Use the original containing line, or entire message for multiline evidence.
            original = next(
                (
                    line
                    for line in text.splitlines()
                    if normalize(quote) in normalize(line)
                ),
                text,
            )
            evidence.append({"field": field, "quote": original})
    try:
        parsed = Draft.model_validate(draft)
        extraction = Extraction.model_validate(
            {
                "schema_version": "1.0",
                "draft": parsed.model_dump(),
                "evidence": evidence,
            }
        )
        errors = check_evidence(extraction, text)
        # Defaults have no source quotation by definition. They remain scored as values,
        # and incorrect defaults are reported separately from nondefault unsupported facts.
        nondefault_errors = [
            e
            for e in errors
            if not any(e == f"missing evidence: {f}" for f in defaults)
        ]
        return {
            "draft": draft,
            "defaults": defaults,
            "evidence": evidence,
            "schema_valid": True,
            "evidence_valid": not errors,
            "error": "invalid_evidence" if nondefault_errors else None,
            "evidence_errors": errors,
            "original_totals": {k: raw[k] for k in ("subtotal", "total_price")},
        }
    except ValueError:
        return {
            "error": "invalid_schema",
            "schema_valid": False,
            "evidence_valid": False,
            "defaults": defaults,
        }


def run(cases):
    warmups = [
        {"id": f"warmup-{i}", "text": "Product: Tea\nQty: 1\nPrice: 1000"}
        for i in range(2)
    ]
    inputs = warmups + cases
    command = [
        "pnpm",
        "--filter",
        "api",
        "exec",
        "ts-node",
        "--transpile-only",
        "scripts/evaluate-order-parser.ts",
    ]
    start = time.perf_counter()
    process = subprocess.Popen(
        command,
        cwd=REPO,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    stopped = threading.Event()
    memory = {"peak": 0}

    def sample():
        while not stopped.wait(0.05):
            try:
                # Include the pnpm wrapper and its descendant Node process tree.
                table = subprocess.check_output(
                    ["ps", "-axo", "pid=,ppid=,rss="], text=True, timeout=1
                )
                entries = [
                    tuple(map(int, line.split()))
                    for line in table.splitlines()
                    if line.strip()
                ]
                owned = {process.pid}
                for _ in range(10):
                    children = {pid for pid, parent, rss in entries if parent in owned}
                    if children <= owned:
                        break
                    owned |= children
                memory["peak"] = max(
                    memory["peak"],
                    sum(rss * 1024 for pid, parent, rss in entries if pid in owned),
                )
            except (ValueError, subprocess.SubprocessError):
                pass

    monitor = threading.Thread(target=sample, daemon=True)
    monitor.start()
    try:
        stdout, stderr = process.communicate(
            "".join(
                json.dumps({"id": c["id"], "text": c["text"]}, ensure_ascii=False)
                + "\n"
                for c in inputs
            ),
            timeout=180,
        )
    except BaseException:
        import os, signal

        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=5)
        raise
    finally:
        stopped.set()
        monitor.join(timeout=2)
    elapsed = (time.perf_counter() - start) * 1000
    if process.returncode:
        raise RuntimeError(f"baseline_runner_failed: {stderr[:500]}")
    outputs = [json.loads(line) for line in stdout.splitlines() if line.startswith("{")]
    if len(outputs) != len(inputs) or [x["id"] for x in outputs] != [
        x["id"] for x in inputs
    ]:
        raise ValueError("Baseline JSONL protocol mismatch")
    results = []
    for case, output in zip(cases, outputs[2:]):
        result = (
            adapt(output["result"], case["text"])
            if "result" in output
            else {"error": "parser_failure"}
        )
        results.append(
            {
                **result,
                "id": case["id"],
                "latency_ms": output.get("latency_ms"),
                "seed": 42,
                "rss_bytes": memory["peak"],
            }
        )
    return results, {
        "process_total_ms": round(elapsed, 2),
        "startup_estimate_ms": round(
            elapsed - sum(r.get("latency_ms", 0) for r in outputs), 2
        ),
        "warmups": outputs[:2],
        "peak_sampled_rss_bytes": memory["peak"],
        "memory_method": "sum of pnpm and descendant processes, ps RSS sampled every 50 ms; includes startup",
    }
