# Qwen3-4B v2 prompt development

Known synthetic development cases with provisional labels. This is prompt tuning, not independent held-out evidence. No production readiness claim follows from this comparison.

Control uses the unchanged v1 prompt. Candidate uses explicit correction, pack/variant, missing-value and original-quotation instructions. Model, runtime, schema, scoring, temperature and seed are identical between model runs. There are 24 scored requests per variant, two excluded warmups, and no stability repeats in this small development experiment. Failed requests remain in the denominator.

| Extractor/prompt | Complete drafts | Failures | Phone errors | Quantity errors | Price errors | p50 / p95 ms |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 8/24 | 0 | 4 | 7 | 12 | 0.09 / 0.83 |
| control | 4/24 | 10 | 4 | 8 | 11 | 11760.92 / 18125.95 |
| candidate | 2/24 | 13 | 8 | 2 | 11 | 15562.33 / 21052.13 |

Discrepancies include omissions and disagreement with provisional labels. Baseline defaults are distinguished in JSON. Timings are specific to this Mac and sequential run; model timing includes token checks and validation while parser timing measures its parsing function, so these are not equivalent end-to-end service measurements.

## Case review

| Case | Control complete | Candidate complete | Candidate mismatched fields |
|---|---|---|---|
| v2-dev-01 | False | False | customer.township |
| v2-dev-02 | False | False | customer.address, customer.name, customer.phone, customer.township, items.0.product_name |
| v2-dev-03 | False | False | customer.address, customer.name, customer.township, items.0.product_name |
| v2-dev-04 | True | False | items.0.product_name, items.1.product_name |
| v2-dev-05 | False | False | items.0.product_name, items.1.product_name, items.2.product_name |
| v2-dev-06 | True | True | — |
| v2-dev-07 | False | False | customer.address, customer.name, customer.phone, customer.township, items.0.product_name, note |
| v2-dev-08 | False | False | customer.township |
| v2-dev-09 | False | False | customer.township |
| v2-dev-10 | False | False | customer.address, customer.name, customer.phone, delivery_fee, items.0.product_name, note |
| v2-dev-11 | False | False | note |
| v2-dev-12 | False | False | delivery_fee, items.0.product_name, items.0.unit_price, items.1.product_name, items.1.qty, note |
| v2-dev-13 | False | True | — |
| v2-dev-14 | False | False | note |
| v2-dev-15 | False | False | customer.address, delivery_fee, items.0.product_name, note |
| v2-dev-16 | False | False | customer.phone, delivery_fee |
| v2-dev-17 | False | False | customer.phone, delivery_fee |
| v2-dev-18 | False | False | customer.phone, delivery_fee |
| v2-dev-19 | True | False | items.0.qty |
| v2-dev-20 | True | False | invalid_evidence |
| v2-dev-21 | False | False | items.0.unit_price |
| v2-dev-22 | False | False | customer.phone, delivery_fee |
| v2-dev-23 | False | False | customer.phone, delivery_fee |
| v2-dev-24 | False | False | customer.address, delivery_fee, items.0.product_name |

A better development score is a reason to retain a candidate for review, not evidence of generalization. Review Myanmar labels and ambiguity conventions, then define thresholds and create new held-out families after the development configuration is settled. Real anonymized shop examples and independent language review remain necessary before a pilot.
