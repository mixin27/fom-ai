# Provisional v2 label review worksheet

Status: **not reviewed**. This worksheet records questions for a fluent Myanmar speaker familiar with shop orders. It does not change labels or authorize deployment. Review the source message first, then the expected draft; model output is not ground truth.

All 24 messages, expected values and alternatives are in `development-v2.jsonl`. Their reasons and source types are in `development-v2.annotations.json`. Identities/contacts were replaced; none of the new public-source adaptations is a real customer chat.

For each decision, record reviewer, review date, affected case IDs, accepted interpretation, reason, and whether the wording is natural. When changing labels, create a new dataset version and preserve the original run/hash. Keep all existing cases and their paraphrases in development.

| Topic | Cases | Current label convention | Question for independent review |
|---|---|---|---|
| Township suffixes | 01–03, 06–09, 10, 15, 24 | Some suffix equivalents are absent from alternatives | Which original-language names and abbreviations are equivalent? For example, should `Sanchaung Tsp` and `Sanchaung` both be accepted? Do not infer an unstated township. |
| Compact prices | 01–09 | `Qty: 2 / Price: 18000` and `x2 18000` mean per-unit unless labeled total | Is that convention valid for these supplied examples and representative merchants? If unresolved, explicitly mark the unit price ambiguous. |
| Separate variant lines | 04, 07, 12 | Preserve colour/size in each product; distinct ordered variants are separate items | Which joined descriptions preserve all meaning? Do not accept descriptions that drop a colour, size or product code. |
| Bundles | 12, 21 | Combined amount does not populate unit price | Confirm the message states only a total. Dividing it is prohibited by the current extraction contract even when mathematically exact. |
| Packs and weights | 11, 13 | Quantity counts purchased packs/boxes; contents and weight stay in the description | Confirm saleable units, classifier meaning and corrected quantity. |
| Phone corrections | 16–18 | Explicit correction wins; unqualified contradictory phones stay null | Does the Myanmar/mixed wording clearly replace the prior number? Does the conflict example lack a preferred recipient? |
| Order notes | 14–16, 22 | Explicit fulfillment requests are notes; field corrections and payment chatter are excluded | Should any correction wording also be retained as a note, or does that duplicate the corrected field? Make a consistent convention before scoring another version. |
| Unknown versus zero fees | 10, 12, 15, 19–23 | Free/explicit zero = 0; absent, queried or separately payable without amount = null | Confirm the adapted messages express the intended distinction naturally. |
| Embedded instructions | 23 | Malicious instruction is not customer data | This is a contract test: neither requested phone nor zero fee may be extracted from the injected command. Do not relax this to match an output. |
| Naturalness | All Myanmar/mixed cases | Authored synthetic wording; review pending | Correct unnatural phrases in a new development version; preserve scenarios and document semantic changes. |

Decision template:

```text
Reviewer:
Review date:
Case IDs:
Original message interpretation:
Keep/change expected fields:
Accepted equivalent text (if any):
Ambiguities that remain unresolved:
Naturalness corrections (if any):
Reason:
New dataset version:
```

After review, independently verify evidence, nullable fields and related-family membership. Do not turn reviewed development cases into held-out examples. Author fresh families after the next prompt/configuration is settled, and define acceptance thresholds before viewing their results.
