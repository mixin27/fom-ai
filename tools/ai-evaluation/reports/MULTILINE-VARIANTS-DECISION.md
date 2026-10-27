# Labelled variants beside multiline addresses

Measured on 23 October 2026. This is a narrow extraction correctness fix, not model training or production approval.

## Cause and change

The labelled item map previously declined an entire message when it encountered an unlabelled geography line after `Address:` or `လိပ်စာ:`. Without the map, the model could omit separately labelled color/size values. The local portal check reproduced this with a Myanmar cotton shirt, white color, size L and a two-line address.

The map now accepts only continuation lines already recognized by the existing single labelled-address policy. It retains original line indices, closes the previous item at the address boundary, and rejects alternatives/negations on the continuation. Unknown text, extra unlabelled products, orphan attributes and recognized corrections still prevent a partial item map. The address policy itself, model weights, prompt text, numeric ambiguity rules and baseline parser are unchanged. The generated schema now includes the existing item constraints for this supported combined format.

The constrained product is `ချည်သားအင်္ကျီ (အဖြူ, Size L)` with exact evidence from the product, color and size lines. Missing/ambiguous prices remain null and explicit zero remains zero. Unsupported formats still rely on model interpretation and human review; declining a map is not a guarantee of safe or correct interpretation.

## Verification

- The regression test first reproduced four failures, including acceptance of a dropped variant. After the fix, all 13 new cases pass: Myanmar/English addresses, CRLF and blank lines, item boundaries, exact evidence, dropped/crossed variants, unknown/extra products, ambiguous geography and correction text.
- Typecheck, build, 250 TypeScript tests, 70 Python tests and the public-content guard passed.
- The actual FOM Platform client → authenticated FOM AI service → native Metal model → web form adapter passed five synthetic checks with the strengthened Myanmar product-name assertion. The Myanmar case preserved the color and size, took 11.670 seconds and returned 12 evidence entries, versus 10 before the fix. No order or database write occurred.
- Other integration timings were English 5.212 s, mixed 10.026 s, ambiguous price 5.787 s and corrections 6.773 s. Startup was 1.223 s; sampled model RSS peaked at 4,089,643,008 bytes. These five sequential checks had no separate warmup and are not latency benchmarks. RSS excludes wrapper/client and total Metal allocation. Owned processes and temporary secrets were cleaned up.
- The integration run used FOM AI parent commit `162877a` plus this source patch and FOM Platform parent `1ca00fc1` plus the verification scripts. The platform's unrelated Next.js update is not an extraction change. This follow-up exercised the real web adapter, not a new browser session; browser automation was disabled after the preceding browser check.

## Existing development set

The full 24-case comparison used the existing frozen labels, seed 42 and two excluded warmups. The exact source hashes are in the companion JSON. Both baseline and prototype per-case completion, rejection and mismatched-field results are unchanged from the compact slash-item run.

| Metric | Previous compact batch | This batch |
| --- | ---: | ---: |
| Complete drafts | 19/24 | 19/24 |
| Rejected requests | 1 | 1 |
| Phone / quantity / price errors | 0 / 2 / 2 | 0 / 2 / 2 |
| Critical-field errors | 4 | 4 |
| Request p50 / p95 | 6.83 / 9.06 s | 6.54 / 8.94 s |

The browser reproduction is outside that 24-case set and was checked separately; this report does not claim a new 20/25 score or improved held-out accuracy. The same known errors remain: colonless customer labels, township interpretation, fulfillment/payment notes, conversational corrections and the numeric-evidence rejection. Timing differences are not evidence of a speed improvement.

- [Generated comparison and failure inventory](multiline-variants-v1.md)
- [Aggregate metrics and source fingerprints](multiline-variants-v1.json)
- [Previous decision](COMPACT-SLASH-DECISION.md)

Raw data/runtime logs remain outside Git at `~/.cache/fom-ai-evaluation/runs/multiline-variants-20261023-01`. Only aggregate reports are tracked. Report regeneration verified the current source fingerprint; no historical report or frozen manifest was overwritten. Reproduce with matching sources and a new output directory:

```bash
source .venv/bin/activate
cd tools/ai-evaluation
python -m prototype_eval run --output "$HOME/.cache/fom-ai-evaluation/runs/multiline-variants-NEW-RUN"
```

For cross-repository integration, run `../fom-ai/.venv/bin/python scripts/check_ai_service.py` from FOM Platform. Its smoke assertions now include the Myanmar variant; they still do not score every field in every sample.

Independent Myanmar review, representative anonymized messages, fresh held-out families, stability checks and suitable-host capacity qualification remain required before a customer pilot. No public service, deployment, model training, fallback, retry or automatic order creation was added.
