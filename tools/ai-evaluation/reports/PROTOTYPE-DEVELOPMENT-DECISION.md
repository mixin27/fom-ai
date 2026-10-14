# Current prototype: reliability work before expanding the service

Measured 12 October 2026. **Keep the current AI workflow local and reviewed. Prioritize corrected contacts, item separation/variants and Myanmar quantities before adding more AI features or production infrastructure.**

This batch closes the measurement gap between the five smoke cases and the actual web extraction service. It introduces an adapter that calls `AiDraftService.extract` without bootstrapping NestJS or accessing a database. No application prompt, model, validation policy or parser behavior was changed for this run.

## What the current service produced

| Measure | Existing parser | Current AI prototype |
| --- | ---: | ---: |
| Complete drafts | 0/24 | 6/24 |
| Failed requests | 0 | 2 |
| Phone errors | 4 | 3 |
| Quantity errors | 7 | 10 |
| Unit-price/delivery-fee errors | 22 | 9 |
| Total critical field errors | 33 | 22 |
| Request p50 / p95 | 0.09 / 0.79 ms | 6.14 / 9.58 s |

These are the **known `development-v2-r1` examples with provisional labels**, not a fresh held-out test. Related formats have already influenced development. Scores cannot be compared directly with historical v1 or v2 totals, whose labels/configurations differ.

In particular, all nine supplied-format cases contain unqualified prices that the revised labels intentionally leave unknown for multi-unit quantities. The unchanged rule parser fills those prices. That contributes to its zero complete-draft count; it does not mean every field in its drafts is wrong. Complete-draft matching also includes names, addresses, descriptions and notes.

The prototype is measured **after the conservative price review policy**, which emitted warnings in 10 cases. Its lower price-error count must not be presented as raw model accuracy or proof that withholding never removes a correct suggestion. Two responses were rejected for unsupported numbers; they remain scored as failed requests with their expected facts missing. The adapter does not retain rejected raw model outputs.

## Observed priorities

1. **Corrected phone selection:** cases 16 and 17 retained the earlier number despite a later correction. The number exists in the source, so digit/evidence validation alone cannot detect the wrong selection. Case 16 also copied correction instructions into the note. This is a business-critical failure even though its JSON validates.
2. **Item separation and variants:** case 5 collapsed three comma-separated products into one description. Case 4 dropped separately stated colors/sizes. Case 12 lost the distinction between two variants. These failures explain why a lower combined error count hides worse quantity results.
3. **Myanmar quantity/price interpretation:** case 13 kept the original quantity of two rather than the corrected three. Several explicit-price cases returned null; inspect whether each omission comes from extraction or conservative withholding before changing either rule. Quantities expressed as words also need better coverage.
4. **Address completeness and field boundaries:** case 24 kept only the street line, losing township/city. In the more conversational case 10, product text became customer name/address. A source quotation proves presence, not that it belongs in the chosen field.
5. **Notes and label review:** some outputs included payment chatter instead of fulfillment instructions. Review exact text alternatives and township conventions independently. Do not relax labels retrospectively to make this run look better.

The next implementation batch should work on these bounded development failures and add contrast cases: corrections versus unresolved conflicts, quantities versus pack contents, one item versus separate variants, and address continuation versus unrelated text. Preserve the original message and explicit uncertainty. No automatic creation or silent replacement of uncertain facts is justified by this evidence.

Before model promotion, representative anonymized shop messages and independent Myanmar-language review are still needed. After development, freeze the candidate and evaluate fresh held-out families. Stronger self-hosted model comparisons or fine-tuning remain options to measure, not assumed solutions or activities completed in this batch.

## Measurement limits

- A single seed-42 run, 24 scored cases and two excluded model warmups. No failed request was retried or replaced. No stability repeats.
- The runtime stayed loaded; each request used a fresh Node adapter process. Service request timing excludes that process startup; raw artifacts separately record adapter wall time. These are Mac development timings, not production capacity or latency guarantees.
- Inference launch-to-health was 1.63 seconds. Overall run spanned approximately 3 minutes 30 seconds, including baseline, startup, warmups and adapter overhead. Foreground development checks also occurred; this was not an isolated performance benchmark.
- RSS is sampled inference-process memory, not total Metal/unified-memory pressure. Parser process-tree memory has a different scope.
- No source messages, quotations or field values are included in the tracked comparison JSON/Markdown. Raw accepted service results and runtime logs are local, outside Git.
- No production database, order creation, cloud inference, new model download, fine-tuning or application deployment was performed.

## Reproduce and inspect

- [Commands and measurement contract](../prototype_eval/README.md)
- [Generated comparison and failure inventory](prototype-development-v1.md)
- [Metrics, groups, protocol hashes and machine details](prototype-development-v1.json)

The local archive is `~/.cache/fom-ai-evaluation/runs/prototype-development-v1-20261012-01`. Regenerate the comparison with the documented `prototype_eval report` command while the recorded source hashes still match. Later changes require a new run directory. Frozen v1 and its historical reports remain intact.
