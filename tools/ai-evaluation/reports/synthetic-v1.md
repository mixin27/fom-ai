# FOM extraction evaluation — synthetic v1

**Provisional: synthetic data, no native-language review or representative shop sample.**

All 120 held-out requests are included. Failed requests miss expected facts; complete-draft accuracy requires a valid response and every expected field. Parser defaults remain in the draft and incorrect defaults are counted separately. Evidence validity measures quotation provenance, not whether the quoted text was interpreted correctly.

| Extractor | Failures / 120 | Schema valid | Evidence valid | Complete drafts | Critical errors | Item count correct | Warm p50 / p95 ms | Peak RSS MiB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 0 | 120 | 105 | 31 | 84 | 116 | 0.05 / 0.43 | 255 |
| qwen3-1.7b | 67 | 119 | 53 | 28 | 117 | 51 | 5037.64 / 9564.27 | 3403 |
| qwen3-4b | 26 | 120 | 94 | 77 | 30 | 92 | 10576.58 / 18711.83 | 4532 |

## Recommendation

Observed ranking: **qwen3-4b → baseline → qwen3-1.7b**. Ranking prioritizes phone/quantity/price errors (including omissions), then complete drafts, failures and latency.

**Neither model is approved for a production pilot on this evidence.** Use the best measured candidate only as the starting point for a new, separately versioned evaluation with anonymized shop messages and Myanmar-language label review. No production fallback or automatic order creation is justified.

## Critical errors and language breakdown

| Extractor | Phone | Quantity | Price/fee | Unsupported populated values | Incorrect parser defaults |
|---|---:|---:|---:|---:|---:|
| baseline | 6 | 22 | 56 | 88 | 15 |
| qwen3-1.7b | 5 | 28 | 84 | 161 | 0 |
| qwen3-4b | 12 | 10 | 8 | 29 | 0 |

| Extractor | Language | Failures | Complete / 40 | Critical errors |
|---|---|---:|---:|---:|
| baseline | en | 0 | 13 | 16 |
| baseline | my | 0 | 3 | 52 |
| baseline | mixed | 0 | 15 | 16 |
| qwen3-1.7b | en | 22 | 13 | 35 |
| qwen3-1.7b | my | 20 | 4 | 44 |
| qwen3-1.7b | mixed | 25 | 11 | 38 |
| qwen3-4b | en | 11 | 25 | 11 |
| qwen3-4b | my | 7 | 24 | 10 |
| qwen3-4b | mixed | 8 | 28 | 9 |

## Field precision / recall

| Extractor | Field | Precision | Recall | Correct missing / missing |
|---|---|---:|---:|---:|
| baseline | customer.address | 23.7% | 75.0% | 82/108 |
| baseline | customer.name | 91.9% | 97.1% | 9/15 |
| baseline | customer.phone | 94.4% | 94.4% | 12/12 |
| baseline | customer.township | N/A | N/A | 120/120 |
| baseline | delivery_fee | 81.8% | 81.8% | 84/87 |
| baseline | items.product_name | 95.0% | 97.8% | 0/4 |
| baseline | items.qty | 84.2% | 97.5% | 0/19 |
| baseline | items.unit_price | 89.2% | 63.2% | 18/22 |
| baseline | note | 100.0% | 100.0% | 114/114 |
| qwen3-1.7b | customer.address | 26.5% | 75.0% | 37/108 |
| qwen3-1.7b | customer.name | 96.2% | 97.1% | 6/15 |
| qwen3-1.7b | customer.phone | 95.4% | 96.3% | 6/12 |
| qwen3-1.7b | customer.township | 0.0% | N/A | 53/120 |
| qwen3-1.7b | delivery_fee | 32.7% | 97.0% | 9/87 |
| qwen3-1.7b | items.product_name | 91.8% | 100.0% | 0/12 |
| qwen3-1.7b | items.qty | 80.7% | 97.5% | 0/27 |
| qwen3-1.7b | items.unit_price | 86.3% | 96.6% | 2/30 |
| qwen3-1.7b | note | 71.4% | 83.3% | 52/114 |
| qwen3-4b | customer.address | 90.0% | 75.0% | 86/108 |
| qwen3-4b | customer.name | 99.0% | 90.5% | 10/15 |
| qwen3-4b | customer.phone | 98.0% | 88.9% | 10/12 |
| qwen3-4b | customer.township | N/A | N/A | 94/120 |
| qwen3-4b | delivery_fee | 86.1% | 93.9% | 64/87 |
| qwen3-4b | items.product_name | 97.1% | 100.0% | 0/4 |
| qwen3-4b | items.qty | 92.2% | 98.3% | 11/19 |
| qwen3-4b | items.unit_price | 98.3% | 99.1% | 13/22 |
| qwen3-4b | note | 60.0% | 100.0% | 85/114 |

## Failures, startup and repeatability

- **baseline:** failure categories `{}`; cold startup ms `[]`; changed repeat outputs 0/40; repeat failures 0.
- **qwen3-1.7b:** failure categories `{"invalid_evidence": 66, "truncated_or_nonstop_output": 1}`; cold startup ms `[584.64]`; changed repeat outputs 8/40; repeat failures 22.
- **qwen3-4b:** failure categories `{"invalid_evidence": 26}`; cold startup ms `[694.09]`; changed repeat outputs 2/40; repeat failures 7.

## Representative synthetic failures

### baseline

**s21-en** — semantic mismatch

```text
Name: May Sample
Phone: 09000123456
Product: Cotton shirt
Qty: 4
Unit price: 7500
Shipping is free for this order.
```
```json
[
  {
    "field": "delivery_fee",
    "expected": 0,
    "actual": null,
    "baseline_default": false
  }
]
```

**s21-my** — semantic mismatch

```text
နာမည်: မေစမ်းသပ်
ဖုန်း: ၀၉၀၀၀၁၂၃၄၅၆
ပစ္စည်း: ချည်အင်္ကျီ
အရေအတွက်: ၄
တစ်ခုဈေး: ၇၅၀၀
ဒီအော်ဒါအတွက် ပို့ခအခမဲ့ပါ။
```
```json
[
  {
    "field": "delivery_fee",
    "expected": 0,
    "actual": null,
    "baseline_default": false
  },
  {
    "field": "items.0.unit_price",
    "expected": 7500,
    "actual": null,
    "baseline_default": false
  }
]
```

**s21-mixed** — semantic mismatch

```text
Name: မေ Sample
ဖုန်း: 09000123456
Product: Cotton အင်္ကျီ
အရေအတွက်: 4
Unit price: 7500
ဒီ order shipping free ပါ။
```
```json
[
  {
    "field": "delivery_fee",
    "expected": 0,
    "actual": null,
    "baseline_default": false
  }
]
```

### qwen3-1.7b

**s21-my** — semantic mismatch

```text
နာမည်: မေစမ်းသပ်
ဖုန်း: ၀၉၀၀၀၁၂၃၄၅၆
ပစ္စည်း: ချည်အင်္ကျီ
အရေအတွက်: ၄
တစ်ခုဈေး: ၇၅၀၀
ဒီအော်ဒါအတွက် ပို့ခအခမဲ့ပါ။
```
```json
[
  {
    "field": "customer.address",
    "expected": null,
    "actual": "ဒီအော်ဒါအတွက်",
    "baseline_default": false
  }
]
```

**s21-mixed** — invalid_evidence

```text
Name: မေ Sample
ဖုန်း: 09000123456
Product: Cotton အင်္ကျီ
အရေအတွက်: 4
Unit price: 7500
ဒီ order shipping free ပါ။
```
```json
[
  {
    "field": "note",
    "expected": null,
    "actual": "ဒီ order shipping free ပါ။",
    "baseline_default": false
  }
]
```

**s22-en** — invalid_evidence

```text
Name: May Sample
Phone: 09000123456
Product: Tea pack
Qty: 4
Total for all four packs: 20000 MMK
```
```json
[]
```

### qwen3-4b

**s22-my** — invalid_evidence

```text
နာမည်: မေစမ်းသပ်
ဖုန်း: ၀၉၀၀၀၁၂၃၄၅၆
ပစ္စည်း: လက်ဖက်ထုပ်
အရေအတွက်: ၄
လေးထုပ်လုံးအတွက် စုစုပေါင်း ၂၀၀၀၀ ကျပ်
```
```json
[]
```

**s22-mixed** — invalid_evidence

```text
Name: မေ Sample
ဖုန်း: 09000123456
Product: Tea ထုပ်
အရေအတွက်: 4
4 ထုပ်လုံး total 20000 MMK
```
```json
[]
```

**s23-en** — invalid_evidence

```text
Name: May Sample
Phone: 09000123456
Product: Canvas bag
Qty: 1
Unit price: 24000
Product: Tea pack
Qty: 2
Unit price: 5000
Cancel the tea packs; keep only the bag.
```
```json
[]
```

## Measurement and interpretation limits

- Synthetic recipes were authored independently of parser output. Sixty translated families stay wholly within one split. Shared labels and constrained vocabulary make this easier than real conversations; translations are not independent samples. Myanmar and mixed-language labels need fluent review.
- Text comparison normalizes Unicode, Myanmar numerals, punctuation and whitespace, with explicit alternatives. It does not use another model as a judge. Semantic paraphrases can still be marked wrong. Item alignment uses deterministic minimum-cost matching, prioritizing product name, then quantity/price.
- Failed/malformed/truncated requests stay in the denominator. Structurally valid drafts with invalid evidence retain diagnostic field scores, but cannot earn complete-draft credit. Baseline defaults do not require fabricated quotations; their missing evidence is reported and incorrect values count as corrections.
- Warm latency includes local template rendering, token preflight, inference and validation for models; baseline latency times only the existing parser. The extra model overhead is intentional and small, but these are different execution paths. Failed requests are included in latency; token usage is unavailable for transport failures.
- RSS is sampled every 100 ms using macOS `ps`; it is a process high-water estimate across the run, not total unified-memory/GPU consumption. Startup is process launch to healthy, not filesystem-cache eviction. Baseline startup is an estimate; baseline RSS sums the pnpm/Node process tree every 50 ms, including startup. All timings apply only to this Mac under its concurrent desktop workload.
- Two development warmups precede scoring. Twenty fixed held-out cases repeat with seeds 43 and 44; exact draft/error changes are counted, not merely accuracy changes. Do not tune on these failures and call a rerun independent evidence.
- See the JSON report for every scenario, token totals, machine details and frozen file hashes. Raw generations remain outside Git.

## Future web pilot proposal

After anonymized-shop evaluation and separate approval, expose an explicit Extract draft action in the web portal. NestJS remains responsible for tenant scope, permissions, plan/lifecycle checks and archived-customer matching. Show editable fields, missing values and evidence; require the user to confirm before the existing order-creation flow. No automatic sending, matching IDs from model output, hidden fallback, new mobile features or autonomous actions. Define cost/latency limits and a kill switch in that separate pilot plan.
