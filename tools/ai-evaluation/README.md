# Public repository note

This is the public port of FOM's evaluation toolkit. Start with the [root quick start](../../README.md). Node dependencies are now independent. Active integrity checks use `frozen-public-v1.json`; `frozen-v1.json` and imported reports remain historical artifacts. See [migration details](../../docs/migration.md). Historical held-out examples are published and are not a fresh unseen test set. Old reported scores were not remeasured in this repository.

# FOM AI extraction evaluation

For the relationship between this toolkit, llama.cpp and the newer web prototype, read [Understanding FOM's current AI implementation](../../docs/ai-current-implementation.md).

To measure the **current web prototype** instead of the historical frozen prompt, use the [current-service development comparison](prototype_eval/README.md). It calls the application extraction service directly on the 24 user-informed development cases without starting NestJS or accessing a database.

This is a local benchmark, not an application service. It does not connect to PostgreSQL, read customer records, send messages, create orders, or change the existing parser. Flutter and public API contracts are unchanged.

The first benchmark compares the existing parser, Qwen3-1.7B and Qwen3-4B, using the exact Q4_K_M files in `artifacts.json`. Results are **provisional synthetic evidence**. Anonymized shop examples and fluent Myanmar-language review are required before a separately approved web pilot.

## Prerequisites and installation

Run from the repository root on Apple Silicon macOS with Python **3.12**, Node/pnpm already configured for FOM, approximately 5 GB of free disk space, and sufficient free RAM. Close other heavy applications before comparing timings. The recorded target is an M1 Pro with 16 GB RAM; nothing runs on the Droplet.

```bash
pnpm install --prod=false --ignore-scripts --frozen-lockfile
cd tools/ai-evaluation
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m fom_eval validate
python -m pytest -q
```

All direct/transitive Python dependencies are pinned. The baseline uses FOM's existing locked Node dependencies. CI runs only deterministic tests and baseline parity; it never downloads weights or starts inference.

## Batch 1: contract, fixtures and baseline

- `fom_eval/contract.py` defines schema version 1.0. `schema.json` is its readable generated snapshot.
- `datasets/synthetic-v1.jsonl` has 180 authored examples: 60 per language; 60 development and 120 held-out. Sixty families each have English, Myanmar and mixed renderings. Every family belongs to one split. The first eleven families cover existing parser-test scenarios.
- `datasets/build_synthetic.py` is the independently authored label source. It does not invoke the parser or an AI. Regeneration must be byte-identical. These are synthetic translations, not independently collected customer conversations or professionally reviewed Myanmar labels.
- Expected nullable values are different from zero. Ambiguous conflicts stay null; explicit corrections replace earlier values. Unit prices are explicit only: the evaluator does not infer them by dividing a total. Product names preserve variants. Text alternatives must be explicitly authored; prices/quantities cannot have fuzzy alternatives.
- `apps/api/scripts/evaluate-order-parser.ts` accepts JSONL `{ "id": "example", "text": "..." }` on stdin and emits the unmodified parser result with timing. No Nest bootstrap or database is used.

```bash
# From tools/ai-evaluation, with the Python virtual environment active:
python -m fom_eval run baseline --split development --output /tmp/fom-ai-development

# From repository root, run parser and adapter parity tests:
pnpm --filter api exec jest order-message-parser.service.spec.ts order-parser-evaluation.spec.ts --runInBand
```

The adapter projects existing fields into the evaluation schema without changing parser behavior. Original parser totals are retained in raw results, while comparison totals are calculated only when inputs are complete. Parser evidence already contains normalized text; the adapter locates the containing original line or message and records that exact quotation. Missing provenance is reported. Defaults never receive invented evidence and incorrect defaults have their own counter.

## Batch 2: explicit local downloads and model runs

```bash
# Downloads only the three selected files, verifies size and SHA-256,
# and extracts the pinned macOS arm64 runtime.
python -m fom_eval prepare
```

Default cache: `~/.cache/fom-ai-evaluation`. Set `FOM_AI_CACHE` to another **absolute path outside the repository** if needed. Both weights are retained for reuse. The artifact manifest records repository revisions, filenames, SHA-256, licenses and sizes before download. Runtime b11429 is the native build referenced by stable llama.cpp v0.6.0. Upstream sources:

- [llama.cpp v0.6.0](https://github.com/ggml-org/llama.cpp/releases/tag/v0.6.0), [pinned native release](https://github.com/ggml-org/llama.cpp/releases/tag/b11429)
- [1.7B pinned repository](https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/tree/d7f544eead698dbd1f15126ef60b45a1e1933222)
- [4B pinned repository](https://huggingface.co/unsloth/Qwen3-4B-GGUF/tree/22c9fc8a8c7700b76a1789366280a6a5a1ad1120)

The server is an owned subprocess on a randomly selected **127.0.0.1** port, with Metal offload, one slot and thinking disabled. It is stopped in `finally` on completion/error/interruption. There is no persistent service, remote endpoint, inference API key or Docker requirement. Each model starts only after the preceding model has stopped.

```bash
# Optional development experiments; NEVER tune using held-out failures.
python -m fom_eval run qwen3-1.7b --split development --output /tmp/fom-ai-development
python -m fom_eval run qwen3-4b --split development --output /tmp/fom-ai-development
```

The frozen protocol includes prompt, Pydantic schema, dataset, sampling settings, runtime/model manifest, adapter/scoring sources and existing parser sources. `freeze` verifies an existing freeze instead of silently overwriting it. For a future experiment, create a new dataset/evaluation version; do not overwrite this benchmark's frozen protocol after viewing its held-out results.

```bash
python -m fom_eval freeze

# Use a NEW directory. Existing runs are never overwritten.
python -m fom_eval run baseline --output /tmp/fom-ai-heldout-v1
python -m fom_eval run qwen3-1.7b --output /tmp/fom-ai-heldout-v1
python -m fom_eval run qwen3-4b --output /tmp/fom-ai-heldout-v1
```

Each model run has two separate development warmups, 120 scored requests, and 40 stability requests: 20 fixed held-out cases at seeds 43 and 44. The original run uses seed 42. Allow several minutes per model, depending on desktop workload. Progress is printed per request.

Limits: 5,000 Unicode characters, 8,192 context tokens, 2,048 output tokens and a hard 60-second request deadline. The rendered chat template is tokenized before inference; an output reserve plus 64-token margin must fit. Overflow is rejected, never truncated. A length stop is a failed result. Responses are not repaired, retried or replaced with baseline output. A timed-out/transport-failed server is stopped before a fresh process handles the **next** case; the failed case stays failed.

## Batch 3: comparison and decision

```bash
python -m fom_eval report \
  /tmp/fom-ai-heldout-v1/baseline-heldout.json \
  /tmp/fom-ai-heldout-v1/qwen3-1.7b-heldout.json \
  /tmp/fom-ai-heldout-v1/qwen3-4b-heldout.json
```

This writes `reports/synthetic-v1.json` and `reports/synthetic-v1.md`, including grouped metrics, synthetic failure examples, limitations and the pilot recommendation. The report requires all three completed runs with the same frozen protocol and exact dataset hash. It rejects missing/duplicated cases and private datasets. Raw outputs and server logs remain outside Git.

Scoring details:

- Exact nullable numeric comparison; phone strings normalize separators and Myanmar digits, preserving leading zeroes and country prefixes.
- Text comparison normalizes Unicode, case, punctuation and whitespace. Authored alternatives permit known equivalent text. No LLM judge, invented translation or fuzzy price matching.
- Deterministic minimum-cost item alignment prioritizes product names, then quantity/price; missing and extra items count as errors.
- Wrong populated values count as both false positives and false negatives when an expected value exists. Missing expected facts count as false negatives. Unsupported populated values mean disagreement with authored gold, not independently proven fabrication. Incorrect parser defaults are separately identified.
- A failed request remains in the denominator and cannot earn a complete draft or correct missing-value credit. Structurally usable output with invalid evidence retains diagnostic field scores but is still a failure. Default-only missing quotations are reported separately because the parser explicitly identifies them as defaults.
- Prices, quantities and phones receive separate error counters. Ranking prioritizes these critical errors (including omissions), then complete drafts, failures and latency. Schema validity alone does not imply usable output.
- Item line totals require both quantity and unit price. Subtotal requires at least one item and every line total; total additionally requires a known delivery fee. Null is never silently zero.

Measurements are Mac-specific: models use wall time for template/token checks, inference and validation; baseline times the parser itself. Warm p50/p95 include failed requests. Process launch-to-health is cold startup, without clearing OS disk caches. `ps` samples model RSS every 100 ms and baseline process-tree RSS every 50 ms. RSS is not total Metal/unified-memory use; no claim of precise device memory is made. Raw files include provider token usage where returned. Stability compares exact draft/error results across recorded seeds.

## Private examples, privacy and retention

You may manually supply a JSONL file matching the same case schema using `--dataset /absolute/path/outside/repo.jsonl`. Use new family IDs, independently reviewed labels, language/scenario tags and appropriate split assignments. Remove names, phone numbers, exact addresses, message handles and identifying narrative before inclusion. The toolkit does not collect or anonymize production records automatically.

```bash
python -m fom_eval validate --dataset /absolute/private/anonymized-orders.jsonl
python -m fom_eval run qwen3-1.7b \
  --dataset /absolute/private/anonymized-orders.jsonl \
  --output /absolute/private/evaluation-run
```

Private data, weights, runtime binaries and raw run paths inside the repository are rejected. Private runs must not be passed off as this synthetic benchmark. Raw results can contain the full supplied message and model generation. Keep them local, protect the directory, and delete them when no longer needed. Only selected synthetic aggregates and examples belong in tracked reports.

## Rollout boundary

No migration or application deployment is needed. This toolkit has no production request path. A successful synthetic result does not authorize integration. A later web pilot needs a separate plan for explicit user confirmation, NestJS authorization and tenant isolation, archived-customer handling, operational lifecycle checks, latency/cost limits and a kill switch. No automatic order creation, message sending, external AI API, FastAPI service, mobile AI or infrastructure provisioning is included.

For an explicitly supplied private dataset, generate **local aggregate-only** JSON and Markdown with:

```bash
python -m fom_eval private-report \
  /absolute/private/evaluation-run/qwen3-1.7b-heldout.json \
  --dataset /absolute/private/anonymized-orders.jsonl \
  --output /absolute/private/summary
```

This separate command requires matching dataset hashes, never includes message examples or extracted field values, and refuses an output directory inside the repository. Regular synthetic report generation continues to reject private runs.

## Review and experiment history

Review the delivery in this order:

1. **Dataset/baseline:** contract and schema snapshot, fixture recipes/JSONL, validation/scoring, TypeScript adapter and deterministic tests.
2. **Local comparison:** artifact manifest, prompt/config, runtime lifecycle/deadlines, frozen protocol and CLI.
3. **Decision:** reproducible JSON/Markdown reports and the evidence-based recommendation.

Before freezing v1, the baseline was exercised on all 60 development cases. Each model was smoke-tested on the first development family in all three languages. The 1.7B smoke test initially missed evidence and misclassified delivery fees as notes; the prompt was clarified with Myanmar label meanings, an explicit address-evidence reminder and one development-only example. Both models were then checked with the same final prompt. No held-out result was used to change the prompt, labels, scoring or model settings.

The frozen benchmark uses process-lifetime caching of loaded weights, with prompt caching disabled per request. The runtime detected `MTL0: Apple M1 Pro`; model startup used six CPU threads by the runtime's host-specific default. Reproduction on another machine should report its own hardware and timing rather than copying this Mac's performance claims.

`reports/environment.json` supplements the frozen protocol with the measured Node/pnpm versions and existing lockfile hash. Local parser timings use Node 24.21.0; deterministic CI follows the repository's Node 22 convention. These timings should not be treated as interchangeable hardware/runtime measurements.

## Recorded result

Read [the decision](reports/DECISION.md) alongside [the generated comparison](reports/synthetic-v1.md). Qwen3-4B was the strongest measured candidate, but neither model is ready for production integration on this evidence. The decision also records dataset blind spots and the observed gap between 4B wall time and summed request timers.

The completed raw run was preserved outside Git at `~/.cache/fom-ai-evaluation/runs/synthetic-v1`. Regenerate the tracked comparison from that local archive with:

```bash
python -m fom_eval report \
  "$HOME/.cache/fom-ai-evaluation/runs/synthetic-v1/baseline-heldout.json" \
  "$HOME/.cache/fom-ai-evaluation/runs/synthetic-v1/qwen3-1.7b-heldout.json" \
  "$HOME/.cache/fom-ai-evaluation/runs/synthetic-v1/qwen3-4b-heldout.json"
```

This archive is local to the measured machine. A fresh checkout needs its own explicit downloads and benchmark run. Do not reformat or edit frozen protocol sources and present the result as the same unchanged experiment; the hash check intentionally detects those changes.

## V2 development preparation

The separate [v2 development guide](datasets/DEVELOPMENT-V2.md) describes 24 provisional regression cases, source provenance, label decisions and the initial unchanged-parser diagnostic. These cases are development-only and do not alter v1's frozen results.

```bash
python -m development_v2 validate
python -m development_v2 baseline --output /tmp/fom-ai-development-v2-baseline
```

The first development prompt A/B is complete: [read the decision](reports/DEVELOPMENT-V2-DECISION.md) and [comparison](reports/development-v2-prompt-ab.md). The candidate was not promoted because phone errors and evidence failures increased. A fresh held-out evaluation remains subsequent work; all v2 labels still require independent language review.

The subsequent [shorter contrastive-prompt experiment](reports/CONTRASTIVE-DEVELOPMENT-DECISION.md) reduced phone/quantity/price discrepancies but failed its predeclared complete-draft criterion. It is preserved separately and was not promoted. Independent label decisions can be recorded using the [v2 review worksheet](datasets/REVIEW-V2.md).

The user's pricing and correction-note answers are recorded in [development v2-r1](datasets/DEVELOPMENT-V2-R1.md). Ten ambiguous price labels are now null in a separate dataset revision. The [offline review form](reports/development-v2-r1-review.html) supports saving/resuming case decisions; the CLI validates partial and completed submissions. Independent Myanmar-language review remains pending. Earlier scores and prompts are not retroactively relabeled.
