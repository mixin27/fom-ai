"""Recompute development-only comparisons from complete, matching local runs."""

import argparse
import json
from pathlib import Path

from fom_eval.artifacts import ROOT, external, sha256
from fom_eval.protocol import verify_freeze
from fom_eval.scoring import aggregate, score
from .__main__ import load
from .experiment import protocol
from .recipes import DATASET, ANNOTATIONS


def checked(record, variant, cases):
    if record.get("status") != "complete" or not record.get("completed_at"):
        raise ValueError("Incomplete development run")
    if record.get("split") != "development" or record.get("private", False):
        raise ValueError("Only this public development dataset is supported")
    if record.get("dataset_sha256") != sha256(DATASET) or record.get(
        "annotations_sha256"
    ) != sha256(ANNOTATIONS):
        raise ValueError("Dataset or labels differ")
    if [r["id"] for r in record["runs"]] != [c["id"] for c in cases]:
        raise ValueError("Run case coverage or order differs")
    if variant == "baseline":
        if (
            record.get("extractor") != "baseline"
            or record.get("v1_protocol") != verify_freeze()
        ):
            raise ValueError("Baseline protocol differs")
    elif (
        record.get("extractor") != "qwen3-4b"
        or record.get("variant") != variant
        or record.get("protocol") != protocol(variant)
    ):
        raise ValueError("Model experiment protocol differs")
    scores = [score(case, run) for case, run in zip(cases, record["runs"], strict=True)]
    return aggregate(scores, record["runs"]), scores


def compare(control, candidate, output, baseline=None):
    cases = load()
    paths = {"control": control, "candidate": candidate}
    if baseline:
        paths = {"baseline": baseline, **paths}
    summaries, details, hashes = {}, {}, {}
    for variant, path in paths.items():
        path = external(path)
        record = json.loads(path.read_text())
        summaries[variant], details[variant] = checked(record, variant, cases)
        hashes[variant] = sha256(path)
    results = {
        "status": "provisional-development-only",
        "dataset_sha256": sha256(DATASET),
        "annotations_sha256": sha256(ANNOTATIONS),
        "run_sha256": hashes,
        "results": summaries,
        "case_scores": details,
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "development-v2-prompt-ab.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    lines = [
        "# Qwen3-4B v2 prompt development",
        "",
        "Known synthetic development cases with provisional labels. This is prompt tuning, not independent held-out evidence. No production readiness claim follows from this comparison.",
        "",
        "Control uses the unchanged v1 prompt. Candidate uses explicit correction, pack/variant, missing-value and original-quotation instructions. Model, runtime, schema, scoring, temperature and seed are identical between model runs. There are 24 scored requests per variant, two excluded warmups, and no stability repeats in this small development experiment. Failed requests remain in the denominator.",
        "",
        "| Extractor/prompt | Complete drafts | Failures | Phone errors | Quantity errors | Price errors | p50 / p95 ms |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for variant, summary in summaries.items():
        counts = summary["counts"]
        lines.append(
            f'| {variant} | {summary["complete_drafts"]}/24 | {summary["failures"]} | {counts.get("phone_errors", 0)} | {counts.get("quantity_errors", 0)} | {counts.get("price_errors", 0)} | {summary["warm_latency_p50_ms"]} / {summary["warm_latency_p95_ms"]} |'
        )
    lines += [
        "",
        "Discrepancies include omissions and disagreement with provisional labels. Baseline defaults are distinguished in JSON. Timings are specific to this Mac and sequential run; model timing includes token checks and validation while parser timing measures its parsing function, so these are not equivalent end-to-end service measurements.",
        "",
        "## Case review",
        "",
        "| Case | Control complete | Candidate complete | Candidate mismatched fields |",
        "|---|---|---|---|",
    ]
    for before, after in zip(details["control"], details["candidate"], strict=True):
        fields = ", ".join(e["field"] for e in after["errors"]) or (
            after["failure"] or "—"
        )
        lines.append(
            f'| {after["id"]} | {before["complete"]} | {after["complete"]} | {fields} |'
        )
    lines += [
        "",
        "A better development score is a reason to retain a candidate for review, not evidence of generalization. Review Myanmar labels and ambiguity conventions, then define thresholds and create new held-out families after the development configuration is settled. Real anonymized shop examples and independent language review remain necessary before a pilot.",
        "",
    ]
    (output / "development-v2-prompt-ab.md").write_text("\n".join(lines))
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("control", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "reports")
    args = parser.parse_args()
    compare(args.control, args.candidate, args.output, args.baseline)
    print(args.output / "development-v2-prompt-ab.md")


if __name__ == "__main__":
    main()
