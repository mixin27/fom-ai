"""Prepare a new development revision, offline form, and validate review submissions."""

import argparse
import copy
import datetime
import hashlib
import json
import os
from pathlib import Path
from typing import Literal

from pydantic import Field
from fom_eval.artifacts import ROOT, external, sha256
from fom_eval.contract import Draft, Strict, flatten
from fom_eval.dataset import Ambiguity, Case
from fom_eval.protocol import verify_freeze
from development_v2.__main__ import load as load_previous, write_new
from development_v2.recipes import DATASET, ANNOTATIONS

HERE = Path(__file__).resolve().parent
VERSION = "development-v2-r1"


def revisions():
    """Pure derivation from original labels plus two recorded user decisions."""
    verify_freeze()
    rows = copy.deepcopy(load_previous())
    changes = []
    for row in rows:
        if "supplied-format" in row["tags"]:
            for index, item in enumerate(row["expected"]["items"]):
                # These supplied formats use only unqualified Price/ဈေး/compact amounts.
                # None says 'per item'; source-case guard avoids changing explicit units.
                if (
                    item["qty"] is not None
                    and item["qty"] > 1
                    and item["unit_price"] is not None
                ):
                    field = f"items.{index}.unit_price"
                    changes.append(
                        {
                            "case_id": row["id"],
                            "field": field,
                            "before": item["unit_price"],
                            "after": None,
                            "decision_id": "unqualified-price",
                        }
                    )
                    item["unit_price"] = None
                    row["ambiguities"].append(
                        {
                            "field": field,
                            "reason": "User confirmed this unqualified amount can mean unit price or line total depending on shop/message; no disambiguating context is given.",
                        }
                    )
            if any(a["field"].endswith("unit_price") for a in row["ambiguities"]):
                row["tags"].append("ambiguous-price-convention")
        # Correction notes already excluded in gold; the user's second answer confirms that.
        row[
            "provenance"
        ] += "; user-policy-revision=development-v2-r1; independent-review-pending"
        Case.model_validate(row)
    return rows, changes


def serialized(rows):
    return "".join(
        json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows
    )


def source_snapshot():
    return {
        "dataset_sha256": sha256(DATASET),
        "annotations_sha256": sha256(ANNOTATIONS),
        "decisions_sha256": sha256(HERE / "decisions.json"),
    }


class Entry(Strict):
    id: str
    status: Literal["pending", "accepted", "revised", "needs-clarification"]
    expected: Draft
    alternatives: dict[str, list[str]]
    ambiguities: list[Ambiguity]
    reason: str = Field(max_length=4000)
    naturalness: Literal["pending", "acceptable", "needs-rewrite"]


class Submission(Strict):
    version: Literal["development-v2-r1"]
    source: dict[str, str]
    reviewer: str = Field(max_length=200)
    reviewed_on: str
    independent_review_attested: bool
    myanmar_fluency_attested: bool
    entries: list[Entry]


def template(rows):
    return {
        "version": VERSION,
        "source": source_snapshot(),
        "reviewer": "",
        "reviewed_on": "",
        "independent_review_attested": False,
        "myanmar_fluency_attested": False,
        "entries": [
            {
                "id": row["id"],
                "status": "pending",
                "expected": row["expected"],
                "alternatives": row["alternatives"],
                "ambiguities": row["ambiguities"],
                "reason": "",
                "naturalness": "pending",
            }
            for row in rows
        ],
    }


def validate_submission(value, complete=False):
    submission = Submission.model_validate(value)
    rows, _ = revisions()
    if submission.source != source_snapshot():
        raise ValueError("Review source changed; create a new packet")
    if [entry.id for entry in submission.entries] != [row["id"] for row in rows]:
        raise ValueError("Review must contain every case once in original order")
    decisions = []
    for row, entry in zip(rows, submission.entries, strict=True):
        changed = any(
            entry.model_dump()[key] != row[key]
            for key in ("expected", "alternatives", "ambiguities")
        )
        if entry.status == "accepted" and changed:
            raise ValueError(f"{entry.id}: changed labels must be marked revised")
        if entry.status == "revised" and not changed:
            raise ValueError(f"{entry.id}: revised requires a label change")
        if entry.status in {"accepted", "revised"} and not entry.reason.strip():
            raise ValueError(f"{entry.id}: record the review reason")
        fields = flatten(entry.expected.model_dump())
        for key, alternatives in entry.alternatives.items():
            if (
                not isinstance(fields.get(key), str)
                or not alternatives
                or any(not text.strip() for text in alternatives)
            ):
                raise ValueError(
                    f"{entry.id}: alternatives require populated text fields"
                )
        for ambiguity in entry.ambiguities:
            if (
                ambiguity.field not in fields
                or fields[ambiguity.field] is not None
                or not ambiguity.reason.strip()
            ):
                raise ValueError(
                    f"{entry.id}: unresolved ambiguity must target a null field"
                )
        if complete and (
            entry.status not in {"accepted", "revised"}
            or entry.naturalness != "acceptable"
        ):
            raise ValueError(
                f"{entry.id}: review or language clarification still pending"
            )
        decisions.append(entry.status)
    if complete:
        if (
            not submission.reviewer.strip()
            or not submission.independent_review_attested
            or not submission.myanmar_fluency_attested
        ):
            raise ValueError(
                "Completed review requires named reviewer and explicit independence/fluency attestations"
            )
        try:
            datetime.date.fromisoformat(submission.reviewed_on)
        except ValueError as error:
            raise ValueError("Review date must be YYYY-MM-DD") from error
    return submission, decisions


def packet(output):
    """Reviewer names and replies stay outside Git; original synthetic data is public."""
    output = external(output)
    output.mkdir(parents=True, exist_ok=False)
    rows, changes = revisions()
    manifest = {
        "version": VERSION,
        "source": source_snapshot(),
        "dataset_sha256": hashlib.sha256(serialized(rows).encode()).hexdigest(),
        "status": "user-informed-provisional; independent-language-review-pending",
        "changes": changes,
        "policies": json.loads((HERE / "decisions.json").read_text()),
    }
    write_new(output / f"{VERSION}.jsonl.manifest.json", manifest)
    (output / f"{VERSION}.jsonl").write_text(serialized(rows), encoding="utf-8")
    blank = template(rows)
    write_new(output / "review.json", blank)
    # No model output is supplied to the review form.
    data = {
        "rows": rows,
        "submission": blank,
        "changes": changes,
        "policies": manifest["policies"],
    }
    encoded = (
        json.dumps(data, ensure_ascii=False)
        .replace("&", "\\u0026")
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )
    html = (HERE / "review.html").read_text().replace("__REVIEW_DATA__", encoded)
    (output / "review.html").write_text(html, encoding="utf-8")
    return output / "review.html"


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare")
    prepare.add_argument("--output", type=Path, required=True)
    check = commands.add_parser("validate")
    check.add_argument("submission", type=Path)
    check.add_argument("--complete", action="store_true")
    args = parser.parse_args()
    if args.command == "prepare":
        print(packet(args.output))
    else:
        submission, statuses = validate_submission(
            json.loads(external(args.submission).read_text()), args.complete
        )
        print(
            json.dumps(
                {
                    "cases": len(statuses),
                    "resolved": sum(s in {"accepted", "revised"} for s in statuses),
                    "complete_check": args.complete,
                    "attestations": "reviewer-declared, not independently verified",
                    "pilot_approved": False,
                }
            )
        )


if __name__ == "__main__":
    main()
