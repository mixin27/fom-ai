"""Recompute the contrastive development decision against the archived control."""

import argparse
import json
from pathlib import Path

from fom_eval.artifacts import ROOT, external, sha256
from fom_eval.scoring import score, aggregate
from ..__main__ import load
from ..compare import checked
from ..recipes import DATASET, ANNOTATIONS
from .__main__ import HERE, protocol


def selection(control, candidate):
    policy = json.loads((HERE / "selection.json").read_text())
    checks = {
        field + "_not_higher": candidate["counts"].get(field, 0)
        <= control["counts"].get(field, 0)
        for field in policy["non_regression_metrics"]
    }
    if policy["require_complete_drafts_not_lower"]:
        checks["complete_drafts_not_lower"] = (
            candidate["complete_drafts"] >= control["complete_drafts"]
        )
    if policy["require_failures_not_higher"]:
        checks["failures_not_higher"] = candidate["failures"] <= control["failures"]
    if policy["require_at_least_one_strict_improvement"]:
        checks["at_least_one_improvement"] = (
            candidate["complete_drafts"] > control["complete_drafts"]
            or candidate["failures"] < control["failures"]
            or any(
                candidate["counts"].get(field, 0) < control["counts"].get(field, 0)
                for field in policy["non_regression_metrics"]
            )
        )
    return {
        "checks": checks,
        "retain_for_further_development": all(checks.values()),
        "pilot_approved": False,
    }


def checked_candidate(record, cases):
    if record.get("status") != "complete" or not record.get("completed_at"):
        raise ValueError("Incomplete contrastive run")
    if (
        record.get("experiment") != "contrastive-development-01"
        or record.get("variant") != "contrastive"
        or record.get("extractor") != "qwen3-4b"
        or record.get("private") is not False
        or record.get("split") != "development"
    ):
        raise ValueError("Wrong experiment or data scope")
    if record.get("protocol") != protocol("contrastive"):
        raise ValueError("Contrastive source/configuration differs")
    if record.get("dataset_sha256") != sha256(DATASET) or record.get(
        "annotations_sha256"
    ) != sha256(ANNOTATIONS):
        raise ValueError("Dataset or labels differ")
    if [r["id"] for r in record["runs"]] != [c["id"] for c in cases]:
        raise ValueError("Run coverage or order differs")
    scores = [score(case, run) for case, run in zip(cases, record["runs"], strict=True)]
    return aggregate(scores, record["runs"]), scores


def compare(control_path, candidate_path, output):
    control_path, candidate_path = external(control_path), external(candidate_path)
    control, candidate = [
        json.loads(p.read_text()) for p in [control_path, candidate_path]
    ]
    cases = load()
    before, old_scores = checked(control, "control", cases)
    after, new_scores = checked_candidate(candidate, cases)
    if (
        control["config"] != candidate["config"]
        or control["machine"] != candidate["machine"]
    ):
        raise ValueError(
            "Comparison requires matching configuration and recorded machine"
        )
    decision = selection(before, after)
    data = {
        "scope": "development-only-provisional; no independent language review or stability repeats",
        "source_runs": {
            "control": sha256(control_path),
            "contrastive": sha256(candidate_path),
        },
        "policy": json.loads((HERE / "selection.json").read_text()),
        "decision": decision,
        "results": {"control": before, "contrastive": after},
        "case_scores": {"control": old_scores, "contrastive": new_scores},
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "development-v2-contrastive.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    verdict = (
        "Retain for further development review only."
        if decision["retain_for_further_development"]
        else "Do not promote this prompt; it fails the predeclared development comparison criteria."
    )
    lines = [
        "# Shorter contrastive prompt: development experiment",
        "",
        verdict,
        "",
        "Known synthetic cases with provisional labels, selected after earlier failures. This is development tuning, not independent quality evidence. The earlier control is reused; this is not an interleaved timing experiment. Both runs use the same model/runtime, schema, seed 42 and sampling configuration. Each includes 24 scored cases and two excluded warmups, with no stability repeats. Failed cases remain in the denominator.",
        "",
        "| Prompt | Complete drafts | Failures | Phone errors | Quantity errors | Price errors | p50 / p95 ms |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for name, result in data["results"].items():
        c = result["counts"]
        lines.append(
            f'| {name} | {result["complete_drafts"]}/24 | {result["failures"]} | {c.get("phone_errors", 0)} | {c.get("quantity_errors", 0)} | {c.get("price_errors", 0)} | {result["warm_latency_p50_ms"]} / {result["warm_latency_p95_ms"]} |'
        )
    lines += ["", "## Criteria set before inference", ""]
    lines += [
        f'- {name}: {"pass" if passed else "FAIL"}'
        for name, passed in decision["checks"].items()
    ]
    lines += [
        "",
        "Errors include omissions and disagreement with provisional gold. Each critical-field category must not regress; lower combined errors alone cannot satisfy selection. A passing development comparison still does not approve a pilot or establish generalization.",
        "",
        "## Per-case results",
        "",
        "| Case | Control complete | Contrastive complete | Remaining mismatches or validation failure |",
        "|---|---|---|---|",
    ]
    for old, new in zip(old_scores, new_scores, strict=True):
        fields = ", ".join(e["field"] for e in new["errors"])
        issue = "; ".join(x for x in [fields, new["failure"]] if x) or "—"
        lines.append(
            f'| {new["id"]} | {old["complete"]} | {new["complete"]} | {issue} |'
        )
    lines += [
        "",
        "The contrastive prompt is preserved separately from the prior A/B. Labels, alternatives and scoring were not edited in response to outputs. Exact original evidence is still required; no repair, retry or fallback was used. Performance is Mac-specific and single-run; process RSS is not total Metal/unified memory. Review Myanmar labels and remaining critical errors before selecting a configuration for fresh held-out families or representative anonymized shop examples.",
        "",
    ]
    (output / "development-v2-contrastive.md").write_text(
        "\n".join(lines), encoding="utf-8"
    )
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("control", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "reports")
    args = parser.parse_args()
    compare(args.control, args.candidate, args.output)
    print(args.output / "development-v2-contrastive.md")


if __name__ == "__main__":
    main()
