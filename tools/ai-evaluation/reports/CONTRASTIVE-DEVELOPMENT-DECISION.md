# Shorter-prompt development decision

**Preserve this prompt as a useful experiment, but do not promote it.** It reduces each critical-error category compared with the archived control, yet fails the predeclared requirement that complete-draft accuracy must not decrease. No production parser, API, web or mobile behavior changed.

| Measure | Archived control | Shorter contrastive prompt |
|---|---:|---:|
| Phone discrepancies | 4 | 2 |
| Quantity discrepancies | 8 | 4 |
| Price/delivery discrepancies | 11 | 6 |
| Combined critical discrepancies | 23 | 12 |
| Complete drafts under current labels | 4/24 | 3/24 |
| Evidence-validation failures | 10 | 7 |

All 24 requests returned schema-valid responses. All seven failures were evidence-validation failures, not transport failures or timeouts. Every case remains in the scoring denominator. Two warmup requests were excluded. No output repair, retry or parser fallback was used. This was a single seed-42 development run on known provisional cases; it is not independent evidence of real shop quality, and no stability repeats were performed.

The shorter prompt was written after inspecting prior development failures. It used different synthetic values in four illustrative contrasts: explicit phone replacement versus unresolved conflict, bundle totals versus unit price, unknown delivery versus explicit free delivery, and pack contents versus ordered packs. It was then fixed for the entire run. The selection policy was saved and hashed before inference, rather than chosen to favor the observed result.

## Specific findings

- Case 16 now selects the corrected Myanmar phone, but repeats the correction text as an unwanted note. The mixed-language correction in case 17 still selects the old number.
- Case 12 leaves bundle unit price and unspecified delivery fee null, but collapses the two ordered variants into one item.
- Case 11 counts three packs correctly. Case 13 still retains the original quantity instead of applying the later correction.
- Case 23 populates the phone and zero delivery fee from the embedded malicious instruction. This violates the extraction boundary even though its JSON and quotations validate. It is another reason not to put this configuration into a customer workflow.
- Evidence errors remain: original quotations are changed, absent fields receive evidence, or evidence paths are duplicated. A JSON schema alone cannot establish semantic correctness.

## Label review before another experiment

The complete-draft metric is strict and includes text-equivalence decisions. It must not be read as “every other case is entirely unusable.” Several township-only mismatches are equivalent-looking suffix variants, such as `Sanchaung Tsp` versus `Sanchaung`. The existing dataset did not declare that alternative. The measured result stays unchanged; do not add alternatives retrospectively and relabel this run as a successful independent evaluation.

Use the [review worksheet](../datasets/REVIEW-V2.md) to review label conventions independently. A reviewed follow-up dataset should have its own version, reviewer decisions and hash. Human review is still pending; neither the fixture generator nor these tests claim fluent Myanmar review.

## Reproduction and boundaries

Read the [generated comparison](development-v2-contrastive.md) for the predeclared checks and every case's mismatched fields. Its JSON companion contains recomputed scores and hashes of the raw runs. The previous v1 benchmark and previous v2 prompt A/B remain reproducible and unchanged.

The local raw run is preserved outside Git at `~/.cache/fom-ai-evaluation/runs/development-v2-contrastive-01`. From `tools/ai-evaluation`:

```bash
python -m development_v2.contrastive.report \
  "$HOME/.cache/fom-ai-evaluation/runs/development-v2-prompt-ab-01/qwen3-4b-control.json" \
  "$HOME/.cache/fom-ai-evaluation/runs/development-v2-contrastive-01/qwen3-4b-contrastive.json"
```

A fresh checkout must explicitly prepare the pinned runtime/weights and run the commands in the development guide. Neither downloads nor inference run in CI. Model timings are specific to this Mac and sequential development run; the archived control was not rerun interleaved with the candidate. No timing or production-readiness guarantee is inferred.

Next work should resolve label conventions and obtain representative anonymized messages with independent language review before another frozen benchmark. Further prompt experiments may use this evidence as development feedback, but all these cases and their paraphrases remain development material. No new held-out benchmark or production pilot is approved by this result.
