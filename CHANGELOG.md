# Changelog

## Unreleased

- Added complete slash-separated item maps with English/Myanmar labels, item-local evidence and conservative price ambiguity. Added 43 tests. The measured development run reduces rejections from two to one and critical-field errors from nine to four, while complete drafts remain 19/24. Customer-label/township/payment-note errors remain in the targeted case.

- Added explicit-township constraints for supported unlabelled street addresses and direct delivery requests. Township-only source facts now reach the prompt; fully recognized single-product conversations keep absent customer names/full addresses null.
- Added 41 regression/transport checks. The final known-development run improves complete drafts from 17/24 to 19/24 with no new scored case regressions; two rejected requests and nine critical-field errors remain. The initial name/address regression is retained as a separate diagnostic report.

- Measured the standalone public import on the 24 development cases: 17 complete, two rejected, and nine critical-field errors, with unchanged scored outcomes versus the imported run. Added aggregate reports, exact fingerprints and remaining-work analysis.

- Imported the standalone local extraction implementation and evaluation toolkit from FOM Platform.
- Added public synthetic parser fixtures, independent dependencies/build, JSON CLI examples and deterministic CI.
- Added MIT licensing, contribution/data/security policies, provenance and migration boundaries.

Historical benchmark results describe their original FOM Platform commits. The new standalone comparison establishes development continuity; it does not claim an accuracy improvement or independent held-out quality.
