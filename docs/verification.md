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
