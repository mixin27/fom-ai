# Standalone public repository: development baseline

Measured 14 October 2026 from FOM AI commit `24a7b73`, with the implementation unchanged throughout the run. This is the first real-inference comparison in the dedicated repository, using its own Node dependencies and public integrity manifest.

## Result

| Metric | Dedicated repository |
| --- | ---: |
| Complete drafts | 17/24 |
| Rejected requests | 2 |
| Phone errors | 1 |
| Quantity errors | 4 |
| Price/delivery-fee errors | 4 |
| Total critical-field errors | 9 |
| Request p50 / p95 | 6571.99 / 8601.81 ms |

Compared with the imported conversational-items run, changed per-case completion/rejection/mismatched-field outcomes: **none**. Baseline-parser changed case outcomes: **none**. This comparison concerns scored outcomes, not byte-identical raw generations or identical performance.

The unchanged rule parser is also measured. Its score uses the revised development labels, including ambiguous prices and excluded payment chatter. Zero complete drafts does not mean it extracted no useful fields; one mismatched field makes a whole draft incomplete. See the generated report for field/language/scenario breakdowns and default corrections.

- [Generated comparison](public-port-development-v1.md)
- [Aggregate metrics and exact fingerprints](public-port-development-v1.json)
- [Previous historical decision](CONVERSATIONAL-ITEMS-DECISION.md)

The generated report retains the historical heading “Current web prototype” and extractor key `prototype` for compatibility with the unchanged evaluator. In this run it refers to the standalone copied service; the web portal was not called or changed.

## Remaining cases

| Case | Outcome | Mismatched fields |
| --- | --- | --- |
| v2-dev-03 | Accepted, incomplete | customer.township |
| v2-dev-07 | AI_DRAFT_INVALID | customer.address, customer.name, customer.phone, customer.township, delivery_fee, items.0.product_name, items.0.qty, items.1.product_name, items.1.qty, items.1.unit_price |
| v2-dev-09 | Accepted, incomplete | customer.township |
| v2-dev-10 | Accepted, incomplete | customer.township |
| v2-dev-14 | Accepted, incomplete | note |
| v2-dev-15 | Accepted, incomplete | customer.address, customer.township, items.0.product_name, items.0.qty, items.0.unit_price |
| v2-dev-23 | AI_DRAFT_INVALID | items.0.product_name, items.0.qty, items.0.unit_price |

Rejected requests remain in the denominator; their missing expected fields count toward critical errors. Acceptance means validation passed, not that the draft was correct.

## Next development batch

Start with explicit township evidence in unlabelled addresses and Myanmar destination requests. Separate explicit markers (such as Tsp/မြို့နယ်) from an unmarked place name: treating every last address word as a township would be unsafe. Case 09's unmarked township needs an explicit policy/label review rather than a case-specific hardcoded exception.

Then address compact slash-delimited item blocks, conversational address corrections, and fulfillment notes mixed with payment statements. Preserve strict evidence/numeric checks, null amounts, original variants, and explicit human confirmation. Do not fix a rejected prompt-injection case by blindly trusting its injected phone/fee instructions. Each change needs synthetic positive/negative regression examples and a new measured run.

## Reproducibility and limitations

The run used the existing pinned Qwen3-4B Q4_K_M weights and llama.cpp runtime on the M1 Pro Mac, with two excluded warmups and seed 42. One model and one request ran at a time. No retries, repairs, parser fallback, downloads, training, production access, or order writes were performed. The evaluator stopped its owned inference process afterward.

The raw archive remains outside Git at `~/.cache/fom-ai-evaluation/runs/public-port-20261014-01`. Only the generated aggregate reports are copied here; source messages, quotations, field values and runtime logs are excluded. The recorded source protocol was unchanged at completion, and report regeneration verifies it before publishing.

Reproduce from the source revision with its locked dependencies and Python 3.12, using a new output directory:

```bash
cd tools/ai-evaluation
python -m prototype_eval run --output "$HOME/.cache/fom-ai-evaluation/runs/public-port-NEW-RUN"
```

These are 24 known development examples with provisional labels, not fresh held-out or representative production evidence. No stability repeats were performed. Latency excludes Node adapter startup; sampled inference RSS is not total application or Metal memory. The root README explains setup; the JSON report includes machine, startup and source/configuration fingerprints. Independent Myanmar review and new held-out families remain necessary.
