# FOM AI service boundary and deployment

Status: opt-in development service and container packaging. **This is not approval to enable customer AI or run inference on the existing 4 GiB Droplet.** The last extraction comparison is 19/24 complete drafts on reused development cases, with known errors. HTTP/container checks do not improve or re-establish that quality score.

## Components and ownership

```text
Browser -> FOM web/API -> authenticated FOM AI service -> private llama-server
                       <- draft + evidence + warnings <- model response
```

FOM Platform retains authentication, tenant permissions, entitlements, shop lifecycle checks, customer matching, review and order creation. FOM AI receives only message text, protocol version and a random request ID. It has no FOM database credentials or user sessions and never creates an order. The model server is reachable only by the service.

The service uses the same TypeScript extraction implementation as the CLI. Only its transport origin/token/cancellation are injected. No new prompt, repair, fallback, model or extraction rule is introduced by this batch. The old FOM Platform local path remains available for explicit development rollback; service mode never silently falls back to it. Its response validator checks contract/evidence compatibility without re-running source-derived schema rules.

## HTTP contract v1

`POST /v1/extractions`, `Authorization: Bearer <service-token>`, `Content-Type: application/json`:

```json
{"protocol_version":"1","request_id":"unique-request-id","message":"Product: Cup\nQty: 1\nUnit price: 1000"}
```

Success: `{ "protocol_version": "1", "request_id": "…", "data": { "schema_version": "1.0", "draft": {}, "evidence": [], "review_warnings": [], "model": "…", "elapsed_ms": 0 } }`. The example omits the draft fields for brevity; the actual contract requires customer, items, delivery_fee and note. Null values and leading-zero phone strings are preserved. The protocol version identifies the HTTP envelope separately from extraction schema version 1.0.

Errors contain only a sanitized code, optional validated request ID and protocol version. Statuses: 401 authentication; 404 disabled/unknown route; 413 body too large; 415 unsupported media; 422 request/input/context limits; 429 busy; 502 invalid extraction; 503 unavailable. No response or source messages are logged by the wrapper. No CORS/public-browser access is provided.

Bounds: 5–5,000 message characters, 64 KiB HTTP body, 8 KiB headers, ten-second body deadline, one active request, **no waiting queue**, 60-second inference deadline, 1 MiB inference response limit. FOM Platform permits 65 seconds for transport and checks a matching request ID, envelope version, field bounds and source evidence. Disconnects propagate cancellation through the platform client to the service and model fetch. There are no automatic retries; retrying extraction creates no business mutation.

`GET /health/live` is unauthenticated liveness. `GET /health/ready` requires the service token and checks the configured model's health with a three-second limit; disabled/unavailable returns 503. Docker health uses liveness intentionally, so unavailable inference does not restart the wrapper in a loop. On SIGINT/SIGTERM the service stops accepting work and cancels active requests. The Compose runtime has one inference slot; do not scale wrappers or point other callers at that runtime without reviewing concurrency limits.

## Local Mac development (recommended now)

Use the native Mac Metal launcher for inference. Docker on macOS does not use the native Metal backend in these Linux CPU images.

1. From `fom-ai`, install existing pinned dependencies and build:

   ```bash
   pnpm install --prod=false --ignore-scripts --frozen-lockfile
   pnpm build
   source .venv/bin/activate
   python tools/ai-prototype/serve.py
   ```

   Keep this terminal open. This assumes the documented model preparation is already complete. The launcher prints a new numeric loopback origin each launch.

2. In a second terminal, create a shared secret **once**, outside Git. Do not overwrite it on each restart:

   ```bash
   mkdir -p "$HOME/.config/fom-ai"
   chmod 700 "$HOME/.config/fom-ai"
   (umask 077; set -C; openssl rand -hex 32 > "$HOME/.config/fom-ai/service-token")
   ```

3. Start the boundary from `fom-ai`, replacing the inference port with the launcher's actual port:

   ```bash
   export FOM_AI_SERVICE_TOKEN_FILE="$HOME/.config/fom-ai/service-token"
   export FOM_AI_INFERENCE_URL=http://127.0.0.1:REPLACE_PORT
   export FOM_AI_SERVICE_ENABLED=true
   HOST=127.0.0.1 PORT=8091 NODE_ENV=production node apps/api/dist/src/service/server.js
   ```

   `production` here exercises the standalone service; it does not enable FOM Platform production access. The service reads process environment, not `.env` files automatically.

4. Configure/restart the **local FOM API** with:

   ```ini
   FOM_AI_SERVICE_ENABLED=true
   FOM_AI_SERVICE_URL=http://127.0.0.1:8091
   FOM_AI_SERVICE_TOKEN_FILE=/absolute/path/to/.config/fom-ai/service-token
   ```

   Configure/restart the local web app with `FOM_AI_SERVICE_ENABLED=true`. Both FOM processes remain in development mode. The web process never receives the service token or inference URL. Use the existing AI order draft screen and human confirmation flow. No mobile changes or database migration are required.

5. Ctrl+C stops the service; separately stop the owned model launcher. Model weights remain cached. Set the FOM API/web service flags back to false to disable this route; any legacy local opt-in must also be false if you want all AI off.

## Build and test containers

The Docker context is allowlisted, excluding private data, environments, models and raw evaluation runs. The app image runs as the Node user with production dependencies. Base image manifest digests are pinned. The CPU image compiles llama.cpp release b11429 at commit `d81235049384534c167caea52b85a694f6103d14`, with native CPU tuning disabled for portability. Updating that runtime requires separate compatibility and performance measurements; apt dependency resolution is not a fully reproducible OS package snapshot.

```bash
docker build -t fom-ai:boundary-test .
python3 scripts/smoke_service.py --image fom-ai:boundary-test
docker build -f Dockerfile.llama -t fom-ai-llama:boundary-test .
docker run --rm --entrypoint /usr/local/bin/llama-server fom-ai-llama:boundary-test --version
```

The smoke test uses synthetic messages and an HTTP inference stub, creates isolated temporary containers/network, and removes them afterward. It verifies the packaged service and real extraction code, not model accuracy or target-host capacity. Native local builds target the host architecture; GitHub builds target Linux amd64 for the Droplet.

The **Container images** workflow builds PRs without publishing. A manual run on `main` with `publish=true` publishes `ghcr.io/<owner>/fom-ai:<commit>` and `fom-ai-llama:<commit>` after deterministic checks. The workflow does not deploy anything or include model weights. Deploy immutable commit tags and record resolved image digests. The app and runtime are independently identifiable even when released together. Images have not been published by this implementation.

## Linux CPU rehearsal on adequate hardware

Do not use this section to enable inference on the current 4 GiB application host. The example runtime has a 6 GiB memory ceiling plus a 512 MiB wrapper ceiling; these are containment limits, not a sizing guarantee. Leave additional capacity for the OS, PostgreSQL, API, web, Redis, backups and restore drills. CPU latency has not been qualified for the Droplet.

Prepare the existing pinned Qwen3-4B Q4_K_M weight file in a directory readable by UID 10001. The runtime requires `Qwen3-4B-Q4_K_M.gguf` and verifies SHA-256 `f6f851777709861056efcdad3af01da38b31223a3ba26e61a4f8bf3a2195813a` at every start, before inference. It downloads nothing. Keep the model mount read-only. The current model provenance/license are in `tools/ai-evaluation/artifacts.json` and `THIRD_PARTY_NOTICES.md`.

Create an operator-owned environment file outside Git with absolute paths:

```ini
FOM_AI_IMAGE=ghcr.io/YOUR_LOWERCASE_OWNER/fom-ai:REVIEWED_COMMIT
FOM_AI_RUNTIME_IMAGE=ghcr.io/YOUR_LOWERCASE_OWNER/fom-ai-llama:REVIEWED_COMMIT
FOM_AI_MODEL_DIR=/absolute/path/to/models
FOM_AI_SERVICE_TOKEN_FILE=/absolute/path/to/service-token
FOM_AI_SERVICE_ENABLED=true
FOM_AI_HOST_PORT=8091
```

The token file must be readable by UID 1000 (the app image's Node user) through the read-only Compose secret mount. A root-owned mode-0600 file will fail. On a Linux host, an operator can install a dedicated copy without changing the original secret:

```bash
sudo install -d -m 0700 /etc/fom-ai
sudo install -o 1000 -g 1000 -m 0400 /absolute/path/to/original-token /etc/fom-ai/service-token
```

Use `/etc/fom-ai/service-token` as the Compose secret path. Docker mounts the file; the restricted host parent directory does not need to be exposed inside the container. Similarly, install the model into a dedicated readable model directory (directories mode 0755, this public weight file mode 0444) rather than changing ownership of a private cache directory. Verify access under UID 10001 before starting inference. Do not put tokens into tracked Compose files, command-line arguments or logs.

```bash
docker compose --env-file /absolute/path/to/ai.env -f ops/compose.yaml --profile ai config --quiet
docker compose --env-file /absolute/path/to/ai.env -f ops/compose.yaml --profile ai pull
docker compose --env-file /absolute/path/to/ai.env -f ops/compose.yaml --profile ai up -d
```

The `ai` profile is explicit. Extraction defaults off. The wrapper port is published only on loopback; the model has no published port and only an internal Docker network. Runtime logs are not persisted because upstream diagnostics may expose content. Use authenticated readiness and sanitized wrapper errors. Never expose either service through the public FOM Caddy configuration by default.

Run the known-case diagnostic through the service, fresh reviewed cases before approval, and one/two simultaneous request checks. Observe cold loading, p50/p95, timeouts, peak memory, CPU, and application/database latency during backups. Confirm busy requests receive 429, no swap-dependent operation or OOM kills, cancellation releases capacity, and ordinary FOM reads/writes work while AI is stopped. Current Mac scores/timing are not Linux acceptance evidence.

## Same host versus separate host

**Same host:** the optional FOM Platform `ops/compose.ai-client.yaml` attaches only its API to the `fom-ai-access` network created by this Compose project. Set the API URL to `http://fom-ai:8081` and explicitly set `FOM_AI_ALLOW_PRIVATE_HTTP=true`. The API keeps its existing default network for PostgreSQL/Redis/web traffic. Do not add a dependency that makes the FOM API wait for AI readiness.

**Separate host:** leave that overlay out. Set `FOM_AI_SERVICE_URL` to an authenticated **HTTPS origin** on your private service endpoint, or use a secured private tunnel. Terminate TLS with an operator-configured reverse proxy on the AI host; route only to the loopback wrapper, restrict access to the FOM API host, disable body/auth-header logging, and allow the 65-second client deadline. Keep private-HTTP permission false when using HTTPS. Reuse the same API contract; no portal rebuild or workflow change is needed to relocate inference. Service URL/token changes belong only to the API runtime configuration.

Remote provisioning, DNS, TLS certificates and firewall changes are not performed by this batch. Never send the bearer credential or order messages over a public plain-HTTP connection.

## Customer rollout and rollback gates

Both the FOM API and web require:

```ini
FOM_AI_SERVICE_ENABLED=true
FOM_AI_PILOT_ENABLED=true
FOM_AI_PILOT_SHOP_IDS=EXPLICIT_REVIEWED_SHOP_ID
```

These values are **not set by default or by the Compose overlay**. Production service mode with no pilot flag or no exact shop match is denied even if the caller invokes the API directly. Authentication, tenant, permission, plan and writable-shop guards still execute. No wildcard shop value is supported. Environment switches are an operator gate, not a substitute for independent language review, representative anonymized examples and capacity approval.

Rollback: disable service/pilot flags on FOM API and web and recreate those containers. Normal orders and the existing rule-parser flow continue. Stop the AI Compose services separately without deleting model files. There are no database migrations or AI-owned customer records to roll back. Roll back app/runtime images by their recorded immutable digests when investigating compatibility. Rotate a compromised service token on both sides and restart the processes.
