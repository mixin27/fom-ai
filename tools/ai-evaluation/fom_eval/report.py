"""Publish only summaries and synthetic failure examples; private runs stay local."""

import json
from collections import Counter
from pathlib import Path
from .artifacts import ROOT, external, sha256
from .contract import normalize
from .dataset import DEFAULT_DATASET, load
from .scoring import aggregate, score


def generate(paths, output):
    cases = {c["id"]: c for c in load() if c["split"] == "heldout"}
    summary = {}
    failures = {}
    protocols = []
    for path in paths:
        run = json.loads(external(path).read_text())
        if run["private"] or run["dataset_sha256"] != sha256(DEFAULT_DATASET):
            raise ValueError(
                "Tracked report generation accepts only the fixed synthetic dataset; private results remain local"
            )
        if run["split"] != "heldout" or not run.get("completed_at"):
            raise ValueError("Reports require completed held-out runs")
        if len(run["runs"]) != len(cases) or {r["id"] for r in run["runs"]} != set(
            cases
        ):
            raise ValueError("Missing, duplicated or unexpected scored cases")
        if run["extractor"] in summary:
            raise ValueError("Duplicate extractor")
        protocols.append(run["freeze"])
        scored = [score(cases[r["id"]], r) for r in run["runs"]]
        result = aggregate(scored, run["runs"])
        result["by_language"] = {
            language: aggregate(
                [s for s in scored if cases[s["id"]]["language"] == language],
                [r for r in run["runs"] if cases[r["id"]]["language"] == language],
            )
            for language in ("en", "my", "mixed")
        }
        tags = sorted({tag for c in cases.values() for tag in c["tags"]})
        result["by_scenario"] = {
            tag: aggregate(
                [s for s in scored if tag in cases[s["id"]]["tags"]],
                [r for r in run["runs"] if tag in cases[r["id"]]["tags"]],
            )
            for tag in tags
        }
        result["failure_categories"] = dict(
            Counter(r["error"] for r in run["runs"] if r.get("error"))
        )
        original = {r["id"]: r for r in run["runs"]}

        def signature(r):
            # Semantic stability ignores evidence formatting, includes failure state.
            return json.dumps(
                {"error": r.get("error"), "draft": r.get("draft")},
                sort_keys=True,
                ensure_ascii=False,
            )

        result["stability"] = {
            "repeated_requests": len(run["stability"]),
            "changed_from_seed42": sum(
                signature(r) != signature(original[r["id"]]) for r in run["stability"]
            ),
            "failures": sum(bool(r.get("error")) for r in run["stability"]),
            "seeds": run["config"]["stability_seeds"],
            "case_ids": run["stability_case_ids"],
        }
        result["cold_starts_ms"] = run.get("cold_starts_ms", [])
        result["baseline_measurements"] = {
            k: v
            for k, v in run.get("baseline_measurements", {}).items()
            if k != "warmups"
        }
        result["machine"] = run["machine"]
        result["config"] = run["config"]
        result["token_usage"] = {
            "requests_reporting_usage": sum(bool(r.get("usage")) for r in run["runs"]),
            "prompt_tokens": sum(
                (r.get("usage") or {}).get("prompt_tokens", 0) for r in run["runs"]
            ),
            "completion_tokens": sum(
                (r.get("usage") or {}).get("completion_tokens", 0) for r in run["runs"]
            ),
        }
        failures[run["extractor"]] = [
            {
                "id": s["id"],
                "message": cases[s["id"]]["text"],
                "failure": s["failure"],
                "errors": s["errors"][:5],
            }
            for s in scored
            if not s["complete"]
        ][:6]
        summary[run["extractor"]] = result
    if any(p != protocols[0] for p in protocols):
        raise ValueError("Cannot compare different frozen protocols")
    if set(summary) != {"baseline", "qwen3-1.7b", "qwen3-4b"}:
        raise ValueError("Decision report requires all three extractors")
    ranking = sorted(
        summary,
        key=lambda k: (
            summary[k]["counts"].get("critical_errors", 0),
            -summary[k]["complete_drafts"],
            summary[k]["failures"],
            summary[k]["warm_latency_p95_ms"] or float("inf"),
        ),
    )
    document = {
        "evaluation_version": "synthetic-v1",
        "provisional": True,
        "ranking": ranking,
        "results": summary,
        "synthetic_failures": failures,
        "frozen_protocol": protocols[0],
    }
    output = output.resolve()
    if output != (ROOT / "reports").resolve():
        external(output)
    output.mkdir(parents=True, exist_ok=True)
    (output / "synthetic-v1.json").write_text(
        json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    lines = [
        "# FOM extraction evaluation — synthetic v1",
        "",
        "**Provisional: synthetic data, no native-language review or representative shop sample.**",
        "",
        "All 120 held-out requests are included. Failed requests miss expected facts; complete-draft accuracy requires a valid response and every expected field. Parser defaults remain in the draft and incorrect defaults are counted separately. Evidence validity measures quotation provenance, not whether the quoted text was interpreted correctly.",
        "",
        "| Extractor | Failures / 120 | Schema valid | Evidence valid | Complete drafts | Critical errors | Item count correct | Warm p50 / p95 ms | Peak RSS MiB |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for name, r in summary.items():
        rss = (
            round(r["peak_sampled_rss_bytes"] / 1024**2)
            if r["peak_sampled_rss_bytes"]
            else "Not measured"
        )
        lines.append(
            f'| {name} | {r["failures"]} | {r["schema_valid"]} | {r["evidence_valid"]} | {r["complete_drafts"]} | {r["counts"].get("critical_errors",0)} | {r["item_count_correct"]} | {r["warm_latency_p50_ms"]} / {r["warm_latency_p95_ms"]} | {rss} |'
        )
    lines += [
        "",
        "## Recommendation",
        "",
        f'Observed ranking: **{" → ".join(ranking)}**. Ranking prioritizes phone/quantity/price errors (including omissions), then complete drafts, failures and latency.',
        "",
        "**Neither model is approved for a production pilot on this evidence.** Use the best measured candidate only as the starting point for a new, separately versioned evaluation with anonymized shop messages and Myanmar-language label review. No production fallback or automatic order creation is justified.",
        "",
        "## Critical errors and language breakdown",
        "",
        "| Extractor | Phone | Quantity | Price/fee | Unsupported populated values | Incorrect parser defaults |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name, r in summary.items():
        c = r["counts"]
        lines.append(
            f'| {name} | {c.get("phone_errors",0)} | {c.get("quantity_errors",0)} | {c.get("price_errors",0)} | {c.get("unsupported_values",0)} | {c.get("default_corrections",0)} |'
        )
    lines += [
        "",
        "| Extractor | Language | Failures | Complete / 40 | Critical errors |",
        "|---|---|---:|---:|---:|",
    ]
    for name, r in summary.items():
        for language, group in r["by_language"].items():
            lines.append(
                f'| {name} | {language} | {group["failures"]} | {group["complete_drafts"]} | {group["counts"].get("critical_errors",0)} |'
            )
    lines += [
        "",
        "## Field precision / recall",
        "",
        "| Extractor | Field | Precision | Recall | Correct missing / missing |",
        "|---|---|---:|---:|---:|",
    ]

    def percent(v):
        return "N/A" if v is None else f"{v:.1%}"

    for name, r in summary.items():
        for field, m in sorted(r["fields"].items()):
            lines.append(
                f'| {name} | {field} | {percent(m["precision"])} | {percent(m["recall"])} | {m["missing_correct"]}/{m["missing_total"]} |'
            )
    lines += ["", "## Failures, startup and repeatability", ""]
    for name, r in summary.items():
        lines.append(
            f'- **{name}:** failure categories `{json.dumps(r["failure_categories"])}`; cold startup ms `{r["cold_starts_ms"]}`; changed repeat outputs {r["stability"]["changed_from_seed42"]}/{r["stability"]["repeated_requests"]}; repeat failures {r["stability"]["failures"]}.'
        )
    lines += ["", "## Representative synthetic failures", ""]
    for name, examples in failures.items():
        lines += ["### " + name, ""]
        for example in examples[:3]:
            lines += [
                f'**{example["id"]}** — {example["failure"] or "semantic mismatch"}',
                "",
                "```text",
                example["message"],
                "```",
                "```json",
                json.dumps(example["errors"], ensure_ascii=False, indent=2),
                "```",
                "",
            ]
    lines += [
        "## Measurement and interpretation limits",
        "",
        "- Synthetic recipes were authored independently of parser output. Sixty translated families stay wholly within one split. Shared labels and constrained vocabulary make this easier than real conversations; translations are not independent samples. Myanmar and mixed-language labels need fluent review.",
        "- Text comparison normalizes Unicode, Myanmar numerals, punctuation and whitespace, with explicit alternatives. It does not use another model as a judge. Semantic paraphrases can still be marked wrong. Item alignment uses deterministic minimum-cost matching, prioritizing product name, then quantity/price.",
        "- Failed/malformed/truncated requests stay in the denominator. Structurally valid drafts with invalid evidence retain diagnostic field scores, but cannot earn complete-draft credit. Baseline defaults do not require fabricated quotations; their missing evidence is reported and incorrect values count as corrections.",
        "- Warm latency includes local template rendering, token preflight, inference and validation for models; baseline latency times only the existing parser. The extra model overhead is intentional and small, but these are different execution paths. Failed requests are included in latency; token usage is unavailable for transport failures.",
        "- RSS is sampled every 100 ms using macOS `ps`; it is a process high-water estimate across the run, not total unified-memory/GPU consumption. Startup is process launch to healthy, not filesystem-cache eviction. Baseline startup is an estimate; baseline RSS sums the pnpm/Node process tree every 50 ms, including startup. All timings apply only to this Mac under its concurrent desktop workload.",
        "- Two development warmups precede scoring. Twenty fixed held-out cases repeat with seeds 43 and 44; exact draft/error changes are counted, not merely accuracy changes. Do not tune on these failures and call a rerun independent evidence.",
        "- See the JSON report for every scenario, token totals, machine details and frozen file hashes. Raw generations remain outside Git.",
        "",
        "## Future web pilot proposal",
        "",
        "After anonymized-shop evaluation and separate approval, expose an explicit Extract draft action in the web portal. NestJS remains responsible for tenant scope, permissions, plan/lifecycle checks and archived-customer matching. Show editable fields, missing values and evidence; require the user to confirm before the existing order-creation flow. No automatic sending, matching IDs from model output, hidden fallback, new mobile features or autonomous actions. Define cost/latency limits and a kill switch in that separate pilot plan.",
        "",
    ]
    (output / "synthetic-v1.md").write_text("\n".join(lines))
    print(output / "synthetic-v1.md")


def private_summary(paths, dataset, output):
    """Local aggregates only. No private messages, field values or examples are exported."""
    dataset = external(dataset)
    output = external(output)
    cases = {c["id"]: c for c in load(dataset) if c["split"] == "heldout"}
    if not cases:
        raise ValueError("Private dataset has no held-out cases")
    result = {}
    for path in paths:
        run = json.loads(external(path).read_text())
        if (
            not run["private"]
            or run["dataset_sha256"] != sha256(dataset)
            or not run.get("completed_at")
        ):
            raise ValueError(
                "Private report needs completed runs of the supplied dataset"
            )
        if len(run["runs"]) != len(cases) or {r["id"] for r in run["runs"]} != set(
            cases
        ):
            raise ValueError("Incomplete private run")
        if run["extractor"] in result:
            raise ValueError("Duplicate extractor")
        result[run["extractor"]] = aggregate(
            [score(cases[r["id"]], r) for r in run["runs"]], run["runs"]
        )
    output.mkdir(parents=True, exist_ok=True)
    (output / "private-summary.json").write_text(
        json.dumps({"private": True, "results": result}, indent=2) + "\n"
    )
    lines = [
        "# Private local evaluation summary",
        "",
        "Private aggregates only. Do not publish without review. This does not replace independent language review or approve a pilot.",
        "",
        "| Extractor | Cases | Failures | Complete | Critical errors |",
        "|---|---:|---:|---:|---:|",
    ]
    for name, row in result.items():
        lines.append(
            f'| {name} | {row["cases"]} | {row["failures"]} | {row["complete_drafts"]} | {row["counts"].get("critical_errors",0)} |'
        )
    (output / "private-summary.md").write_text("\n".join(lines) + "\n")
