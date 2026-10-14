# Evaluation v2: development and label review

This guide covers development/regression cases and a separate prompt-tuning experiment. Neither creates a fresh held-out benchmark nor approves production integration. The original v1 dataset, prompt, contract, scoring, model configuration, freeze and results remain unchanged.

## Contents and provenance

`development-v2.jsonl` contains 24 cases: 7 English, 10 Myanmar and 7 mixed-language. This is deliberately targeted development coverage, not a balanced estimate of customer traffic.

- **01–09:** the nine user-supplied formats, with customer names, all phone numbers, street addresses and building references replaced. General townships and product wording are retained. Their origin as real versus synthetic messages was not verified.
- **10–15:** newly authored messages inspired by public commerce patterns. They are **not real customer conversations** or quotations from those sources. Product codes/variants come from Myanmar Export Outlet's public Telegram posts; package sizes/weights from a mirror of ပွဲတော်အုပ် posts; bundle pricing from an April Queen post mirror; per-order delivery from Myanmar Online Sales; address-change scenarios from Common Health Myanmar's FAQ. Exact source URLs and source types are in the annotations file.
- **16–24:** newly authored regression cases for corrections, conflicts, missing quantity, zero price, bundle totals, delivery notes, injection and multiline addresses. The choice of scenarios is informed by v1 failures, so none can become independent held-out evidence.

Numeric phone replacements preserve Myanmar/ASCII digit formatting and leading zeroes. They are synthetic placeholders, not verified unassigned numbers; never contact them. Original customer contacts are not stored in these new fixtures or their provenance.

Every case has an expected draft, supported text alternatives, ambiguity labels where appropriate, scenario tags, a family, source references, label rationale and `pending-independent-language-review` status. Labels are authored independently of extractor output. No model predictions were used to create or revise them.

## Label decisions that need review

1. Existing supplied formats such as `Qty: 2 / Price: 18,000` and `x2 18000` provisionally follow the previous test convention: price is per-unit. Real merchants may use this format differently. Confirm that interpretation before claiming real-world accuracy.
2. Pack quantity means saleable packs. Contents and weight remain in the product description. Three packs of four pieces must not become twelve units at the per-pack price.
3. A bundle total does not establish an explicit per-unit price. Even exact division is disallowed by the existing contract. Distinct ordered colour variants are separate items.
4. A later explicit correction replaces an earlier phone/address/quantity. Two conflicting unqualified phone values stay null.
5. Free delivery is zero; unquoted, separately payable or queried delivery is null. A delivery fee applies once to the order.
6. Township-only destination text populates township, leaving the full street address absent. Complete multiline addresses retain all lines. Translation alternatives must be reviewed explicitly rather than accepted through fuzzy scoring.
7. Payment claims are excluded. An explicit fulfillment instruction, such as sending items together, belongs in the note. Prompt-injection text never becomes an instruction to the extractor or a customer field.

A fluent Myanmar speaker should review original text, expected values, ambiguities and accepted alternatives together. Record a separate reviewed dataset/version and reviewer decisions before freezing a future benchmark; do not simply remove the pending-review flag. The test suite verifies consistency and expected regression behavior, not linguistic correctness.

## Commands

From the repository root, activate the Python 3.12 environment created in the main README, then:

```bash
cd tools/ai-evaluation
python -m development_v2 validate
python -m pytest -q

# Explicit local parser diagnostic; choose a new outside-repository directory.
python -m development_v2 baseline --output /tmp/fom-ai-development-v2-baseline
```

The baseline command calls the existing TypeScript runner directly. It does not boot Nest, contact PostgreSQL or download/start a model. Raw drafts, scores and process measurements stay outside Git. Output includes dataset/annotation hashes and the unchanged v1 protocol. Existing run files cannot be overwritten by another invocation. A failed invocation leaves a marked failed record; choose a new directory to retry.

Regenerate fixtures only after intentional development label edits:

```bash
python -m development_v2.recipes
python -m development_v2 validate
python -m pytest -q
```

The separate command is necessary because the frozen v1 CLI recognizes only its original public dataset and otherwise treats supplied paths as private. Do not alter v1's loader/freeze or copy these known development cases into a held-out run to bypass that boundary.

## Initial unchanged-parser diagnostic

On these provisional labels, the initial local run completed all **24/24** requests with valid schemas. It produced **8/24 complete drafts**, with **4 phone, 7 quantity and 12 price discrepancies** (23 critical-field discrepancies total). Discrepancies include omissions, not only wrong populated values. Twenty cases had the correct item count. Evidence was complete for 22 cases; baseline defaults are accounted for separately, following v1 scoring.

Eight of the nine supplied-format adaptations matched completely; case 04 added an unsupported address. None of the additional cases matched every field. Among the actionable findings: correction handling retained old phone values, conversational pack/bundle messages confused item structure, and Myanmar label lines sometimes became customer names. These are development diagnostics, **not production accuracy estimates**, and do not establish any new model improvement.

The initial raw result is local at `/tmp/fom-ai-development-v2-baseline/baseline-development-v2.json`. It is temporary and not distributed with the repository. Reproduce it with the command above using a fresh output directory. This batch makes no performance claims from a 24-case diagnostic.

## Next batch

- Review provisional labels and the Qwen3-4B development prompt comparison before selecting a configuration for further evaluation.
- Keep every family here, its translations, and its paraphrases in development. The annotation sidecar identifies known v1 development lineage where applicable; family naming alone cannot detect semantic leakage.
- Define acceptance thresholds and sampling protocol before a fresh held-out evaluation. Include positive township labels, phone corrections, package quantities, price ambiguity and evidence checks.
- Create fresh held-out families after development configuration is settled. Do not reuse v1 failures or these published examples as unseen evaluation data.
- Obtain voluntarily supplied, anonymized representative shop messages and independent Myanmar-language review before a separately approved web pilot.

## Qwen3-4B prompt experiments

Run the two development variants sequentially with the same cached Q4_K_M weights and native Metal runtime prepared for v1:

```bash
# From tools/ai-evaluation, with the Python environment active:
python -m development_v2.experiment control --output /tmp/fom-ai-v2-prompt-ab-01
python -m development_v2.experiment candidate --output /tmp/fom-ai-v2-prompt-ab-01
python -m development_v2.compare \
  /tmp/fom-ai-v2-prompt-ab-01/qwen3-4b-control.json \
  /tmp/fom-ai-v2-prompt-ab-01/qwen3-4b-candidate.json \
  --baseline /tmp/fom-ai-development-v2-baseline/baseline-development-v2.json
```

Omit `--baseline` if that earlier raw diagnostic is unavailable, or reproduce it in a fresh directory first. Run `python -m fom_eval prepare` only when the pinned weights/runtime are not already cached. Downloads are never triggered by the experiment command.

`development_v2/config.json` keeps v1's model limits and sampling settings (seed 42), with two excluded warmups and no stability repeats for this development A/B. The control prompt is byte-identical to v1. The candidate adds explicit correction handling, quantity classifiers, package contents/weight versus units, bundle-price handling, missing-value rules and evidence instructions. Labels and scoring are identical for both variants. No output repair, retries or parser fallback are applied.

The runtime subclass retains v1's request algorithm, with an explicit prompt input; an AST parity test protects that boundary. Loopback binding, checksums, Metal acceleration, input/token limits, schema constraints, hard deadlines and owned-process shutdown are inherited. A timeout remains a failure; the server may restart only for the next case. SIGTERM/interrupt cleanup stops the owned server and preserves a failed or partial run record.

Each run snapshots prompt text, configuration, dataset/annotation hashes, v1 protocol, v2 source hashes, machine information and runtime executable checksum. Records are saved after each scored request. Changing experiment inputs during a run invalidates completion. Comparison refuses incomplete runs, missing/duplicated/reordered cases, private datasets, altered labels or mismatched experiment code. Model and runtime artifacts remain those pinned in v1.

To try another prompt after reviewing development results, preserve the existing prompt and raw run before making changes. Use a new variant/version and output directory; do not overwrite completed artifacts or present a tuned result as independent evaluation. The comparison command is intentionally strict about matching the current source snapshot. Keep that snapshot with archived runs when starting another experiment version.

## Shorter contrastive prompt experiment

The next experiment lives in `development_v2/contrastive/`. It preserves both previous prompts and the earlier A/B code snapshot. Its shorter prompt uses small contrastive examples for phone replacement versus unresolved conflict, bundle totals versus per-unit prices, explicit free delivery versus unspecified fees, and pack contents versus order quantity. These examples were authored for development, not sampled from new held-out data.

Before inference, `selection.json` specifies that **each** of phone, quantity and price discrepancy counts must not exceed the control count. Complete drafts must not decrease, validation failures must not increase, and at least one of these metrics must improve. Passing permits further development review only; it never approves a pilot. The policy, prompt and experiment sources are fingerprinted in every run.

```bash
# Same environment and working directory as above; choose a new output directory.
python -m development_v2.contrastive contrastive --output /tmp/fom-ai-v2-contrastive-01
python -m development_v2.contrastive.report \
  "$HOME/.cache/fom-ai-evaluation/runs/development-v2-prompt-ab-01/qwen3-4b-control.json" \
  /tmp/fom-ai-v2-contrastive-01/qwen3-4b-contrastive.json
```

The comparison reuses the earlier control on the same machine with identical configuration and unchanged labels; it is not an interleaved or repeated performance comparison. There are 24 scored requests plus two excluded warmups, no repairs/fallbacks and no stability repeats. A fresh checkout can reproduce the control with the earlier command. The report rejects altered datasets/annotations, incomplete or reordered case coverage, mismatched source snapshots and different recorded machine/configuration.
