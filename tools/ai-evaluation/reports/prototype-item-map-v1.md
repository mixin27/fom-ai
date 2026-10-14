# Current web prototype: development comparison

Known development cases with provisional, user-informed labels. No independent Myanmar review, fresh held-out evidence or production approval.

The prototype is scored after its validation and conservative price review policy. This measures the application extraction path, not raw model accuracy. No failed request is retried or replaced.

| Extractor | Complete / cases | Failed requests | Phone / qty / price errors | Total critical errors | p50 / p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 0/24 | 0 | 4 / 7 / 22 | 33 | 0.09 / 0.88 |
| prototype | 9/24 | 2 | 1 / 8 / 8 | 17 | 6239.8 / 9132.27 |

Critical errors count fields, including omissions and delivery fees. All failed requests remain in the denominator. Schema/evidence counts describe accepted outputs available to the scorer; rejected model JSON is not exposed by the API adapter.

Two model warmups are excluded. Model weights stay loaded; each adapter invocation starts Node anew, whose startup is excluded from service request latency and recorded separately in raw artifacts. This is a sequential Mac diagnostic, not a capacity test. RSS covers the inference process, not total Metal memory or the full application. One seed (42), no stability repeats.

## Results by language

| Extractor | Language | Complete / cases | Critical errors | Failures |
| --- | --- | ---: | ---: | ---: |
| baseline | en | 0/7 | 8 | 0 |
| baseline | mixed | 0/7 | 9 | 0 |
| baseline | my | 0/10 | 16 | 0 |
| prototype | en | 3/7 | 0 | 0 |
| prototype | mixed | 2/7 | 11 | 2 |
| prototype | my | 4/10 | 6 | 0 |

## Failure inventory

### baseline

Rejected requests: `{}`. Review warnings: 0 cases.

| Case | Rejection | Mismatched fields |
| --- | --- | --- |
| v2-dev-01 | — | items.0.unit_price |
| v2-dev-02 | — | items.0.unit_price |
| v2-dev-03 | — | items.0.unit_price |
| v2-dev-04 | — | customer.address, items.0.unit_price |
| v2-dev-05 | — | items.0.unit_price, items.2.unit_price |
| v2-dev-06 | — | items.0.unit_price |
| v2-dev-07 | — | items.0.unit_price |
| v2-dev-08 | — | items.0.unit_price |
| v2-dev-09 | — | items.0.unit_price |
| v2-dev-10 | — | customer.township, items.0.product_name, items.0.qty, items.0.unit_price |
| v2-dev-11 | — | customer.address, items.0.product_name, items.0.qty |
| v2-dev-12 | — | customer.name, items.0.product_name, items.0.unit_price, items.1.product_name, items.1.qty |
| v2-dev-13 | — | delivery_fee, items.0.product_name, items.0.qty |
| v2-dev-14 | — | customer.name, items.0.product_name, items.0.unit_price, items.1.product_name, items.1.qty, items.1.unit_price, note |
| v2-dev-15 | — | customer.address, customer.name, customer.township, items.0.product_name, items.0.qty, items.0.unit_price |
| v2-dev-16 | — | customer.phone, items.0.unit_price |
| v2-dev-17 | — | customer.phone |
| v2-dev-18 | — | customer.name, customer.phone, items.0.unit_price |
| v2-dev-19 | — | customer.name, items.0.qty, items.0.unit_price |
| v2-dev-20 | — | customer.name, items.0.unit_price |
| v2-dev-21 | — | customer.name |
| v2-dev-22 | — | customer.name |
| v2-dev-23 | — | customer.name, customer.phone, items.0.unit_price |
| v2-dev-24 | — | customer.name, customer.township, items.0.unit_price |
### prototype

Rejected requests: `{"unsupported_number": 2}`. Review warnings: 10 cases.

| Case | Rejection | Mismatched fields |
| --- | --- | --- |
| v2-dev-01 | — | customer.township |
| v2-dev-02 | — | customer.township, note |
| v2-dev-03 | — | customer.township |
| v2-dev-07 | AI_DRAFT_INVALID | customer.address, customer.name, customer.phone, customer.township, delivery_fee, items.0.product_name, items.0.qty, items.1.product_name, items.1.qty, items.1.unit_price |
| v2-dev-08 | — | customer.township |
| v2-dev-09 | — | customer.township |
| v2-dev-10 | — | customer.address, customer.name, customer.township, items.0.product_name, items.0.qty, items.0.unit_price, note |
| v2-dev-11 | — | items.0.unit_price, note |
| v2-dev-12 | — | items.0.product_name, items.0.qty, items.1.product_name, items.1.qty |
| v2-dev-13 | — | items.0.qty, items.0.unit_price |
| v2-dev-14 | — | items.0.unit_price, note |
| v2-dev-15 | — | customer.address, customer.township, items.0.product_name, items.0.qty, items.0.unit_price |
| v2-dev-16 | — | note |
| v2-dev-23 | AI_DRAFT_INVALID | items.0.product_name, items.0.qty, items.0.unit_price |
| v2-dev-24 | — | customer.address, customer.township |

## Interpretation

Use these failures to prioritize development and label review. Do not tune against these cases and describe a rerun as an independent benchmark. The next quality decision requires representative anonymized shop samples, reviewed labels and a fresh held-out set. The historical v1 reports remain unchanged.

The companion JSON contains language/scenario metrics, field precision/recall, missing-value metrics, default corrections, unsupported values, protocol hashes and machine details. It omits source messages, quotations and field values. Raw local results remain outside Git.
