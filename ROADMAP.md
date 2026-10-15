# Roadmap

## Available

- Standalone local extraction CLI/library, unchanged rule baseline, pinned model launcher.
- Source constraints, conservative validation, dataset review tools and deterministic CI.
- Imported historical measurements with explicit source/dependency boundaries.
- [Standalone development baseline](tools/ai-evaluation/reports/PUBLIC-PORT-DECISION.md): 17/24 complete drafts; scored outcomes match the source application in this run.

- [Explicit-township follow-up](tools/ai-evaluation/reports/TOWNSHIP-ONLY-DECISION.md): 19/24 complete drafts; bounded destination formats, source references and absent-identity constraints.

- [Compact slash-item follow-up](tools/ai-evaluation/reports/COMPACT-SLASH-DECISION.md): 19/24 complete drafts, one rejection and four critical-field errors; item/numeric coverage improves, while customer fields and notes still need work.

## Next

1. Address colonless customer labels/township boundaries, payment versus fulfillment notes, conversational corrections and the remaining numeric-evidence rejection without weakening evidence checks. Review the unmarked-township policy separately; do not guess from the final address word.
2. Obtain independent Myanmar-language review and voluntarily supplied, anonymized representative messages outside Git.
3. Freeze a candidate and acceptance criteria, then measure fresh held-out families and stability repeats.
4. Integrate a versioned extraction boundary with FOM's existing review workflow, proving auth/tenant/business-rule parity before removing the old copy.

## Later, after evaluation

Consider fine-tuning only after enough reviewed representative data and a baseline justify it. A conversational assistant could ask about ambiguous prices/quantities; a production service needs separately designed authentication, concurrency, deployment, monitoring and capacity tests. No production dates or perfect-accuracy promise are implied.

No autonomous order writes, cloud AI API fallback, mobile redesign, training pipeline, public inference endpoint or hosted service is included in the initial repository.
