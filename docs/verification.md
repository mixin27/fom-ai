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
