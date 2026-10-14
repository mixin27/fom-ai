# Shorter contrastive prompt: development experiment

Do not promote this prompt; it fails the predeclared development comparison criteria.

Known synthetic cases with provisional labels, selected after earlier failures. This is development tuning, not independent quality evidence. The earlier control is reused; this is not an interleaved timing experiment. Both runs use the same model/runtime, schema, seed 42 and sampling configuration. Each includes 24 scored cases and two excluded warmups, with no stability repeats. Failed cases remain in the denominator.

| Prompt | Complete drafts | Failures | Phone errors | Quantity errors | Price errors | p50 / p95 ms |
|---|---:|---:|---:|---:|---:|---:|
| control | 4/24 | 10 | 4 | 8 | 11 | 11760.92 / 18125.95 |
| contrastive | 3/24 | 7 | 2 | 4 | 6 | 13016.27 / 21409.58 |

## Criteria set before inference

- phone_errors_not_higher: pass
- quantity_errors_not_higher: pass
- price_errors_not_higher: pass
- complete_drafts_not_lower: FAIL
- failures_not_higher: pass
- at_least_one_improvement: pass

Errors include omissions and disagreement with provisional gold. Each critical-field category must not regress; lower combined errors alone cannot satisfy selection. A passing development comparison still does not approve a pilot or establish generalization.

## Per-case results

| Case | Control complete | Contrastive complete | Remaining mismatches or validation failure |
|---|---|---|---|
| v2-dev-01 | False | False | customer.township |
| v2-dev-02 | False | False | customer.township, items.0.product_name, items.0.unit_price, note |
| v2-dev-03 | False | False | customer.name, customer.township, items.0.product_name, items.0.unit_price, items.1.product_name, items.1.unit_price |
| v2-dev-04 | True | False | invalid_evidence |
| v2-dev-05 | False | False | items.0.product_name, items.1.product_name, items.2.product_name |
| v2-dev-06 | True | True | — |
| v2-dev-07 | False | False | customer.name, customer.township, items.0.product_name, note |
| v2-dev-08 | False | False | customer.township |
| v2-dev-09 | False | False | customer.township |
| v2-dev-10 | False | False | customer.address, customer.name, delivery_fee, items.0.product_name, note |
| v2-dev-11 | False | False | note; invalid_evidence |
| v2-dev-12 | False | False | items.0.product_name, items.1.product_name, items.1.qty; invalid_evidence |
| v2-dev-13 | False | False | items.0.qty, note; invalid_evidence |
| v2-dev-14 | False | False | items.0.product_name, items.0.qty, items.1.product_name, note |
| v2-dev-15 | False | False | customer.address, customer.township, items.0.product_name, note; invalid_evidence |
| v2-dev-16 | False | False | note |
| v2-dev-17 | False | False | customer.phone |
| v2-dev-18 | False | False | invalid_evidence |
| v2-dev-19 | True | False | items.0.qty |
| v2-dev-20 | True | True | — |
| v2-dev-21 | False | False | items.0.product_name, items.0.unit_price; invalid_evidence |
| v2-dev-22 | False | True | — |
| v2-dev-23 | False | False | customer.phone, delivery_fee |
| v2-dev-24 | False | False | customer.address, items.0.product_name |

The contrastive prompt is preserved separately from the prior A/B. Labels, alternatives and scoring were not edited in response to outputs. Exact original evidence is still required; no repair, retry or fallback was used. Performance is Mac-specific and single-run; process RSS is not total Metal/unified memory. Review Myanmar labels and remaining critical errors before selecting a configuration for fresh held-out families or representative anonymized shop examples.
