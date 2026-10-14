# Myanmar quantity and address source constraints

This local prototype batch extends supported quantity wording, a finite free-form colour allocation pattern, multiline addresses and note classification. All results use the same 24 known development examples and provisional labels. They measure the hybrid application after validation and review policy, not unaided model accuracy or production readiness.

## Implemented behavior

- Recognize Myanmar quantity words one through ten and explicit digit counts with supported classifiers. Source evidence remains the unchanged original text. Package contents, prices and weights do not become word-quantity evidence merely by containing a number word.
- Map a shared product/size plus complete colour/count allocations to separate items. Require matching quantities and classifiers, preserve shared wording, and leave combined prices unallocated. Conflicting or unsupported messages decline the map.
- Recognize per-pack and per-book price evidence. The amount must match the amount next to the per-unit phrase; a different total later on that line is not accepted as that price. This does not populate a price the model omitted.
- Preserve a supported labelled address and its recognized township/city continuation lines, requiring every line in its evidence. Derive townships only from explicit markers and avoid treating numeric street fragments as townships or overriding a separate township field. Corrected, conditional, conflicting or unfamiliar address structures decline the constraints.
- For fully recognized labelled messages containing payment/correction-only prose, preserve explicit fulfillment notes and omit payment-only or wholly recognized phone-correction-only lines. Unknown lines and mixed correction/payment with fulfillment instructions decline the deterministic note constraint.

The original parser, model weights, frozen benchmark, public response shape and order-creation workflow are unchanged. No inference deployment or database mutation is part of this batch.

## Development iterations

Measured 14 October 2026 on the existing Mac. Raw artifacts remain outside Git under `~/.cache/fom-ai-evaluation/runs/`.

- `prototype-language-20261014-01`: interrupted after two scored requests to fix a quantity-expression lint defect. Marked failed; no completed comparison or quality claim.
- `prototype-language-20261014-02`: broad language guidance plus initial source constraints; 12/24 complete, 13 critical errors, two rejections. Despite aggregate improvement, a package description lost wording, a book order lost its second item, and a previously accepted example failed evidence validation. That prompt expansion was removed.
- `prototype-language-20261014-03`: revised source constraints with the existing base prompt; 13/24 complete, 14 critical errors, two rejections. Contrast tests tightened mixed classifiers, per-unit amounts versus totals and township extraction. A note constraint applied to ordinary messages still introduced a product-name omission and a missing phone.
- `prototype-language-20261014-04`: applies note constraints only when a recognized payment-only or correction-only statement is excluded. Ordinary messages and standalone fulfillment notes retain their prior inference context.

Each completed run uses two excluded warmups, seed 42 and one attempt per case. Failures remain in headline denominators. Development iterations are retained separately; they are not independent benchmarks or within-run retries.

## Final development comparison

| Metric | Previous item-map batch | Final language/source batch |
| --- | ---: | ---: |
| Complete drafts | 9/24 | 15/24 |
| Rejected requests | 2 | 2 |
| Phone errors | 1 | 1 |
| Quantity errors | 8 | 6 |
| Price/delivery-fee errors | 8 | 6 |
| Combined critical errors | 17 | 13 |
| Request p50 / p95 | 6.24 / 9.13 s | 6.65 / 9.01 s |

Cases 01, 02 and 08 now include the expected explicit township; case 02 also excludes payment chatter from its note. Case 12 preserves both colour allocations with unknown bundle prices. Case 16 excludes the phone-correction instruction from its note while retaining the corrected phone. Case 24 preserves the complete multiline address and township. Those six cases are newly complete.

Cases 10 and 14 retain per-unit prices previously blanked by the review policy, but still have other errors. The product-name and phone regressions from the preceding iteration are absent. Every other case has the same scored field errors as the previous item-map batch; cases 07 and 23 still fail numeric evidence validation.

No new mismatched field appears relative to the previous batch in this run. That is a development regression result, not evidence of universal improvement. These reused examples have no independent Myanmar-language review, fresh held-out evaluation or stability repeats. Timing is sequential service latency on this Mac, excluding adapter startup. Sampled inference RSS is about 3.92 GB and excludes full application/Metal memory accounting.

- [Generated final comparison and failure inventory](prototype-language-sources-v1.md)
- [Final metrics and source fingerprints](prototype-language-sources-v1.json)
- [Previous item-map decision](ITEM-MAP-DECISION.md)

## Verification

126 API/prototype/parser tests and 67 Python tests passed. API build type checking and targeted lint passed; frozen v1 verified unchanged. The new policies are fingerprinted by the current-service evaluator, and the deterministic language-policy suite is included in CI. No model download or inference is added to CI.

Reproduce using the [current-service evaluation commands](../prototype_eval/README.md) with a fresh external output directory. The final raw archive is `prototype-language-20261014-04`; report regeneration verified its matching source fingerprints. The owned inference process exited after the run. Raw runs contain source quotations and remain outside Git; published comparisons contain metrics and field/error names only.

## Remaining limits

This is a finite source recognizer, not general Myanmar-language understanding. Unlabelled quantity corrections, unfamiliar variants, pack descriptions, conversational address corrections and mixed payment/fulfillment prose may still be wrong or omitted. Declining a constraint preserves the model path; it does not guarantee that path is correct.

Keep manual review and local-only operation. The next quality decision needs representative anonymized shop examples, independent Myanmar-language review, fresh held-out families and repeated measurements. Improvements on this reused development set do not establish production accuracy.
