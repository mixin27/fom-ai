# Initial import from FOM Platform

Source commit: `267837fd4b48b11cf7cae946c0ec933912d542cd` (14 October 2026).

Only selected committed AI/evaluation files and their baseline dependencies were imported. No FOM Git history, application environments, database configuration, customer database, ignored/private data, model cache, or runtime binaries were copied. The original FOM checkout remains operational and retains its unrelated working-tree changes.

[migration/fom-platform-import.json](../migration/fom-platform-import.json) records original file hashes and explicitly identifies adapted files. The original repository need not be public to run this checkout. Imported historical reports are unchanged; reproducing an old report exactly requires its corresponding original source/dependency versions and external raw artifacts, which are not included here.

## Deliberate changes

- Node dependencies are reduced to the extraction/baseline and test tooling, with a new independent lockfile. No monorepo install, Prisma generation, application server, or database is needed.
- Controller/module/access integration tests remain in FOM Platform. Standalone schema, source-policy, transport and baseline-parity tests are retained here.
- Original customer-like name/phone/street examples in the parser test file are replaced with synthetic placeholders. Baseline implementation behavior is unchanged.
- `frozen-v1.json` remains the ORIGINAL historical manifest. The active public port uses **`frozen-public-v1.json`**. The freeze loader/CLI now verify that new filename, and the new fingerprint includes the sanitized tests and changed loader. It is an integrity baseline for the public import, not a newly measured independent benchmark.
- Original reports and their recorded hashes are never rewritten to make them appear measured against this port. New current-service reports fingerprint this repository's dependencies and source.
- Historical directory names are kept so adapters, source paths and documentation remain recognizable. The `api` workspace is a standalone CLI/library, not an HTTP application.

## Transition

Future extraction development belongs in FOM AI. FOM Platform currently retains its copy so the existing web prototype still works. Changes here are NOT automatically reflected in the portal. Before switching FOM to a versioned library or authenticated service, prove contract parity and run its tenant/access/confirmation tests. Do not remove those controls from the application.

With both checkouts next to one another, run `pnpm check:platform -- ../fom-platform` to compare the extraction implementation and parser implementation byte-for-byte. Differences are reported by filename only, without source content. This is an optional migration check, not a CI dependency on a private repository. Test/document/config adaptations are deliberately excluded.

## Publication

The repository owner selected MIT for the imported FOM-owned code and new contributions. This does not relicense FOM Platform as a whole or any upstream dependency, downloaded model/runtime, or referenced external content. No remote publication or visibility changes are performed by this import. Follow the [maintainer checklist](maintainers.md) when publishing.

## Service-boundary follow-up

After the initial import, an opt-in HTTP wrapper and gated FOM Platform client were added. Service mode uses this repository's extraction code; the default legacy local path still uses FOM Platform's copy. The initial import statements above describe that earlier delivery. See [service deployment](service-deployment.md) for the current contract and rollout boundary. Byte-for-byte source parity is no longer expected after deliberate standalone extraction changes; compatibility is checked at the versioned response boundary.
