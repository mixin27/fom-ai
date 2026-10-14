# Phone correction constraints: development verification

Measured 12 October 2026. **Both previously accepted outdated-phone selections now match the corrected source number. Keep the prototype local and require review; other extraction failures remain.**

The evaluation batch was committed as `30598774`. This follow-up changes only the local prototype's phone constraints, related review warnings and their UI heading. It does not change the original parser, model weights, application prompt, dataset labels or historical frozen benchmark.

## Implemented behavior

- A narrow source policy recognizes explicit English/Myanmar phone-correction forms. The model's allowed phone values are reduced to the corrected source number or null.
- The phone's source references are also constrained to the recognized correction line. An initial development run selected the new number in one case but cited the old line; validation rejected it. The final implementation constrains both value and reference rather than weakening evidence validation.
- Recognized incomplete corrections or competing phone candidates without a recognized resolution leave only null available, with a warning requesting manual confirmation. No phone is filled automatically when the model returns null.
- Multiple contact roles, unfamiliar phrasing/number formats and broader conversational context remain outside this finite policy. Conservative false positives can require manual entry. This is not a general correction parser or complete injection defense.

## Same 24 development cases, before and after

| Metric | Initial current-service run | Final phone-constraint run |
| --- | ---: | ---: |
| Complete drafts | 6/24 | 7/24 |
| Rejected requests | 2 | 2 |
| Phone errors | 3 | 1 |
| Quantity errors | 10 | 10 |
| Price/delivery-fee errors | 9 | 9 |
| Combined critical field errors | 22 | 20 |
| Request p50 / p95 | 6.14 / 9.58 s | 6.34 / 9.54 s |

Cases 16 and 17 now have the correct phone and valid evidence. Case 16 still includes unwanted correction text in the note, so it does not count as a complete draft. Case 18's unresolved contact conflict remains null. The remaining phone discrepancy is a missing expected field because case 7's entire response was rejected for an unsupported number; no accepted response in this small run contained a phone mismatch against these labels.

Comparing per-case scored errors with the initial run, only the phone discrepancies in cases 16 and 17 changed. This establishes the observed regression improvement on these known examples; it does not establish general phone accuracy. Unit tests add contrasting conditional, negated, quoted, multiple-number, incomplete and sequential-correction cases, but those contrast tests do not run the model.

Two warmups precede 24 scored requests at seed 42. There are no automatic retries or fallback, and failed requests remain in the denominator. These are application outputs after validation and review policy, not raw model accuracy. Timings are sequential Mac development measurements, not isolated production performance or statistically established speed changes.

## Verification and reproduction

- 22 phone-policy cases plus the existing service/adapter checks passed: 51 tests in those three suites. The CI-selected parser/parity/adapter/phone suites passed 36 tests, overlapping with the first group.
- 67 Python tests passed; frozen v1 verified unchanged.
- API type check and targeted API/web lint passed. The web change is the warning heading, not a layout redesign or signed-in workflow validation.
- No database access, orders, cloud inference, new weights, training or deployment.

Use the [current-service comparison commands](../prototype_eval/README.md) with a fresh external output directory. The final raw archive is `~/.cache/fom-ai-evaluation/runs/prototype-phone-constraints-20261012-02`. The earlier development attempt remains under the corresponding `-01` directory; it is not the final result or an independent benchmark. The owned local runtime exited at the end of each run.

- [Generated final comparison](prototype-phone-constraints-v1.md)
- [Final metrics and source fingerprints](prototype-phone-constraints-v1.json)
- [Original current-service decision](PROTOTYPE-DEVELOPMENT-DECISION.md)
- [Policy scope and supported forms](../../ai-prototype/README.md#phone-correction-constraints)

## Next work

Continue with multiple-item separation and variant preservation, then Myanmar quantities and address completeness. Keep correction-only text out of order notes without removing real fulfillment instructions. All of that needs contrasting development cases and remeasurement. Representative anonymized shop samples, independent Myanmar-language review and fresh held-out evaluation remain required before any production decision.
