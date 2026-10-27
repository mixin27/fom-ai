# FOM AI

Local order-message extraction for Myanmar, English, and mixed-language commerce messages. FOM AI combines a pretrained Qwen model, explicit source constraints, validation, and reproducible evaluations to produce **drafts for human review**.

**Status: experimental, development and gated service packaging.** This is not a trained FOM model, a general conversational agent, or a production order-processing service. It never creates orders. Known extraction errors remain; a valid schema does not guarantee a correct interpretation.

## What is included

- Qwen3-4B extraction using a pinned local llama.cpp runtime and Q4_K_M weights.
- Source quotations, phone/numeric checks, conservative price handling, Myanmar quantity rules, variants, addresses, notes, and correction handling.
- The unchanged rule parser as an independent benchmark baseline.
- 180 synthetic benchmark cases, 24 development examples, label-review tools, and historical reports.
- Deterministic tests that need neither a model nor a database.

## Quick start: tests and baseline

Use Node 22, pnpm 9.15.9, and Python 3.12. Deterministic checks run on Linux/macOS. The pinned inference runtime currently supports **Apple Silicon macOS**; other inference platforms are not configured.

```bash
cd fom-ai
pnpm install --prod=false --ignore-scripts --frozen-lockfile
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r tools/ai-evaluation/requirements.txt
pnpm test
pnpm typecheck
pnpm build
python scripts/check_public.py
python -m pytest -q

# JSON input/output, no model or FOM account required:
pnpm --silent baseline < examples/order.json
```

For pytest from the repository root, `pytest.ini` configures the Python import path. These commands do not download model weights or run inference.

## Extract with the local model

On Apple Silicon, explicitly prepare the pinned runtime and both evaluation models once (approximately 3.6 GB of downloads). Existing verified cache files are reused.

```bash
source .venv/bin/activate
cd tools/ai-evaluation
python -m fom_eval prepare
cd ../..
python tools/ai-prototype/serve.py
```

Wait for the ready message. Keep that terminal open. In a second terminal, set the **actual URL printed by the launcher**; the port changes each launch:

```bash
cd fom-ai
export NODE_ENV=development
export FOM_AI_LOCAL_ENABLED=true
export FOM_AI_LOCAL_URL=http://127.0.0.1:REPLACE_WITH_PRINTED_PORT
pnpm --silent extract < examples/order.json
```

The command accepts one JSON object with `id` and `text`. Success returns `draft`, original-source `evidence`, and review warnings. Extraction failures return a non-null `error` with sanitized codes; callers must inspect that field even when the CLI exits successfully. Malformed CLI input exits nonzero. Treat all results as suggestions.

No `.env` file is loaded automatically. Stop the launcher with Ctrl+C; it terminates its owned runtime and keeps downloaded weights in `~/.cache/fom-ai-evaluation`. Do not run two launchers/evaluations against the same cache simultaneously.

## Evaluate a change

```bash
source .venv/bin/activate
cd tools/ai-evaluation
python -m fom_eval validate
python -m development_v2 validate
python -m fom_eval freeze
# Explicit real inference; choose a NEW output directory outside this repository:
python -m prototype_eval run --output "$HOME/.cache/fom-ai-evaluation/runs/public-port-001"
```

The current development evaluator measures both the copied parser and this repository's extraction service. Models are not trained or updated. It records failures without retries or fallback and shuts down its owned model process afterward. See [evaluation instructions](tools/ai-evaluation/README.md) and [migration/provenance](docs/migration.md).

The [first standalone development run](tools/ai-evaluation/reports/PUBLIC-PORT-DECISION.md) measured this repository at commit `24a7b73`: **17/24 complete drafts, two rejected requests, and nine critical-field errors**. Its scored case outcomes match the last imported FOM Platform run. This is a small reused development set, not a production quality claim or new accuracy improvement. Historical reports remain tied to their original source versions. A new run must have a new fingerprint/output directory. Published benchmark cases cannot be treated as fresh unseen evidence after tuning.

The [explicit-township follow-up](tools/ai-evaluation/reports/TOWNSHIP-ONLY-DECISION.md) improves the same known development set to **19/24 complete drafts**, with two rejected requests and nine critical-field errors unchanged. It recognizes narrow explicit destination formats and keeps absent identity/full-address fields null only for fully accounted-for single-product conversations. An initial regression and its separately measured correction are preserved in the reports. This is development evidence, not independent production validation.

The [compact slash-item follow-up](tools/ai-evaluation/reports/COMPACT-SLASH-DECISION.md) reduces rejected requests from two to one and critical-field errors from nine to four. Complete drafts remain **19/24**: the targeted example now has correct items/numbers but still misinterprets customer labels, township and payment text. These remaining errors are explicitly retained in the report.

The [multiline-address variant follow-up](tools/ai-evaluation/reports/MULTILINE-VARIANTS-DECISION.md) preserves separately labelled Myanmar color/size values when the message includes a recognized address continuation. The real platform client and form adapter retain the white/L variant. The existing 24-case scored outcomes remain unchanged at 19/24 complete, one rejection and four critical-field errors; the browser reproduction was checked separately.

## HTTP service and containers

An authenticated, versioned HTTP boundary now packages this same extraction code for FOM Platform. It supports native Mac development, a private same-host Docker network, or a separate HTTPS service origin. Production customer access remains off by default and requires explicit pilot/shop gates in FOM Platform.

Start with the [service deployment runbook](docs/service-deployment.md). It includes secrets, health checks, bounded concurrency, cancellation, GHCR build instructions, model verification and rollback. This packaging is not a new accuracy result or approval to run the model on the current 4 GiB application Droplet.

## Repository map

| Location | Purpose |
| --- | --- |
| `apps/api/src/orders/ai` | Extraction service, prompts, source policies, schema and validation |
| `apps/api/src/orders/order-message-parser*` | Frozen rule-parser baseline and synthetic tests |
| `apps/api/scripts` | JSON CLI/evaluation adapters |
| `tools/ai-evaluation` | Python evaluations, datasets, review tools, manifests and reports |
| `tools/ai-prototype/serve.py` | Owned loopback model launcher |
| `docs` | Architecture, migration and maintainer guidance |

The historical `apps/api` path and workspace name `api` preserve evaluation compatibility. It contains no FOM application server, tenant controller, database, web app or mobile app. An opt-in authenticated extraction HTTP wrapper now lives in `apps/api/src/service`. `@nestjs/common` is retained for the existing service decorator/error types; Nest is never bootstrapped. `pnpm build` also produces an experimental local library at `apps/api/dist/src/index.js`. It is not published to npm.

## Relationship to FOM Platform

Future extraction development belongs here. FOM Platform currently retains its existing extraction implementation and review UI; it does not automatically consume changes from this repository. The opt-in service client in FOM Platform now consumes this boundary; its default legacy development path still uses its own copy. The integration retains FOM's authentication, tenant isolation, entitlements, customer rules, audit, and explicit order confirmation. See [architecture](docs/ai-current-implementation.md).

## Contributing and license

Start with [CONTRIBUTING.md](CONTRIBUTING.md), [data policy](DATA_POLICY.md), and [roadmap](ROADMAP.md). Use synthetic reproductions in issues. Security issues follow [SECURITY.md](SECURITY.md).

FOM AI's own code and authored fixtures/documentation are [MIT licensed](LICENSE). Downloaded models and runtime retain their upstream licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). No weights or runtime binaries are distributed here.
