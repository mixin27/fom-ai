# FOM AI extraction: decision from synthetic v1

**Continue evaluating Qwen3-4B. Do not integrate either model into the product yet.** Qwen3-1.7B did not improve on the existing parser in this experiment. Qwen3-4B substantially improved extraction, but its remaining errors and latency require another evaluation before a web pilot.

## What was measured

The unchanged parser and both pinned Q4_K_M models each processed all **120 held-out messages**: 40 English, 40 Myanmar and 40 mixed-language messages. Each also repeated 20 fixed cases at two additional seeds, producing 40 stability observations. Two separate development warmups preceded each model's scored run. No failed scored request was repaired, retried or replaced with the parser's answer.

| Extractor | Complete drafts | Phone / quantity / price errors | Critical errors total | Invalid responses | Median / p95 request time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Existing parser | 31/120 (25.8%) | 6 / 22 / 56 | 84 | 0 | 0.05 / 0.43 ms |
| Qwen3-1.7B | 28/120 (23.3%) | 5 / 28 / 84 | 117 | 67 | 5.04 / 9.56 s |
| Qwen3-4B | 77/120 (64.2%) | 12 / 10 / 8 | 30 | 26 | 10.58 / 18.71 s |

A critical error is a **field error**, not a count of affected orders. Price includes delivery fee. Counts include omissions and wrong populated values. Complete-draft success requires every expected field, correct item count and valid evidence; valid JSON alone is insufficient.

The 1.7B failures were 66 evidence failures and one output-limit failure. All 26 4B failures were evidence failures. There were no measured request timeouts. For a failed response that still contains a structurally valid draft, field precision/recall remains useful diagnostic information, but the response cannot earn complete-draft credit. For malformed or truncated responses without a usable draft, expected facts count as missed.

The parser explicitly identified 15 defaults that needed correction. These remain in its semantic score, but are reported separately from unsupported nondefault values. Defaults do not receive invented quotations. This is why the parser has 105 fully evidenced responses while its execution/validation failure count is zero.

## Why 4B is the next candidate

Compared with the parser, 4B reduced aggregate critical errors from 84 to 30 and increased complete drafts from 31 to 77. Its complete-draft counts were 25/40 English, 24/40 Myanmar and 28/40 mixed. These are balanced synthetic results, not production language-quality estimates.

Phone handling still prevents a rollout recommendation. Of 4B's 12 phone errors, **10 were omissions and two retained an obsolete number after an explicit correction**. The two wrong numbers occurred in Myanmar and mixed-language versions of the correction family. The parser's six phone errors and 1.7B's five were wrong populated values rather than omissions. A required-field check can expose a missing phone; a plausible old number is more dangerous because it can pass that check.

Other representative findings:

- The existing parser missed some natural-language free-shipping statements and Myanmar unit-price labels, retained earlier values after corrections, and defaulted missing quantities to one.
- The 1.7B model often populated a delivery fee when none was stated, supplied incomplete source evidence, and reached the output limit on one mixed-language injection-only message.
- The 4B model was more reliable with multiple items and variants, but sometimes omitted populated fields or failed to quote the original message correctly. A quote's presence still does not prove its interpretation is correct.

On the repeatability subset, draft/error outcomes changed in **0/40** baseline repeats, **8/40** 1.7B repeats and **2/40** 4B repeats relative to seed 42. This is a small stability check, not a guarantee of deterministic inference. The 4B repeats included seven evidence failures; the 1.7B repeats included 22.

## Limits of this evidence

- All messages are synthetic, built from 60 authored families with related language renderings kept together. Shared field labels, repeated identities and constrained product vocabulary limit diversity. The labels and Myanmar wording have not received independent fluent-speaker review.
- The held-out set has **no populated township labels**. Township recall is therefore not established by this benchmark; development smoke tests covered township extraction, and held-out scoring covers missing-township behavior only. Add positive township cases and more varied natural addresses in the next evaluation version.
- Exact text scoring with documented normalization and alternatives can reject valid paraphrases. Repeated language renderings are related observations, not 120 independent real-shop interactions.
- Anonymized shop examples remain required. Synthetic success must not be treated as permission to collect customer messages or enable AI in production.
- All performance numbers apply to this M1 Pro, 16 GiB Mac. Sampled peak process RSS was about **3.32 GiB** for 1.7B and **4.43 GiB** for 4B. RSS does not capture total unified-memory pressure or precise Metal allocation. The parser's approximately 255 MiB figure includes its Node/pnpm evaluation process tree, not incremental production parser memory.
- Launch-to-health startup was approximately 0.58 s for 1.7B and 0.69 s for 4B with normal filesystem caches. The parser's initial process-startup estimate was 1.32 s. These are different execution paths.
- The 4B run's recorded wall span was approximately **94 minutes**, while its request timers summed to **30 minutes**. The cause of the unmeasured gap was not verified. Use the recorded request samples for this comparison; this was not a controlled continuous-throughput, thermal or production-capacity benchmark. Repeat performance measurements in a controlled awake session before setting a service-level target.

## Next evaluation and proposed web pilot

1. Manually prepare representative, anonymized shop messages with independent Myanmar-language label review. Include corrected contacts, positive township/address cases, natural conversational phrasing, incomplete orders and real variant conventions. Keep related conversations/templates in the same split.
2. Create a new evaluation version with a fresh held-out set before tuning. Investigate the 4B contact-correction and evidence failures using development cases only. Keep the current parser as a measured comparator; parser improvements would also require a separately identified version.
3. Establish acceptable phone/quantity/price error rates and interaction latency before requesting pilot approval. Do not select thresholds after seeing held-out results.
4. If a separately approved pilot becomes justified, start with an explicit **Extract draft** action in the web portal. Show editable extracted fields, missing values and evidence, and require confirmation through the existing order-creation flow.
5. NestJS must retain permission, tenant, subscription and lifecycle enforcement. Customer matching must remain server-side and must respect archived-customer restoration rules. Model output must never choose database IDs or trigger sending, payment changes or order creation by itself.

There is no production AI service, endpoint, automatic fallback, mobile AI feature or infrastructure deployment in this delivery.

## Reproduction and files

- [Setup and commands](../README.md)
- [Generated comparison and synthetic failures](synthetic-v1.md)
- [Full grouped JSON metrics and frozen protocol](synthetic-v1.json)
- [Machine, Node/lockfile versions and measurement notes](environment.json)

Raw responses and server logs were preserved locally under `~/.cache/fom-ai-evaluation/runs/synthetic-v1`, outside Git. Both owned inference processes exited. The deterministic suite passed **21 Python tests** and **12 parser/parity tests**. No unrelated application tests were changed or suppressed; this evaluation did not rerun the full application suite.
