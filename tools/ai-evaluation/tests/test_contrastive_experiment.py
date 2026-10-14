import copy
import json

import pytest

from development_v2.contrastive.__main__ import HERE, evaluate, protocol
from development_v2.contrastive.report import selection, checked_candidate
from development_v2.__main__ import load
from development_v2.recipes import DATASET, ANNOTATIONS
from fom_eval.artifacts import sha256


def metrics(phone=4, qty=8, price=11, complete=4, failures=10):
    return {
        "counts": {
            "phone_errors": phone,
            "quantity_errors": qty,
            "price_errors": price,
        },
        "complete_drafts": complete,
        "failures": failures,
    }


def test_each_critical_category_must_not_regress():
    control = metrics()
    previous_candidate = metrics(phone=8, qty=2, complete=2, failures=13)
    assert not selection(control, previous_candidate)["retain_for_further_development"]
    assert not selection(control, metrics(phone=5, qty=1, complete=8, failures=2))[
        "retain_for_further_development"
    ]
    assert not selection(control, control)["retain_for_further_development"]
    improved = selection(control, metrics(qty=2))
    assert improved["retain_for_further_development"]
    assert improved["pilot_approved"] is False


def test_selection_and_prompt_are_fingerprinted_without_changing_prior_protocol():
    from development_v2.experiment import protocol as prior_protocol

    frozen = protocol("contrastive")
    assert any(path.endswith("contrastive/selection.json") for path in frozen["v2"])
    assert any(path.endswith("contrastive/prompt.txt") for path in frozen["v2"])
    assert not any("contrastive/" in path for path in prior_protocol("control")["v2"])
    assert len((HERE / "prompt.txt").read_text()) < len(
        (HERE.parent / "prompts/candidate.txt").read_text()
    )
    with pytest.raises(ValueError):
        protocol("heldout")


def test_contrastive_runner_failure_accounting_and_cleanup(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "development_v2.contrastive.__main__.machine", lambda: {"test": True}
    )
    instances, calls = [], []

    class Fake:
        cold_start_ms = 1
        binary_sha256 = "test"
        closed = False

        def __init__(self, model, directory, config, prompt):
            assert prompt == (HERE / "prompt.txt").read_text()
            instances.append(self)

        def __enter__(self):
            return self

        def __exit__(self, *_):
            self.closed = True

        def extract(self, case, seed):
            calls.append(case["id"])
            return {"id": case["id"], "error": "timeout", "latency_ms": 60000}

    result = evaluate("contrastive", tmp_path, Fake)
    assert result["summary"]["failures"] == 24
    assert len(set(calls)) == 26
    assert len(calls) == 26
    assert all(i.closed for i in instances)
    with pytest.raises(FileExistsError):
        evaluate("contrastive", tmp_path, Fake)


def test_contrastive_report_refuses_partial_or_altered_inputs():
    cases = load()
    record = {
        "experiment": "contrastive-development-01",
        "status": "complete",
        "completed_at": "test",
        "split": "development",
        "private": False,
        "extractor": "qwen3-4b",
        "variant": "contrastive",
        "dataset_sha256": sha256(DATASET),
        "annotations_sha256": sha256(ANNOTATIONS),
        "protocol": protocol("contrastive"),
        "runs": [{"id": c["id"], "error": "timeout"} for c in cases],
    }
    assert checked_candidate(record, cases)[0]["failures"] == 24
    for field, value in [
        ("protocol", {}),
        ("runs", record["runs"][:-1]),
        ("dataset_sha256", "wrong"),
        ("split", "heldout"),
    ]:
        changed = copy.deepcopy(record)
        changed[field] = value
        with pytest.raises(ValueError):
            checked_candidate(changed, cases)
