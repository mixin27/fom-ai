# Initial public-port verification

Verified locally on 14 October 2026, with Node 24.21.0, pnpm 9.15.9 and Python 3.12.12. CI is configured for Node 22/Python 3.12 on Ubuntu; the remote CI run has not yet occurred.

- Independent dependency installation, then offline frozen-lockfile installation: passed.
- TypeScript typecheck and build: passed.
- TypeScript tests: 147 passed across 8 suites, including parser CLI parity and extraction transport/contract cases.
- Python tests: 70 passed, including public-port manifest and public-content guard tests.
- Dataset validation: 180 synthetic benchmark cases and 24 development cases passed.
- Active public integrity manifest: verified. Historical frozen-v1.json and reports were not overwritten.
- Optional FOM checkout comparison: extraction and parser implementations byte-for-byte match source commit 267837fd4b48b11cf7cae946c0ec933912d542cd. Adapted tests/configuration/docs are separately recorded.
- JSON baseline CLI: synthetic example returned the expected two shirts at 15,000 plus 2,500 delivery, total 32,500 MMK.
- Extraction CLI without opt-in: returned sanitized NOT_FOUND as expected; no inference was started.
- Public-content guard and known original-contact scan: passed. These are limited checks, not a guarantee of detecting every secret or personal detail.

No model downloads, new real-inference comparison, production database access, deployment, remote publication or GitHub settings changes were performed for this import. Historical accuracy/timing figures remain historical. A new measured comparison is separate follow-up work.

## Standalone inference follow-up

After the initial import, the 14 October 2026 run from commit `24a7b73` measured both extractors on all 24 known development cases, with two excluded model warmups. Model results: 17 complete drafts, two rejected requests, nine critical-field errors. The scored case outcomes match the imported source-application run. Report regeneration verified its matching source protocol. The runtime was stopped and raw artifacts remain outside Git.

See the [standalone decision](../tools/ai-evaluation/reports/PUBLIC-PORT-DECISION.md) for aggregate reports, limits and reproduction commands. No extraction implementation or FOM Platform integration changed in this follow-up.

## Explicit-township follow-up

The next batch passed 188 TypeScript tests, 70 Python tests, typecheck, build and the public-content check. It adds 41 tests relative to the 147-test import, including narrow destination formats, false positives, exact evidence and absent-field behavior.

The first model attempt improved to 18/24 but introduced an incorrect name/address in the Myanmar township-only case. That diagnostic is retained. The follow-up schema constraint was measured in a new run, reaching 19/24 with no new scored case regressions against the standalone baseline. Two rejected requests and nine critical-field errors remain. Report regeneration verified the final source fingerprint; raw artifacts remain outside Git and the owned runtime stopped.

See [the final decision](../tools/ai-evaluation/reports/TOWNSHIP-ONLY-DECISION.md). FOM Platform was not modified or integrated in this batch.

## Compact slash-item follow-up

Verified on 15 October 2026: typecheck, build, 231 TypeScript tests, 70 Python tests and public-content checks passed. The documented ignored Python 3.12 `.venv` was recreated with the same pinned requirements after the old temporary environment lost package files.

The real model comparison on all 24 known cases has 19 complete drafts, one rejected request and four critical-field errors. The compact-format case now has correct items and numeric fields but still fails customer-name/address/township and note checks. All other scored case outcomes are unchanged. This is partial progress, not a completed fix for every field in that message.

Report regeneration verified the source fingerprint and the owned inference runtime stopped. Only aggregate results are tracked; raw artifacts remain outside Git. See [the measured decision](../tools/ai-evaluation/reports/COMPACT-SLASH-DECISION.md). FOM Platform remains unchanged.

## Service packaging verification — 23 October 2026

- FOM AI typecheck/build, 237 TypeScript tests and 70 Python tests passed. Public-content guard and diff checks passed.
- Authenticated HTTP tests cover enabled/disabled gates, media/body limits, source-compatible responses, readiness, busy rejection, client disconnect cancellation and sanitized failures. The actual extractor runs against an HTTP inference stub in deterministic tests.
- The final service image built on Linux ARM64 in Docker Desktop and passed a synthetic container smoke: authenticated readiness, rejected bad token, successful extraction and oversized message rejection. The smoke test now mirrors the access/private-network separation; the initial single internal-network test failed before extraction because Docker did not publish its port. Temporary containers/networks were removed.
- The pinned Linux ARM64 CPU runtime built successfully and reports revision d812350. It rejects an invalid weight checksum before inference. No model weights or raw messages were baked into either image.
- AI Compose syntax and the FOM production network overlay passed validation. The latter used temporary empty environment files because local production secrets are intentionally absent. No production files were created or loaded.
- FOM Platform's 43 focused API tests (including module/access guards and service-client checks), four web tests, production API typecheck and web typecheck passed. A touched AI test helper's existing payload type was corrected. Full API typecheck still reports four pre-existing `customer`/`never` errors in `orders-support.service.spec.ts` at lines 96, 101, 126 and 136; those were not suppressed.

No GHCR publication, remote CI execution, Linux AMD64 verification, Droplet deployment or production enablement was performed. No new real-model accuracy run was performed for packaging; the 19/24 result belongs to the preceding extraction commit, not a container benchmark. The CPU image has not yet been measured under a real workload on the target host. The manual image workflow runs deterministic checks and container smoke checks before optional publication.
