# User-informed development labels: v2-r1

This revision records the user's two explicit answers on 2026-10-11:

- Unqualified prices in the supplied formats can mean unit price or line total, depending on the shop/message.
- Apply corrections to the relevant field only; do not copy the correction text into the order note.

The exact questions, answers and operational interpretation are recorded in `label_review/decisions.json`. This is **user-informed development labeling, not completed independent Myanmar-language review**.

## Changes

Ten unit-price fields across the nine supplied-format cases now become null, with an explicit ambiguity reason. These quantities exceed one and their amounts are not identified as per-unit or total. A price attached to exactly one item remains populated because either interpretation has the same amount, without division. Explicit per-unit prices in the other cases remain unchanged. This single-item interpretation is stated openly for review rather than silently generalized to multi-item totals.

The correction-note labels already matched the user's answer, so no note values needed changing. Existing explicit fulfillment instructions remain notes. Township alternatives and language naturalness have not been marked reviewed.

`development-v2-r1.jsonl` preserves all 24 source messages, IDs, family relationships and development split. `development-v2-r1.jsonl.manifest.json` records the old dataset/annotation hashes, decision hash, new dataset hash and field-level changes. The old v1 and v2 artifacts are untouched. Earlier scores still describe their original labels; none was silently recalculated under this revision. Earlier prompts with a blanket compact-price unit convention are incompatible with the new policy and must not be carried forward unchanged into a future experiment.

## Offline review

Open [the generated review form](../reports/development-v2-r1-review.html) locally in your browser. It has no network requests, external scripts, analytics or model predictions. Expected labels are initially collapsed so the original message can be read first. A blank field means null; zero is explicit. Phone numbers remain text.

1. Enter a reviewer name and review date. Only attest to independence and Myanmar fluency if accurate.
2. Review each original message and the proposed fields. Mark accepted, revised or needs clarification; record a reason and assess wording.
3. Save progress with **Download review JSON**. Loading that file later resumes it. Changes are held only in the open page until downloaded; leaving with unsaved changes prompts a warning. The form does not modify source datasets.
4. Keep the downloaded response outside the repository because it can contain reviewer details and free-text notes.
5. Validate the response using the commands below. Partial saves are allowed; they are never treated as completed review or pilot approval.

The generated file was checked for safe data embedding and JavaScript syntax. Browser interaction/visual verification was not completed: the browser tool rejected local `file://` URLs. No alternative browser route was used to bypass that restriction.

## Commands

From `tools/ai-evaluation` in the existing Python 3.12 environment:

```bash
# Generate a fresh external packet (existing directories are not overwritten).
python -m label_review prepare --output /tmp/fom-review-session-01

# Review submission can be incomplete, but field types and decisions must be valid.
python -m label_review validate /absolute/path/fom-development-v2-r1-review.json

# All cases, reasons, language assessments, reviewer/date and attestations required.
python -m label_review validate /absolute/path/fom-development-v2-r1-review.json --complete

python -m pytest -q
```

Each packet contains the provisional revised dataset, manifest, blank review JSON and offline form. CLI validation checks matching source hashes, complete unique case coverage, valid nullable values, supported text alternatives, ambiguity targets, and consistency between accepted/revised status and actual label edits. A completed review requires every case resolved, acceptable wording, a named reviewer, a valid date, and explicit independence/fluency declarations. These declarations are self-reported, not verified credentials.

Even a completed submission is not automatically installed as a dataset or used to approve a model. Review changes for consistency and publish a separately versioned development dataset next. If wording needs rewriting, leave the case unresolved and create a new source revision; this form does not silently edit source messages. Fresh held-out families come only after the next configuration is settled. No real-message collection, inference, production integration or deployment is included in this batch.
