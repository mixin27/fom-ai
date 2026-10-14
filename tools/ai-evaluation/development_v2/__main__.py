"""Validate v2 development labels or diagnose the unchanged baseline.

Deliberately has no held-out or model-tuning mode. v1 remains independently frozen.
"""

import argparse
from collections import Counter
import datetime
import json
import os
from pathlib import Path

from fom_eval.artifacts import external, sha256
from fom_eval.contract import flatten
from fom_eval.dataset import Case
from fom_eval.protocol import verify_freeze
from fom_eval.scoring import aggregate, score
from .recipes import DATASET, ANNOTATIONS


def validate(rows, metadata):
    if not rows:
        raise ValueError("Development dataset is empty")
    if (
        metadata["dataset_version"] != "development-v2"
        or metadata["status"] != "development-only-provisional"
    ):
        raise ValueError("Expected provisional development-v2 metadata")
    ids = set()
    for raw in rows:
        row = Case.model_validate(raw).model_dump()
        if row["id"] in ids:
            raise ValueError("Duplicate case ID")
        ids.add(row["id"])
        if row["split"] != "development":
            raise ValueError(
                "Known development examples cannot become held-out evidence"
            )
        fields = flatten(row["expected"])
        for field, alternatives in row["alternatives"].items():
            if not isinstance(fields.get(field), str) or not alternatives:
                raise ValueError("Alternatives require a populated text field")
        for ambiguity in row["ambiguities"]:
            if (
                ambiguity["field"] not in fields
                or fields[ambiguity["field"]] is not None
            ):
                raise ValueError("Unresolved ambiguity requires a null expected field")
        annotation = metadata["cases"][row["id"]]
        if annotation["review_status"] != "pending-independent-language-review":
            raise ValueError(
                "Review completion needs a separately documented review workflow"
            )
        if not annotation["label_notes"] or not annotation["source_ids"]:
            raise ValueError("Every label needs rationale and provenance")
        if any(
            source not in metadata["sources"] for source in annotation["source_ids"]
        ):
            raise ValueError("Unknown source")
    if ids != set(metadata["cases"]):
        raise ValueError("Dataset and annotations differ")
    return rows


def load():
    rows = [
        json.loads(line)
        for line in DATASET.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    return validate(rows, json.loads(ANNOTATIONS.read_text(encoding="utf-8")))


def write_new(path, value):
    # Exclusive creation also protects against concurrent accidental overwrite.
    with path.open("x", encoding="utf-8") as stream:
        stream.write(
            json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        )


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("validate")
    baseline = commands.add_parser("baseline")
    baseline.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    freeze = verify_freeze()
    cases = load()
    if args.command == "validate":
        print(
            json.dumps(
                {
                    "cases": len(cases),
                    "languages": dict(Counter(c["language"] for c in cases)),
                    "status": "development-only; labels awaiting independent review",
                    "v1_freeze": "verified",
                }
            )
        )
        return
    from fom_eval.baseline import run

    output = external(args.output)
    output.mkdir(parents=True, exist_ok=True)
    record_path = output / "baseline-development-v2.json"
    record = {
        "dataset_version": "development-v2",
        "split": "development",
        "extractor": "baseline",
        "label_status": "provisional-not-language-reviewed",
        "dataset_sha256": sha256(DATASET),
        "annotations_sha256": sha256(ANNOTATIONS),
        "v1_protocol": freeze,
        "development_runner_sha256": sha256(Path(__file__)),
        "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "status": "running",
        "interpretation": "Development diagnostics only. Not held-out quality evidence or a model comparison.",
    }
    write_new(record_path, record)
    try:
        runs, measurements = run(cases)
        scores = [score(case, result) for case, result in zip(cases, runs, strict=True)]
        record.update(
            status="complete",
            runs=runs,
            scores=scores,
            summary=aggregate(scores, runs),
            measurements=measurements,
            completed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        )
    except BaseException as error:
        record.update(status="failed", failure=type(error).__name__)
        raise
    finally:
        record_path.write_text(
            json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    print(json.dumps(record["summary"], indent=2))
    print(record_path)


if __name__ == "__main__":
    main()
