# Public port boundary

This command now calls FOM AI's copied extraction service. It does not call a running FOM Platform API, and changing it does not update the portal. Its dependencies and fingerprints differ from the historical imported reports. See [migration](../../../docs/migration.md). Use your activated Python 3.12 environment (`python`) instead of the original author's `/tmp/fom-ai-eval-venv/bin/python` path in the historical examples below.

# Evaluate the current web extraction service

This development comparison calls `AiDraftService.extract` directly through a small TypeScript adapter. It does not bootstrap NestJS, load application `.env` files, access PostgreSQL or create orders. The owned local runtime is stopped when the run finishes or is interrupted.

It answers a gap left by the original benchmark: **how well does the current prototype's actual extraction path perform across the known development cases?** The original benchmark used a different prompt and output contract; its scores cannot be presented as today's application accuracy.

## Scope

- Fixed `development-v2-r1`: 24 known, provisional examples using the user's price-ambiguity and correction-note decisions. No private input or held-out mode is accepted by this command.
- Unchanged rule parser and the current Qwen3-4B application service, using the same semantic scorer and labels.
- Scores the service's returned draft **after** validation and conservative price withholding. The report does not claim to measure raw model accuracy.
- Two model warmups, then each development case once at the service's configured seed 42. No retry, repair, fallback, prompt tuning during a run or stability repeats. Separate development iterations must retain their own artifacts and fingerprints.
- Every rejected request remains in the denominator. The adapter records sanitized codes/reasons/field paths without exception text. It does not expose rejected model output: schema/evidence acceptance counts therefore do not measure the syntax of rejected raw responses.
- Language/scenario breakdowns, per-field precision/recall, complete drafts, critical phone/quantity/price errors, missing-value metrics, unsupported values and baseline-default corrections.
- Dataset, label policy, application extraction code, adapter, scorer/runtime dependencies and lockfile are fingerprinted before the run and verified afterward. Frozen v1 is verified, not edited.

There is deliberately no new prompt in this package. Application changes belong in the application's contract/service, and a subsequent comparison must use a new output directory.

## Run

From `tools/ai-evaluation`, using the existing Python 3.12 environment:

```bash
# Deterministic tests only; no model server is started.
/tmp/fom-ai-eval-venv/bin/python -m pytest -q

# Explicit inference. Stop any prototype launcher first: the cache has an ownership lock.
# Use a new directory outside the repository for every run.
/tmp/fom-ai-eval-venv/bin/python -m prototype_eval run \
  --output "$HOME/.cache/fom-ai-evaluation/runs/prototype-development-NEW-RUN"
```

Weights/runtime must already have been prepared using the [evaluation setup](../README.md). The command downloads nothing and owns its loopback `llama-server`; it does not reuse an arbitrary running server or require the web/API development processes.

Outputs:

| File | Contents |
| --- | --- |
| `run.json` | Progress, protocol, machine, baseline output, warmups and current service results. Can contain source quotations and business field values; keep outside Git. |
| `qwen3-4b-server.log` | Local inference runtime diagnostics; keep outside Git. |
| `comparison.json` | Aggregate/grouped metrics, case IDs, failure categories and mismatched field names, without source text/field values. |
| `comparison.md` | Readable results and failure inventory. |

If interrupted, the run is marked failed and saved with the completed cases. Failed/incomplete runs cannot generate a completed comparison. Existing run directories are never overwritten. An operational setup failure may stop the run; it is not represented as completed inference evidence.

Regenerate a report only while its source protocol still matches the checkout:

```bash
/tmp/fom-ai-eval-venv/bin/python -m prototype_eval report \
  "$HOME/.cache/fom-ai-evaluation/runs/prototype-development-NEW-RUN/run.json"
```

After changing extraction code, preserve the old report and run a new comparison. The report command rejects mismatched fingerprints, duplicate/missing/reordered cases, and incomplete runs.

## Measurements and interpretation

The model stays loaded for the whole run. Each request starts a separate Node adapter process; `latency_ms` covers the service call, excluding Node startup. Raw output also records adapter wall time. These are local sequential measurements, not steady-state API throughput or a production capacity target.

Inference RSS is sampled by the existing runtime wrapper; it excludes the adapter process and is not a full measurement of Metal/unified-memory pressure. Baseline RSS includes the parser's process tree and has a different scope. Do not compare those as equivalent total application memory measurements.

No additional acceptance threshold was selected after seeing this run. It is a diagnostic inventory for choosing the next work, not a promotion gate. In particular, schema/evidence acceptance does not establish correct interpretation, and a known development set does not establish representative Myanmar-language quality.

Next steps are to review the observed errors and provisional labels, work on development cases, then freeze a candidate before evaluating fresh held-out families and representative anonymized shop examples. Do not relabel this development set as held out or silently modify the historical scores.

## Recorded run

The first 24-case run is documented in [the development decision](../reports/PROTOTYPE-DEVELOPMENT-DECISION.md), with a [generated comparison](../reports/prototype-development-v1.md) and [full metrics/protocol](../reports/prototype-development-v1.json). It is a diagnostic result, not approval to deploy the prototype.

The [phone-constraint follow-up](../reports/PHONE-CONSTRAINTS-DECISION.md) records a separately fingerprinted run after narrowing correction values and their evidence references. Its [comparison](../reports/prototype-phone-constraints-v1.md) preserves the same provisional development labels. To reproduce an older report, check out its matching source version; the report command intentionally rejects the old fingerprint after application code changes.

The [item-map follow-up](../reports/ITEM-MAP-DECISION.md) measures source-constrained item coverage, variants and unambiguous amounts. These results measure the hybrid application, not unaided Qwen extraction.

The [Myanmar quantity/address follow-up](../reports/LANGUAGE-SOURCE-DECISION.md) extends finite source constraints for quantity wording, colour allocations, address continuation and notes. It records development regressions as well as final results.

The [conversational item follow-up](../reports/CONVERSATIONAL-ITEMS-DECISION.md) measures complete single-product messages, preserved package descriptions and validated quantity-correction sequences.

## Dedicated repository baseline

The [first standalone run](../reports/PUBLIC-PORT-DECISION.md) measures this repository at commit `24a7b73`, with its own lockfile and public integrity manifest. It preserves all previous scored case outcomes in this one development run. The generated report's historical “web prototype” wording refers to the copied extraction service, not a live portal request.
