import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import time
import pytest
from pydantic import ValidationError
from fom_eval.artifacts import ROOT, REPO, external, manifest, sha256
from fom_eval.baseline import adapt
from fom_eval.contract import (
    Draft,
    Extraction,
    check_evidence,
    flatten,
    normalize,
    totals,
)
from fom_eval.dataset import DEFAULT_DATASET, load
from fom_eval.protocol import fingerprint
from fom_eval.runtime import decode_response, deadline, DeadlineExceeded, Server
from fom_eval.scoring import score, aggregate, assignment


@pytest.fixture
def case():
    return copy.deepcopy(load()[0])


def extraction(case):
    return {
        "schema_version": "1.0",
        "draft": case["expected"],
        "evidence": [
            {"field": k, "quote": case["text"]}
            for k, v in flatten(case["expected"]).items()
            if v is not None
        ],
    }


def run(case):
    return {
        "id": case["id"],
        "draft": copy.deepcopy(case["expected"]),
        "schema_valid": True,
        "evidence_valid": True,
        "error": None,
        "latency_ms": 10,
    }


def response(value, finish="stop"):
    return {
        "choices": [
            {
                "finish_reason": finish,
                "message": {"content": json.dumps(value, ensure_ascii=False)},
            }
        ]
    }


def test_dataset_balance_split_and_reproducibility():
    rows = load()
    assert len(rows) == 180
    assert len({r["family"] for r in rows}) == 60
    before = DEFAULT_DATASET.read_bytes()
    # Import recipes without rewriting the tracked fixture file.
    spec = importlib.util.spec_from_file_location(
        "recipes", ROOT / "datasets/build_synthetic.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    expected = "".join(
        json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in module.rows
    )
    assert expected.encode() == before
    assert len([r for r in rows if "parser-scenario" in r["tags"]]) == 33
    assert len([r for r in rows if "prompt-injection" in r["tags"]]) == 12


def test_bounds_and_extra_fields(case):
    value = extraction(case)
    Extraction.model_validate(value)
    for key, bad in [
        ("qty", 0),
        ("qty", 10001),
        ("qty", True),
        ("unit_price", -1),
        ("unit_price", 1.5),
    ]:
        wrong = copy.deepcopy(value)
        wrong["draft"]["items"][0][key] = bad
        with pytest.raises(ValidationError):
            Extraction.model_validate(wrong)
    value["draft"]["customer"]["phone"] = 90001
    with pytest.raises(ValidationError):
        Extraction.model_validate(value)
    value = extraction(case)
    value["draft"]["status"] = "confirmed"
    with pytest.raises(ValidationError):
        Extraction.model_validate(value)
    value = extraction(case)
    value["customer_id"] = "admin"
    with pytest.raises(ValidationError):
        Extraction.model_validate(value)


def test_null_zero_phone_and_numeric_normalization(case):
    value = copy.deepcopy(case["expected"])
    value["delivery_fee"] = 0
    value["items"][0]["unit_price"] = 0
    assert totals(value)["total"] == 0
    value["delivery_fee"] = None
    assert totals(value)["total"] is None
    value["items"][0]["qty"] = None
    assert totals(value)["subtotal"] is None
    value["items"] = []
    assert totals(value)["subtotal"] is None
    assert normalize("၀၉ ၀၀၀-၁၂၃၄၅၆", "customer.phone") == "09000123456"
    assert normalize("09000123456", "customer.phone") != normalize(
        "9000123456", "customer.phone"
    )
    assert normalize("၁၂,၀၀၀") == normalize("12,000")


def test_original_quote_validation(case):
    value = extraction(case)
    assert not check_evidence(Extraction.model_validate(value), case["text"])
    value["evidence"][0]["quote"] = "invented quotation"
    assert (
        "quotation absent"
        in check_evidence(Extraction.model_validate(value), case["text"])[0]
    )
    value = extraction(case)
    value["evidence"].pop()
    assert check_evidence(Extraction.model_validate(value), case["text"])
    value = extraction(case)
    value["evidence"].append(value["evidence"][0])
    assert check_evidence(Extraction.model_validate(value), case["text"])
    # Normalized quotation is not an original-message quote.
    my = load()[1]
    value = extraction(my)
    value["evidence"][0]["quote"] = "09000123456"
    assert check_evidence(Extraction.model_validate(value), my["text"])


def test_quotes_are_not_semantic_proof(case):
    value = extraction(case)
    value["draft"] = copy.deepcopy(value["draft"])
    value["draft"]["items"][0]["unit_price"] = 1
    assert not check_evidence(Extraction.model_validate(value), case["text"])
    result = decode_response(response(value), case["text"])
    assert score(case, result)["counts"]["price_errors"] == 1


def test_item_alignment_permutation_missing_extra_and_duplicates():
    case = next(c for c in load() if c["id"] == "s36-en")
    actual = run(case)
    actual["draft"]["items"].reverse()
    assert score(case, actual)["complete"]
    actual["draft"]["items"].pop()
    result = score(case, actual)
    assert not result["item_count_correct"]
    assert result["counts"]["quantity_errors"] == 1
    actual = run(case)
    actual["draft"]["items"].append(
        {"product_name": "Invented", "qty": 1, "unit_price": 500}
    )
    result = score(case, actual)
    assert result["counts"]["unsupported_values"] == 3
    assert assignment([[2, 0], [0, 2]]) == [1, 0]


def test_conflicts_defaults_and_failures():
    case = next(c for c in load() if c["id"] == "s27-en")
    actual = run(case)
    assert score(case, actual)["complete"]
    actual["draft"]["items"][0]["qty"] = 1
    actual["defaults"] = ["items.0.qty"]
    result = score(case, actual)
    assert result["counts"]["default_corrections"] == 1
    assert result["counts"].get("unsupported_nondefault_values", 0) == 0
    failed = score(case, {"error": "timeout"})
    assert not failed["complete"]
    assert failed["counts"]["price_errors"] >= 1
    assert all(m["missing_correct"] == 0 for m in failed["fields"].values())


def test_malformed_truncated_extra_and_injection(case):
    result = decode_response(
        {"choices": [{"finish_reason": "stop", "message": {"content": "not json"}}]},
        case["text"],
    )
    assert result["error"] == "invalid_json_or_schema"
    assert (
        decode_response(response(extraction(case), "length"), case["text"])["error"]
        == "truncated_or_nonstop_output"
    )
    value = extraction(case)
    value["admin"] = True
    assert (
        decode_response(response(value), case["text"])["error"]
        == "invalid_json_or_schema"
    )
    attack = next(c for c in load() if c["id"] == "s39-en")
    assert attack["expected"]["items"][0]["unit_price"] == 17500
    assert "customer_id" not in attack["expected"]


def test_hard_deadline():
    with pytest.raises(DeadlineExceeded):
        with deadline(0.02):
            time.sleep(0.1)


def test_server_unavailable_and_input_overflow(case, tmp_path):
    import httpx

    def unavailable(request):
        raise httpx.ConnectError("offline")

    server = Server(
        "qwen3-1.7b", tmp_path, json.loads((ROOT / "config.json").read_text())
    )
    server.client = httpx.Client(
        base_url="http://127.0.0.1", transport=httpx.MockTransport(unavailable)
    )
    try:
        assert server.extract(case, 42)["error"] == "server_unavailable"
        assert (
            server.extract({**case, "text": "x" * 5001}, 42)["error"]
            == "input_character_overflow"
        )
    finally:
        server.client.close()


def test_context_overflow_and_timeout(case, tmp_path):
    import httpx

    config = json.loads((ROOT / "config.json").read_text())

    def overflow(request):
        return httpx.Response(
            200,
            json=(
                {"prompt": "rendered"}
                if request.url.path == "/apply-template"
                else {"tokens": [1] * 7000}
            ),
        )

    server = Server("qwen3-1.7b", tmp_path, config)
    with httpx.Client(
        base_url="http://127.0.0.1", transport=httpx.MockTransport(overflow)
    ) as client:
        server.client = client
        assert server.extract(case, 42)["error"] == "input_context_overflow"

    def timeout(request):
        raise httpx.ReadTimeout("timeout")

    with httpx.Client(
        base_url="http://127.0.0.1", transport=httpx.MockTransport(timeout)
    ) as client:
        server.client = client
        assert server.extract(case, 42)["error"] == "timeout"


def test_stable_scores_and_manifest(case):
    expected = score(case, run(case))
    assert expected == score(case, run(case))
    assert expected["complete"]
    summary = aggregate([expected], [run(case)])
    assert summary["complete_drafts"] == 1
    assert summary["fields"]["customer.phone"]["precision"] == 1
    assert fingerprint() == fingerprint()
    for info in manifest()["models"].values():
        assert (
            len(info["revision"]) == 40
            and len(info["sha256"]) == 64
            and info["size"] > 0
        )
        assert info["filename"].endswith("Q4_K_M.gguf")


def test_private_separation(tmp_path):
    with pytest.raises(ValueError):
        external(ROOT / "runs")
    with pytest.raises(ValueError):
        external(REPO / "private.jsonl")
    assert external(tmp_path) == tmp_path.resolve()
    from fom_eval.report import generate

    fake = tmp_path / "private.json"
    fake.write_text(json.dumps({"private": True, "dataset_sha256": "private"}))
    with pytest.raises(ValueError, match="fixed synthetic"):
        generate([fake], tmp_path / "report")


def test_family_split_leak_rejected(tmp_path):
    rows = load()[:2]
    rows[1]["split"] = "heldout"
    path = tmp_path / "private.jsonl"
    path.write_text("\n".join(json.dumps(r) for r in rows))
    with pytest.raises(ValueError, match="leaks"):
        load(path)


def test_schema_snapshot():
    assert (
        json.loads((ROOT / "schema.json").read_text()) == Extraction.model_json_schema()
    )


def test_private_aggregate_does_not_export_content(tmp_path):
    from fom_eval.report import private_summary

    case = copy.deepcopy(load()[0])
    case["split"] = "heldout"
    case["text"] = "PRIVATE MESSAGE MARKER"
    dataset = tmp_path / "private.jsonl"
    dataset.write_text(json.dumps(case) + "\n")
    path = tmp_path / "run.json"
    path.write_text(
        json.dumps(
            {
                "private": True,
                "dataset_sha256": sha256(dataset),
                "completed_at": "test",
                "extractor": "baseline",
                "runs": [run(case)],
            }
        )
    )
    private_summary([path], dataset, tmp_path / "summary")
    contents = (tmp_path / "summary/private-summary.json").read_text()
    assert "PRIVATE MESSAGE MARKER" not in contents
    assert case["expected"]["customer"]["phone"] not in contents
    with pytest.raises(ValueError):
        private_summary([path], dataset, ROOT / "reports")


def test_no_retry_after_transport_failure(case, tmp_path):
    import httpx

    calls = []

    def fail(request):
        calls.append(request.url.path)
        raise httpx.ReadTimeout("deadline")

    server = Server(
        "qwen3-1.7b", tmp_path, json.loads((ROOT / "config.json").read_text())
    )
    with httpx.Client(
        base_url="http://127.0.0.1", transport=httpx.MockTransport(fail)
    ) as client:
        server.client = client
        assert server.extract(case, 42)["error"] == "timeout"
    assert calls == ["/apply-template"]


def test_owned_process_cleanup():
    class Process:
        terminated = False
        waited = False

        def poll(self):
            return None

        def terminate(self):
            self.terminated = True

        def wait(self, timeout):
            self.waited = True

    server = Server("qwen3-1.7b", Path("/tmp"), {})
    server.process = Process()
    server.__exit__(RuntimeError, RuntimeError("failure"), None)
    assert server.process.terminated and server.process.waited
    assert server.stopped.is_set()


def test_gold_precision_with_wrong_value_and_missing_field(case):
    actual = run(case)
    actual["draft"]["customer"]["phone"] = "999"
    actual["draft"]["items"][0]["qty"] = None
    scored = score(case, actual)
    assert scored["fields"]["customer.phone"] == {
        "tp": 0,
        "fp": 1,
        "fn": 1,
        "missing_total": 0,
        "missing_correct": 0,
    }
    assert scored["fields"]["items.qty"]["fn"] == 1
    assert scored["fields"]["items.qty"]["fp"] == 0
    assert scored["counts"]["critical_errors"] == 2


def test_failed_case_retained_in_aggregate(case):
    good = run(case)
    failed = {"id": case["id"], "error": "timeout", "latency_ms": 60000}
    result = aggregate([score(case, good), score(case, failed)], [good, failed])
    assert result["cases"] == 2 and result["failures"] == 1
    assert result["complete_drafts"] == 1 and result["timed_requests"] == 2
    assert result["warm_latency_p95_ms"] > 50000


def test_complete_report_and_protocol_mismatch(tmp_path):
    from fom_eval.report import generate

    cases = [c for c in load() if c["split"] == "heldout"]
    paths = []
    for name in ("baseline", "qwen3-1.7b", "qwen3-4b"):
        data = {
            "extractor": name,
            "split": "heldout",
            "private": False,
            "dataset_sha256": sha256(DEFAULT_DATASET),
            "completed_at": "test",
            "freeze": {"test": "same"},
            "runs": [run(c) for c in cases],
            "stability": [],
            "stability_case_ids": [],
            "config": {"stability_seeds": [43, 44]},
            "machine": {"test": True},
        }
        path = tmp_path / f"{name}.json"
        path.write_text(json.dumps(data))
        paths.append(path)
    generate(paths, tmp_path / "summary")
    result = json.loads((tmp_path / "summary/synthetic-v1.json").read_text())
    assert all(r["complete_drafts"] == 120 for r in result["results"].values())
    assert (tmp_path / "summary/synthetic-v1.md").exists()
    data["freeze"] = {"test": "different"}
    paths[-1].write_text(json.dumps(data))
    with pytest.raises(ValueError, match="different frozen"):
        generate(paths, tmp_path / "bad")
