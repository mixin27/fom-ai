# Colonless customer labels and payment-only notes

The development comparison was measured on 23 October 2026. The platform integration follow-up was measured on 24 October. This changes extraction constraints and validation, not model weights or training.

## Change and boundaries

The compact Myanmar example previously included the name/address labels in extracted values, selected the wrong township boundary, and copied a payment-only statement into the fulfillment note. Its item and numeric fields were already correct.

A narrow customer-name policy now recognizes a single colonless English/Myanmar name label when the message also has a complete recognized item map. Duplicate labels, recognized corrections, alternatives and instruction-like names decline the constraint. The address policy accepts colonless, numbered addresses with a labelled product, keeps exact original source lines, and stops at recognized business-field labels. Only an explicit township marker supplies a township; an unmarked final address word is not guessed.

The note policy can now account for those recognized customer, address, phone, fee and item lines before excluding an exact payment-only statement. It retains explicit fulfillment notes and declines to erase unknown prose or mixed payment/fulfillment text. This does not solve arbitrary conversational corrections or free-form payment instructions.

Source facts constrain the prompt and JSON schema before generation. Exact evidence is still validated afterward. Ambiguous prices remain null, explicit zero remains zero, and no repair, retry, parser fallback or automatic order write was added. The baseline parser and dataset labels are unchanged. FOM Platform receives these policies only in service mode; its legacy local extraction copy is unchanged.

## Measured development comparison

| Metric | Previous multiline batch | This batch |
| --- | ---: | ---: |
| Complete drafts | 19/24 | 20/24 |
| Rejected requests | 1 | 1 |
| Phone / quantity / price errors | 0 / 2 / 2 | 0 / 2 / 2 |
| Critical-field errors | 4 | 4 |
| Unsupported populated values | 5 | 1 |
| Warm request p50 / p95 | 6.54 / 8.94 s | 6.53 / 8.97 s |

Only `v2-dev-07` changed its scored outcome: name, address, township and note now match, making the draft complete. All other prototype and baseline per-case outcomes are unchanged. Remaining cases are `v2-dev-09` (unmarked township), `v2-dev-14` (fulfillment/payment note), `v2-dev-15` (conversational address correction and item fields), and `v2-dev-23` (numeric-evidence rejection). Rejected requests remain in the denominator.

This reused development set is not independent held-out evidence. Labels remain provisional. The run used the cached Qwen3-4B Q4_K_M model, pinned native Metal runtime, seed 42 and two excluded warmups on this M1 Pro Mac with 16 GB RAM. Cold startup after verification was 1.258 s. Latency differences do not establish a speed improvement; no stability repeats or target-host capacity test were performed.

## Verification and reproduction

- The new regression tests reproduced the targeted failures before implementation. Typecheck, build, 269 TypeScript tests, 71 Python tests and the public-content guard passed afterward.
- Tests cover CRLF/LF, exact field/source constraints, duplicate/ambiguous labels, cross-field evidence, unknown continuation text, payment-only statements versus fulfillment notes, conservative prices and the actual service prompt. The new policy is included in current evaluation fingerprints.
- Regenerating the report verified the matching source protocol. Only aggregate results are tracked; raw artifacts remain outside Git at `~/.cache/fom-ai-evaluation/runs/colonless-customer-20261023-01`. Historical reports and frozen manifests were not rewritten.

See the [generated comparison and failure inventory](colonless-customer-v1.md), [metrics and exact source fingerprints](colonless-customer-v1.json), and [preceding decision](MULTILINE-VARIANTS-DECISION.md). The measurement used FOM AI parent commit `162877a` plus the fingerprinted working-tree changes. Reproduction requires those matching sources, not just the parent commit.

With the cached model/runtime prepared and the pinned dependencies installed, run from FOM AI:

```bash
source .venv/bin/activate
cd tools/ai-evaluation
python -m prototype_eval run --output "$HOME/.cache/fom-ai-evaluation/runs/colonless-customer-NEW-RUN"
```

From the sibling FOM Platform checkout, run `../fom-ai/.venv/bin/python scripts/check_ai_service.py` for the actual client/service/model/form-adapter path. These checks do not bootstrap the application, read its environment files, connect to a database or create orders.

## Platform integration — 24 October 2026

All six actual FOM client → authenticated service → native Metal model → web form-adapter checks passed. The added colonless-customer case asserts the exact name, address, explicit township, null note, phone, variants, quantities and conservative price values. The earlier Myanmar multiline case still retains white/size L. The checks are targeted assertions, not full scoring of every sample.

| Sample | Extraction time |
| --- | ---: |
| English | 5.816 s |
| Myanmar multiline | 11.843 s |
| Mixed | 10.806 s |
| Ambiguous price | 5.840 s |
| Corrections | 6.503 s |
| Colonless customer | 9.375 s |

There were no separate warmups in this integration check. Cold startup was 1.257 s; sampled model RSS peaked at 4,120,068,096 bytes. RSS excludes the wrapper/client and total Metal allocation. These Mac observations do not qualify Linux CPU inference or the current Droplet's capacity.

The integration used FOM Platform parent `1ca00fc1` and FOM AI parent `162877a`, both with the documented uncommitted changes. Platform production API typecheck passed. Owned model/service processes stopped and temporary secrets/logs were removed. Browser automation remained disabled; no new browser verification is claimed. The legacy local path remains unchanged and does not receive these service-side policy fixes.

## Decision

Keep the service gated for development. Continue with fulfillment/payment-note separation and conversational corrections without weakening source validation. Review unmarked-township expectations separately. Independent Myanmar review, representative anonymized samples, fresh held-out families, stability repeats and suitable-host qualification remain necessary before a customer pilot. No deployment, public publication or production enablement occurred.
