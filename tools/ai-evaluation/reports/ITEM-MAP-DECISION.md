# Item maps and variants: development verification

Measured 13 October 2026. This batch adds source constraints for complete labelled product blocks and compact product lists. It remains a local prototype requiring user review.

## Implemented behavior

- Preserve separate color/size fields in the corresponding product description and constrain the expected number of items.
- Bind each supported description to its explicit digit quantity and source-grounded unit price before generation. Per-unit labels permit an amount; an unqualified item price permits it only at quantity one. Missing and ambiguous amounts remain null; zero remains zero.
- Require complete variant evidence, item-specific quantity/price evidence and distinct item coverage. Incorrect output fails rather than being repaired, retried or replaced.
- Decline the map for unsupported free-form lines, recognized corrections/cancellations, competing variants, conflicting attributes, duplicate descriptions and incomplete compact lists. Those inputs retain the original prototype path.

This is hybrid extraction: deterministic rules establish item facts in supported formats, while Qwen works within the resulting schema. The results must not be described as unaided model accuracy. The original rule parser, weights, provisional labels and frozen v1 benchmark remain unchanged.

## Development iterations

Three separately fingerprinted runs used the same 24 known development cases. Each used two excluded warmups, seed 42 and one attempt per scored case. No failed request was retried or replaced within a run.

1. Item names/counts and source guidance: 8/24 complete, 18 critical errors, two rejections. The compact list improved, but one previously correct quantity-one price became null.
2. Added explicit price/quantity line hints: 7/24 complete, 19 critical errors, two rejections. Prompt guidance alone did not prevent price omissions.
3. Bound each mapped description, quantity and known/null price together in the output schema. Final results are recorded below.

Raw artifacts remain outside Git under `~/.cache/fom-ai-evaluation/runs/prototype-item-map-20261013-01`, `-02` and `-03`. These are development iterations, not three independent quality estimates.

## Final comparison

| Metric | Previous phone constraints | Final item constraints |
| --- | ---: | ---: |
| Complete drafts | 7/24 | 9/24 |
| Rejected requests | 2 | 2 |
| Phone errors | 1 | 1 |
| Quantity errors | 10 | 8 |
| Price/delivery-fee errors | 9 | 8 |
| Combined critical errors | 20 | 17 |
| Request p50 / p95 | 6.34 / 9.54 s | 6.24 / 9.13 s |

Case 04 now preserves both product variants and the quantity-one price. Case 05 now contains all three compact-list products with their quantities, keeping ambiguous multi-unit prices null. Those two cases are now complete; every other case has the same scored errors as the preceding phone-constraint run. Cases 07 and 23 still fail numeric evidence validation. Failed requests remain in all headline denominators.

This is evidence of improvement on known development examples only. There were no stability repeats or fresh held-out cases. Latency measures sequential requests on this Mac, excludes Node adapter startup and is not an established speed improvement. Sampled inference-process RSS is approximately 3.90 GB; it excludes adapter/application memory and is not a full Metal/unified-memory measurement.

- [Generated comparison and failure inventory](prototype-item-map-v1.md)
- [Metrics and reproducibility fingerprints](prototype-item-map-v1.json)
- [Previous phone-constraint decision](PHONE-CONSTRAINTS-DECISION.md)

## Verification and reproduction

86 API/prototype/parser tests and 67 Python tests passed. API build type checking, targeted API lint and diff whitespace checks passed. Frozen v1 verified unchanged. The owned inference process stops after each run. No database, order, external AI service or production deployment is involved.

Use the [current-service comparison commands](../prototype_eval/README.md) with a new external output directory. The final run is the `-03` archive. Its report regeneration verifies exact source fingerprints; earlier runs require their corresponding source versions.

## Limits and next work

Free-form splitting such as “one white and one black,” Myanmar quantities written as words, address completeness and correction-only text in notes remain unresolved. The finite source recognizer cannot establish general conversational meaning. Manual confirmation is still required.

Next, address Myanmar quantity wording and free-form item variants with contrasting development examples, then address completeness and note corrections. Representative anonymized shop examples, independent Myanmar-language label review and a fresh held-out evaluation are still required before production approval.
