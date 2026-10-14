import copy
import json
import subprocess
from html.parser import HTMLParser

import pytest
from pydantic import ValidationError

from label_review.__main__ import (
    HERE,
    revisions,
    serialized,
    template,
    validate_submission,
    packet,
)
from development_v2.__main__ import load as old_load
from fom_eval.protocol import verify_freeze
from fom_eval.contract import totals


def test_user_decisions_change_only_ambiguous_multi_quantity_prices():
    old = old_load()
    new, changes = revisions()
    assert len(new) == len(old) == 24
    assert len(changes) == 10
    for before, after in zip(old, new, strict=True):
        assert before["text"] == after["text"]
        assert before["family"] == after["family"]
        assert after["split"] == "development"
        expected = copy.deepcopy(before["expected"])
        for change in changes:
            if change["case_id"] == before["id"]:
                index = int(change["field"].split(".")[1])
                assert expected["items"][index]["qty"] > 1
                expected["items"][index]["unit_price"] = None
        assert expected == after["expected"]
    assert totals(new[0]["expected"])["total"] is None
    assert (
        new[8]["expected"]["items"][1]["unit_price"] == 75000
    )  # one item, same amount either way
    assert (
        new[10]["expected"]["items"][0]["unit_price"] == 2500
    )  # explicit per-pack price
    assert new[15]["expected"]["note"] is None  # confirmed correction-note policy
    verify_freeze()


def test_blank_review_cannot_become_complete():
    rows, _ = revisions()
    submission = template(rows)
    assert len(validate_submission(submission)[1]) == 24
    with pytest.raises(ValueError, match="pending"):
        validate_submission(submission, complete=True)


def accepted():
    rows, _ = revisions()
    value = template(rows)
    value.update(
        reviewer="Test fixture reviewer",
        reviewed_on="2026-10-11",
        independent_review_attested=True,
        myanmar_fluency_attested=True,
    )
    for entry in value["entries"]:
        entry.update(
            status="accepted",
            naturalness="acceptable",
            reason="Synthetic test fixture decision, not an actual review",
        )
    return value


def test_attestations_are_required_but_never_automatically_assigned():
    value = accepted()
    assert (
        validate_submission(value, complete=True)[0].reviewer == "Test fixture reviewer"
    )
    for field, bad in [
        ("reviewer", ""),
        ("reviewed_on", "yesterday"),
        ("independent_review_attested", False),
        ("myanmar_fluency_attested", False),
    ]:
        altered = copy.deepcopy(value)
        altered[field] = bad
        with pytest.raises(ValueError):
            validate_submission(altered, complete=True)


@pytest.mark.parametrize(
    "change",
    [
        lambda v: v["source"].update(dataset_sha256="different"),
        lambda v: v["entries"].pop(),
        lambda v: v["entries"].append(copy.deepcopy(v["entries"][0])),
        lambda v: v["entries"][0]["expected"]["customer"].update(phone=9000),
        lambda v: v["entries"][0].update(reason=""),
        lambda v: v["entries"][0]["alternatives"].update({"items.0.qty": ["2"]}),
        lambda v: v["entries"][0]["expected"]["items"][0].update(unit_price=18000),
    ],
)
def test_invalid_reviews_are_rejected(change):
    value = accepted()
    change(value)
    with pytest.raises((ValueError, ValidationError)):
        validate_submission(value)


def test_changes_require_revision_and_matching_ambiguities():
    value = accepted()
    entry = value["entries"][0]
    entry["expected"]["items"][0]["unit_price"] = 18000
    entry["status"] = "revised"
    with pytest.raises(ValueError, match="ambiguity"):
        validate_submission(value)
    entry["ambiguities"] = []
    assert validate_submission(value)[0].entries[0].status == "revised"
    entry["status"] = "accepted"
    with pytest.raises(ValueError, match="marked revised"):
        validate_submission(value)
    value = accepted()
    value["entries"][0]["status"] = "revised"
    with pytest.raises(ValueError, match="requires a label change"):
        validate_submission(value)


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.kind = None
        self.scripts = {}

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.kind = dict(attrs).get("type", "javascript")
            self.scripts[self.kind] = ""

    def handle_data(self, value):
        if self.kind:
            self.scripts[self.kind] += value

    def handle_endtag(self, tag):
        if tag == "script":
            self.kind = None


def test_offline_packet_is_reproducible_and_does_not_include_predictions(tmp_path):
    path = packet(tmp_path / "packet")
    parser = Scripts()
    parser.feed(path.read_text())
    data = json.loads(parser.scripts["application/json"])
    assert len(data["rows"]) == 24
    assert data["submission"]["independent_review_attested"] is False
    assert "runs" not in data and "scores" not in data and "predictions" not in data
    assert "connect-src 'none'" in path.read_text()
    assert "http://" not in path.read_text() and "https://" not in path.read_text()
    assert (path.parent / "development-v2-r1.jsonl").read_text() == serialized(
        revisions()[0]
    )
    with pytest.raises(FileExistsError):
        packet(path.parent)
    script = tmp_path / "review.js"
    script.write_text(parser.scripts["javascript"])
    subprocess.run(["node", "--check", str(script)], check=True, capture_output=True)


def test_html_does_not_allow_embedded_message_to_close_data_script(
    tmp_path, monkeypatch
):
    rows, changes = revisions()
    rows[0]["text"] = '</script><script>alert("untrusted")</script>'
    monkeypatch.setattr("label_review.__main__.revisions", lambda: (rows, changes))
    path = packet(tmp_path / "packet")
    parser = Scripts()
    parser.feed(path.read_text())
    data = json.loads(parser.scripts["application/json"])
    assert data["rows"][0]["text"] == rows[0]["text"]
    assert "</script><script>alert" not in path.read_text()


def test_tracked_revision_and_form_match_generated_packet(tmp_path):
    from fom_eval.artifacts import ROOT

    path = packet(tmp_path / "packet")
    for name in ["development-v2-r1.jsonl", "development-v2-r1.jsonl.manifest.json"]:
        assert (ROOT / "datasets" / name).read_bytes() == (
            path.parent / name
        ).read_bytes()
    assert (
        ROOT / "reports/development-v2-r1-review.html"
    ).read_bytes() == path.read_bytes()
