# Compact slash-separated items: development decision

This batch extends the standalone FOM AI source policy for complete labelled item rows such as `Product Cup / Color Blue / Qty 2 / Unit price 1000`. FOM Platform still uses its own extraction implementation.

## Behavior

- Recognize spaced slashes outside parentheses, optional label colons, English/Myanmar labels, digit quantities and optional classifiers. Preserve product variant wording and original line references across blanks and CRLF.
- Require every nonempty line to be a supported product row or an allowlisted ancillary field/statement. Decline duplicate attributes/items, partial mixed lists, unknown lines, recognized corrections/alternatives, malformed amounts and more than 20 items.
- Constrain one output item per source row, with matching numeric evidence. Missing quantities/prices stay null; explicit zero stays zero. Unqualified prices with quantity greater than one remain unknown. Explicit unit prices and an unqualified price for exactly one item can be used.
- Leave unsupported formats to the existing model path. A declined source map is not a guarantee of correct interpretation. This finite grammar does not establish general understanding of arbitrary messages.
- Keep strict schema/evidence validation, review warnings and human confirmation. No model training, retries, repairs, fallback or order creation.

## Measurement

Measured on 15 October 2026 against the same 24 known development cases, seed 42 and two excluded warmups. The companion JSON fingerprints the measured source changes relative to parent commit `e8daee2`.

| Metric | Previous township batch | Compact item batch |
| --- | ---: | ---: |
| Complete drafts | 19/24 | 19/24 |
| Rejected requests | 2 | 1 |
| Phone / quantity / price errors | 1 / 4 / 4 | 0 / 2 / 2 |
| Critical-field errors | 9 | 4 |
| Request p50 / p95 | 6.63 / 8.93 s | 6.83 / 9.06 s |

Changed scored outcomes:

| Extractor / case | Previously mismatched fields | Now mismatched fields |
| --- | --- | --- |
| prototype / v2-dev-07 | customer.address, customer.name, customer.phone, customer.township, delivery_fee, items.0.product_name, items.0.qty, items.1.product_name, items.1.qty, items.1.unit_price | customer.address, customer.name, customer.township, note |

The targeted case now has correct items, quantities, prices, phone and delivery fee. It still includes customer labels in name/address values, includes city/suffix text in the township, and copies payment chatter into the note. It therefore remains incomplete.

All other completion/rejection/mismatched-field outcomes were unchanged. Rejected requests remain in the denominator; critical errors count fields, including omissions and delivery fees. Acceptance is not proof of correctness.

- [Generated comparison and failure inventory](compact-slash-v1.md)
- [Aggregate metrics and fingerprints](compact-slash-v1.json)
- [Previous township decision](TOWNSHIP-ONLY-DECISION.md)

Raw messages, quotations, output values and runtime logs remain outside Git at `~/.cache/fom-ai-evaluation/runs/compact-slash-20261015-01`. Only aggregate reports are copied here. The generated report retains the evaluator's historical “web prototype” title but runs this standalone service.

## Verification and limits

Typecheck, build, 231 TypeScript tests, 70 Python tests and the public-content guard passed. The 43 added tests cover Myanmar digits, variants, missing/zero/ambiguous values, invalid/duplicate fields, incomplete lists, exact evidence, altered values, item limits and decoding through the review policy.

The Python 3.12 environment was recreated at the documented ignored `.venv` location after the old temporary environment lost package files; existing pinned dependencies were retained. Real inference reused cached Qwen3-4B Q4_K_M and the pinned llama.cpp executable. The evaluator stopped its owned process and report regeneration checked the matching protocol.

This is a single known-development run, not fresh held-out quality evidence or a production promotion gate. Labels still need independent Myanmar review. There are no stability repeats. Timings reflect this Mac/run, exclude Node adapter startup and cannot establish a speed improvement. Sampled inference RSS excludes total Metal/application memory. Historical reports and frozen manifests remain unchanged.

Reproduce with the matching source and a new external output directory:

```bash
source .venv/bin/activate
cd tools/ai-evaluation
python -m prototype_eval run --output "$HOME/.cache/fom-ai-evaluation/runs/compact-slash-NEW-RUN"
```

Next work remains conversational corrections, fulfillment notes versus payment chatter, the remaining numeric-evidence failure, and an explicit decision about unmarked township names. Representative anonymized samples and fresh held-out families are still needed before integration approval.
