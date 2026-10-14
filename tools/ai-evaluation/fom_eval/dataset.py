import json
from collections import Counter
from pathlib import Path
from typing import Literal
from pydantic import Field
from .artifacts import ROOT, external
from .contract import Draft, Strict, flatten

DEFAULT_DATASET = ROOT / "datasets/synthetic-v1.jsonl"


class Ambiguity(Strict):
    field: str
    reason: str


class Case(Strict):
    id: str
    family: str
    split: Literal["development", "heldout"]
    language: Literal["en", "my", "mixed"]
    tags: list[str] = Field(min_length=1)
    ambiguities: list[Ambiguity]
    text: str = Field(min_length=1, max_length=5000)
    expected: Draft
    alternatives: dict[str, list[str]]
    provenance: str


def load(path: Path = DEFAULT_DATASET) -> list[dict]:
    path = path.resolve()
    if path != DEFAULT_DATASET.resolve():
        external(path)
    rows = [
        Case.model_validate_json(line).model_dump()
        for line in path.read_text().splitlines()
        if line.strip()
    ]
    ids, families = set(), {}
    for row in rows:
        if row["id"] in ids:
            raise ValueError(f'Duplicate ID: {row["id"]}')
        ids.add(row["id"])
        if row["family"] in families and families[row["family"]] != row["split"]:
            raise ValueError("Related family leaks across splits")
        families[row["family"]] = row["split"]
        fields = flatten(row["expected"])
        if not set(row["alternatives"]).issubset(fields):
            raise ValueError("Alternative targets unknown field")
        if any(not isinstance(fields[k], str) for k in row["alternatives"]):
            raise ValueError("Alternatives apply only to populated text fields")
        for ambiguity in row["ambiguities"]:
            if (
                ambiguity["field"] not in fields
                or fields[ambiguity["field"]] is not None
            ):
                raise ValueError("Unresolved ambiguity must have a null expected value")
    if path == DEFAULT_DATASET.resolve():
        if len(rows) != 180 or Counter(r["language"] for r in rows) != {
            "en": 60,
            "my": 60,
            "mixed": 60,
        }:
            raise ValueError("Synthetic language balance changed")
        if Counter(r["split"] for r in rows) != {"development": 60, "heldout": 120}:
            raise ValueError("Synthetic split balance changed")
    return rows
