# Conversational item and quantity correction constraints

This development batch adds a finite single-product Myanmar source policy for an order sentence, a matching per-unit price and optional subsequent quantity corrections. It preserves the full product wording and validates the correction sequence before constraining model output. It remains a local prototype requiring review.

## Supported behavior

- Preserve product codes, colours, sizes, package contents and package weights in the original product description. Only a leading supported seller greeting and the explicit ordering/count suffix are removed.
- Bind the ordered quantity and per-unit price to their original source lines. The price classifier must match the ordered unit. Explicit zero prices remain zero.
- Accept a whole, unconditional “old quantity is not correct; make it new quantity” directive only when its old quantity and classifier match the currently established item. Chained corrections must match the latest quantity. Cite the final correction line rather than the initial count.
- Decline the entire map for conditional wording, mismatched counts/classifiers, additional products, duplicate prices, unsupported totals, malformed amounts or unknown lines. Recognized delivery and fulfillment lines remain visible to the model.
- Keep all existing item-count, source-evidence, numeric-bounds and duplicate checks. Failed responses are not repaired, retried or replaced with parser output.

This is hybrid extraction: source rules establish facts for a narrow complete format; the model generates within those constraints. It does not establish general conversation understanding. Other free-form patterns retain the model path, including conversational address corrections and messages with multiple products.

## Final development comparison

Measured 14 October 2026 on the same Mac and unchanged 24-case development set.

| Metric | Previous language/source batch | Conversational item batch |
| --- | ---: | ---: |
| Complete drafts | 15/24 | 17/24 |
| Rejected requests | 2 | 2 |
| Phone errors | 1 | 1 |
| Quantity errors | 6 | 4 |
| Price/delivery-fee errors | 6 | 4 |
| Combined critical errors | 13 | 9 |
| Request p50 / p95 | 6.65 / 9.01 s | 6.56 / 8.90 s |

Case 11 now preserves the package description and unit price without payment chatter in the note. Case 13 now uses the corrected quantity and explicit per-unit price while retaining the package weight in its description. Both cases are complete.

Case 10 now preserves the product code/variant description and quantity, without inventing customer identity, an address or a delivery-question note. Its township is still missing. All other cases retain the same scored field errors as the preceding batch: no new mismatched field was observed. Cases 07 and 23 still fail numeric evidence validation.

This is one development run, with no stability repeats or independent held-out evidence. The changes were designed with these known cases available, so the improvement is not a production accuracy estimate. Sampled inference-process RSS was about 3.87 GB; the latency/RSS limitations below apply.

- [Generated comparison and remaining failure inventory](prototype-conversation-items-v1.md)
- [Metrics and source fingerprints](prototype-conversation-items-v1.json)
- [Previous language/source decision](LANGUAGE-SOURCE-DECISION.md)

## Measurement and verification

The local measurement uses the same 24 known development cases with provisional user-informed labels, two excluded warmups and seed 42. It is not a new independent benchmark. The unchanged parser and frozen v1 benchmark remain intact; the new module is included in the current-service fingerprint.

149 API/prototype/parser tests and 67 Python tests passed. API build type checking, targeted lint and diff whitespace checks passed. Contrast tests cover word/digit quantities, chained corrections, stale old quantities, mixed classifiers, conditional changes, added products, price conflicts, explicit zero, package descriptions and exact source offsets. Deterministic coverage is included in CI; real inference remains local and explicit.

Reproduce with the [current-service comparison commands](../prototype_eval/README.md), using a fresh external output directory. The run archive is `~/.cache/fom-ai-evaluation/runs/prototype-conversation-20261014-01`. Report regeneration verified the exact final source fingerprints. The owned inference process stopped after the run. No database records, orders, production service or external AI API are involved.

## Remaining limits

This finite policy cannot reliably interpret arbitrary Myanmar conversational corrections, ambiguous item groupings, all classifier forms or mixed-language dialogue. A declined map leaves interpretation to the model rather than guaranteeing a correct result. Manual confirmation remains necessary.

Fresh held-out families, representative anonymized shop examples and independent Myanmar-language review are still needed before a production decision. Timing is specific to sequential requests on this Mac; adapter startup is excluded from service latency, and inference RSS is not full application/Metal memory usage.
