# V2 development prompt decision

**Do not promote the candidate prompt.** It improves quantity extraction on this small development set but regresses phone accuracy, evidence validity and complete-draft accuracy. Keep the frozen v1 results and the unchanged application parser intact. Neither prompt is ready for a customer-facing pilot on this evidence.

This decision uses 24 known, provisional synthetic development cases, with no independent language review yet. It is a tuning result, not a new held-out benchmark or an estimate of production accuracy.

## Observed results

| Measure | Existing parser | Qwen3-4B control | Qwen3-4B candidate |
|---|---:|---:|---:|
| Complete drafts | 8/24 | 4/24 | 2/24 |
| Phone discrepancies | 4 | 4 | 8 |
| Quantity discrepancies | 7 | 8 | 2 |
| Price/delivery-fee discrepancies | 12 | 11 | 11 |
| Combined critical discrepancies | 23 | 23 | 21 |
| Failed requests under validation rules | 0 | 10 | 13 |
| Valid schema | 24/24 | 24/24 | 24/24 |
| Valid evidence | 22/24 | 14/24 | 11/24 |

The candidate has slightly fewer combined critical discrepancies, but the aggregate hides a doubling of phone errors. That tradeoff is unacceptable as a basis for promotion. Counts include omissions as well as incorrectly populated fields. All model failures here were evidence-validation failures; no request was excluded, retried, repaired or replaced with parser output. The parser's missing default evidence is reported separately under the existing scoring rules.

Both prompts used the same Qwen3-4B Q4_K_M artifact, pinned llama.cpp runtime, 8,192-token context, 2,048-output-token limit, 60-second deadline, seed 42, temperature 0.7 and unchanged scoring. Each had 24 scored cases plus two excluded warmups. The control prompt was byte-identical to v1. The candidate added explicit Myanmar correction vocabulary, pack classifiers, bundle-price rules and original-evidence instructions. No weights were fine-tuned. No held-out data was used in this experiment.

## What improved and what failed

- Candidate case 11 correctly interpreted three four-piece packs, keeping the pack contents in the description. Its note still disagreed with the label.
- Candidate case 13 correctly applied the quantity correction to three boxes, preserved package weight and recorded free delivery as zero. This was a complete draft.
- Both prompts retained the old phone in cases 16 and 17 despite explicit corrections. Candidate case 18 also chose a phone where the two unqualified conflicting numbers should remain unresolved.
- Candidate case 12 collapsed distinct colour variants, treated a bundle amount as a unit price, and interpreted an unspecified separate delivery fee as zero.
- Candidate evidence sometimes referenced nonexistent `color`/`size` fields, duplicated paths or altered original quotations. Schema-constrained JSON did not prevent these semantic errors.
- Complete-draft scoring also penalizes text differences such as township suffixes and variant wording. Review legitimate equivalent forms before the next dataset version. Do not change these labels or alternatives retroactively to improve this recorded score.

The unchanged parser remains useful for the familiar labeled formats (8 of 9 complete in the earlier diagnostic), but this does not justify automatic fallback: fallback behavior has not been evaluated as a system, and these models still make consequential mistakes.

## Measurements and reproducibility

Model warm p50/p95 were approximately **11.8/18.1 seconds** for control and **15.6/21.1 seconds** for candidate. Launch-to-completion wall times were approximately 311 and 402 seconds; summed warmup/scored request times were 309 and 400 seconds. These are single sequential runs on the existing M1 Pro, not controlled repeatability or service-level guarantees. Process RSS sampling is not total Metal/unified-memory usage. No stability repeats were run in this development A/B.

The [generated comparison](development-v2-prompt-ab.md) includes per-case mismatches; its JSON companion includes field metrics and error details. The local raw archive is outside Git at `~/.cache/fom-ai-evaluation/runs/development-v2-prompt-ab-01`. It includes both model runs, the baseline diagnostic, and the server log. Both owned inference processes exited; no llama-server process remained after completion.

From `tools/ai-evaluation`, regenerate the comparison with:

```bash
python -m development_v2.compare \
  "$HOME/.cache/fom-ai-evaluation/runs/development-v2-prompt-ab-01/qwen3-4b-control.json" \
  "$HOME/.cache/fom-ai-evaluation/runs/development-v2-prompt-ab-01/qwen3-4b-candidate.json" \
  --baseline "$HOME/.cache/fom-ai-evaluation/runs/development-v2-prompt-ab-01/baseline-development-v2.json"
```

This archive exists only on the measured Mac. A fresh checkout needs explicit local preparation and runs using the [development guide](../datasets/DEVELOPMENT-V2.md). Run records include source/configuration hashes, prompt text, machine details, runtime executable checksum and all failures. Regeneration checks the matching code snapshot; preserve it when starting another version.

## Next experiment

1. Obtain independent Myanmar review of the provisional labels, particularly compact price conventions, township equivalence, fulfillment notes and bundle representation.
2. Preserve this failed candidate. Design a new, shorter prompt with a few contrastive development examples: old versus corrected phone, conflict versus correction, bundle total versus unit price, and missing delivery versus explicit zero. Do not treat more instructions as automatically better.
3. Predeclare selection criteria that report each critical field separately. A reduction in quantity errors must not obscure a rise in wrong phone numbers or fabricated delivery fees.
4. Once development behavior is acceptable, freeze that separate configuration and author fresh held-out families. Keep all current cases, translations and paraphrases in development.
5. Representative voluntarily supplied anonymized shop messages and fluent language review remain required before a separately approved web pilot. No production endpoint, UI, database or mobile changes were made.
