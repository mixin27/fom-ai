"""Regression specifications for provisional labels, not claims of parser success."""

import copy
import json

import pytest

from development_v2.__main__ import load, validate, write_new
from development_v2.recipes import DATASET, ANNOTATIONS, rendered, metadata
from fom_eval.contract import Extraction, check_evidence, normalize, totals
from fom_eval.protocol import verify_freeze
from fom_eval.scoring import score


def get(number):
    return next(row for row in load() if row["id"] == f"v2-dev-{number:02d}")


def result(case):
    return {
        "draft": copy.deepcopy(case["expected"]),
        "error": None,
        "schema_valid": True,
        "evidence_valid": True,
    }


def test_frozen_v1_and_v2_reproduction():
    verify_freeze()
    assert DATASET.read_text() == rendered()
    assert json.loads(ANNOTATIONS.read_text()) == metadata()
    cases = load()
    assert len(cases) == 24
    assert all(c["split"] == "development" for c in cases)
    assert len([c for c in cases if "supplied-format" in c["tags"]]) == 9
    # Paraphrases and repeated supplied templates stay together.
    assert get(1)["family"] == get(8)["family"]
    assert get(4)["family"] == get(9)["family"]
    assert get(16)["family"] == get(17)["family"]
    assert all(
        c["expected"]["customer"]["phone"] is None
        or c["expected"]["customer"]["phone"].startswith("0900000000")
        for c in cases
    )


@pytest.mark.parametrize(
    "mutation,match",
    [
        (lambda rows, meta: rows[0].update(split="heldout"), "held-out"),
        (lambda rows, meta: rows.append(copy.deepcopy(rows[0])), "Duplicate"),
        (
            lambda rows, meta: rows[0]["alternatives"].update({"items.0.qty": ["2"]}),
            "text field",
        ),
        (
            lambda rows, meta: rows[0]["ambiguities"].append(
                {"field": "items.0.qty", "reason": "conflict"}
            ),
            "null",
        ),
        (
            lambda rows, meta: meta["cases"][rows[0]["id"]].update(
                source_ids=["unknown"]
            ),
            "Unknown source",
        ),
        (lambda rows, meta: meta["cases"].pop(rows[-1]["id"]), None),
    ],
)
def test_reject_invalid_labels_and_provenance(mutation, match):
    rows, meta = load(), copy.deepcopy(metadata())
    mutation(rows, meta)
    with pytest.raises((ValueError, KeyError), match=match):
        validate(rows, meta)


def test_pack_contents_are_not_order_quantity():
    case = get(11)
    assert totals(case["expected"])["total"] == 9500
    actual = result(case)
    actual["draft"]["items"][0]["qty"] = 12
    assert score(case, actual)["counts"]["quantity_errors"] == 1


def test_bundle_price_cannot_be_divided_into_unit_prices():
    case = get(12)
    assert len(case["expected"]["items"]) == 2
    assert totals(case["expected"])["total"] is None
    actual = result(case)
    for item in actual["draft"]["items"]:
        item["unit_price"] = 7000
    assert score(case, actual)["counts"]["price_errors"] == 2
    single = get(21)
    assert totals(single["expected"])["subtotal"] is None


def test_correction_free_delivery_and_zero_price():
    case = get(13)
    assert totals(case["expected"])["total"] == 22500
    actual = result(case)
    actual["draft"]["items"][0]["qty"] = 2
    actual["draft"]["delivery_fee"] = None
    assert score(case, actual)["counts"]["critical_errors"] == 2
    assert totals(get(20)["expected"])["total"] == 2000
    assert get(19)["expected"]["items"][0]["qty"] is None


def test_shared_delivery_and_instruction_note():
    case = get(14)
    assert totals(case["expected"])["total"] == 19000
    assert case["expected"]["note"] == "အားလုံးတစ်ခါတည်းပို့ပေးပါ။"
    actual = result(case)
    actual["draft"]["items"].reverse()
    assert score(case, actual)["complete"]
    actual["draft"]["items"].pop()
    assert not score(case, actual)["item_count_correct"]


@pytest.mark.parametrize("number", [16, 17])
def test_corrected_phone_keeps_zero_and_original_evidence(number):
    case = get(number)
    assert case["expected"]["customer"]["phone"] == "09000000006"
    actual = result(case)
    actual["draft"]["customer"]["phone"] = "09000000005"
    assert score(case, actual)["counts"]["phone_errors"] == 1
    # Validate exact original-script quotation independently of other fields.
    phone_only = {
        "customer": dict.fromkeys(("name", "phone", "township", "address")),
        "items": [],
        "delivery_fee": None,
        "note": None,
    }
    phone_only["customer"]["phone"] = "09000000006"
    extraction = Extraction.model_validate(
        {
            "schema_version": "1.0",
            "draft": phone_only,
            "evidence": [{"field": "customer.phone", "quote": "၀၉ ၀၀၀၀ ၀၀၀၀၆"}],
        }
    )
    assert not check_evidence(extraction, case["text"])
    extraction.evidence[0].quote = "09000000006"
    assert check_evidence(extraction, case["text"])
    assert normalize("၀၉ ၀၀၀၀ ၀၀၀၀၆", "customer.phone") == "09000000006"


def test_unresolved_phone_and_injected_values_stay_absent():
    for number in (18, 23):
        case = get(number)
        assert case["expected"]["customer"]["phone"] is None
        actual = result(case)
        actual["draft"]["customer"]["phone"] = "09000000009"
        assert score(case, actual)["counts"]["phone_errors"] == 1
    assert get(23)["expected"]["delivery_fee"] is None
    assert get(23)["expected"]["note"] is None


def test_township_correction_and_multiline_address():
    case = get(15)
    actual = result(case)
    actual["draft"]["customer"]["township"] = "စမ်းချောင်း"
    assert not score(case, actual)["complete"]
    assert get(24)["expected"]["customer"]["address"].count("\n") == 2
    assert get(10)["expected"]["customer"]["address"] is None


def test_failed_requests_never_get_complete_credit():
    case = get(1)
    actual = result(case)
    actual["error"] = "timeout"
    assert not score(case, actual)["complete"]


def test_run_files_are_never_silently_overwritten(tmp_path):
    path = tmp_path / "result.json"
    write_new(path, {"original": True})
    with pytest.raises(FileExistsError):
        write_new(path, {"original": False})
    assert json.loads(path.read_text()) == {"original": True}
