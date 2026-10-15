# Explicit townships and absent customer fields: development decision

This batch expands source-derived township constraints in the standalone FOM AI repository. FOM Platform's running extraction code is unchanged.

The [first attempt](EXPLICIT-TOWNSHIP-DECISION.md) improved township coverage but caused a new name/address error in case 10. That run is retained as a diagnostic and was not selected as the final implementation. This follow-up constrains absent customer fields only within the already-recognized complete single-product conversation grammar.

## Behavior and scope

- Recognize a complete unlabelled numbered street line with an explicit Tsp/Township/မြို့နယ် marker, a comma immediately after it, and a supported city ending (Yangon/Mandalay or Myanmar forms). Extract the township only; do not fabricate a full address.
- Recognize a narrow direct destination instruction: English “Send/Deliver to … Township/Tsp” or Myanmar “…မြို့နယ်ကို ပို့ပေးပါ။”. An exact accompanying delivery-fee question does not make the destination uncertain.
- Keep original line numbers across blank lines and CRLF, constrain the town value and evidence reference, and pass township-only facts into the model prompt. Previously the prompt included address facts only when a full address fact existed.
- Decline the new constraint for recognized conditional/negative/correction/alternative wording, multiple marked destinations, separate address/township fields, street-name false positives, and unsupported structures. This is a finite format policy, not general conflict detection or a geographic name database.
- Require customer name and full address to remain null when the complete single-product grammar accounts for every line and the only destination is an explicit township. Extra identity/address/unknown lines disable this absence constraint. This is enforced in the JSON schema and validator, not repaired after generation.
- Preserve the pre-existing labelled-address policy, other source constraints, null/zero rules, strict evidence checks and human review. A declined constraint leaves interpretation to the model; it does not guarantee a null result or correct interpretation.

No town list is guessed from a final address token. The known development case with unmarked “Hlaing” remains outside this rule. Corrections and broader destination wording need separate design/review.

## Measurement

Measured on 14 October 2026, using the same 24 provisional development examples, seed 42 and two excluded warmups as the standalone baseline. Source/configuration hashes are recorded in the companion JSON. Parent commit is `e8daee2`; the measured uncommitted implementation is identified by those hashes.

| Metric | Standalone baseline | Township batch |
| --- | ---: | ---: |
| Complete drafts | 17/24 | 19/24 |
| Rejected requests | 2 | 2 |
| Phone / quantity / price errors | 1 / 4 / 4 | 1 / 4 / 4 |
| Critical-field errors | 9 | 9 |
| Request p50 / p95 | 6.57 / 8.60 s | 6.63 / 8.93 s |

Changed scored case outcomes:

| Extractor / case | Previously mismatched fields | Now mismatched fields |
| --- | --- | --- |
| prototype / v2-dev-03 | customer.township | None |
| prototype / v2-dev-10 | customer.township | None |

All other case completion/rejection/mismatched-field outcomes were unchanged. Failed requests remain in the denominator. Evidence acceptance alone does not establish interpretation accuracy.

- [Generated comparison and remaining failures](explicit-township-v2.md)
- [Aggregate metrics and exact fingerprints](explicit-township-v2.json)
- [Previous standalone baseline](PUBLIC-PORT-DECISION.md)

The generated report retains the evaluator's historical “web prototype” heading; it calls this standalone service directly, not the web portal. Raw messages, quotations, field values and runtime logs remain outside Git at `~/.cache/fom-ai-evaluation/runs/explicit-township-20261014-02`.

## Verification and limits

188 TypeScript tests and 70 Python tests passed, along with typecheck, build and the public-content check. Added coverage includes independent synthetic place names, English/Myanmar formats, wrong/missing evidence lines, ambiguous destinations, negation, street-name collisions and the actual prompt/schema transport path.

The local comparison used the existing cached Qwen3-4B Q4_K_M and pinned llama.cpp runtime. No training, model downloads, retries, repairs, automatic fallback, production access or order writes were performed. The owned inference process stopped after completion. Report regeneration checked the matching source protocol; historical manifests/reports remain unchanged.

This is one known development run, designed with these examples available, not new held-out evidence. No stability repeats were performed. Labels still need independent Myanmar review. Timing is Mac-specific and excludes Node adapter startup; sampled inference RSS is not full Metal/application memory. Reproduce with the matching implementation and a new external output directory:

```bash
cd tools/ai-evaluation
python -m prototype_eval run --output "$HOME/.cache/fom-ai-evaluation/runs/explicit-township-NEW-RUN"
```

Next priorities remain compact item formats and numeric evidence, conversational address corrections, and fulfillment notes separated from payment chatter. New representative anonymized examples and fresh held-out families are required before a production quality decision.
