import ast
import copy
import inspect
import json
import textwrap

import httpx
import pytest

from development_v2.__main__ import load
from development_v2.experiment import HERE, evaluate, protocol
from development_v2.runtime import DevelopmentServer
from development_v2.compare import checked
from fom_eval.artifacts import ROOT, sha256
from fom_eval.runtime import Server
from fom_eval.contract import flatten
from development_v2.recipes import DATASET, ANNOTATIONS


def test_runtime_algorithm_matches_frozen_v1_except_prompt():
    original = inspect.getsource(Server.extract).replace(
        '(ROOT / "prompt.txt").read_text()', "self.prompt"
    )
    assert ast.dump(ast.parse(textwrap.dedent(original))) == ast.dump(
        ast.parse(textwrap.dedent(inspect.getsource(DevelopmentServer.extract)))
    )
    assert (HERE / "prompts/control.txt").read_bytes() == (
        ROOT / "prompt.txt"
    ).read_bytes()
    config = json.loads((HERE / "config.json").read_text())
    v1 = json.loads((ROOT / "config.json").read_text())
    assert {
        k: v
        for k, v in config.items()
        if k not in ("evaluation_version", "stability_seeds")
    } == {
        k: v
        for k, v in v1.items()
        if k not in ("evaluation_version", "stability_seeds")
    }


def test_custom_prompt_used_in_template_and_completion(tmp_path):
    case = load()[0]
    payloads = []

    def respond(request):
        payload = json.loads(request.content)
        payloads.append((request.url.path, payload))
        if request.url.path == "/apply-template":
            return httpx.Response(200, json={"prompt": "rendered"})
        if request.url.path == "/tokenize":
            return httpx.Response(200, json={"tokens": [1, 2]})
        extraction = {
            "schema_version": "1.0",
            "draft": case["expected"],
            "evidence": [
                {"field": k, "quote": case["text"]}
                for k, v in flatten(case["expected"]).items()
                if v is not None
            ],
        }
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": json.dumps(extraction)},
                    }
                ]
            },
        )

    server = DevelopmentServer(
        "qwen3-4b",
        tmp_path,
        json.loads((HERE / "config.json").read_text()),
        "development system prompt",
    )
    with httpx.Client(
        base_url="http://127.0.0.1", transport=httpx.MockTransport(respond)
    ) as client:
        server.client = client
        assert server.extract(case, 42)["error"] is None
    for path, payload in payloads:
        if path != "/tokenize":
            assert payload["messages"][0]["content"] == "development system prompt"
            assert payload["messages"][1]["content"] == case["text"]
    assert payloads[-1][1]["response_format"]["type"] == "json_schema"
    assert payloads[-1][1]["cache_prompt"] is False


def test_experiment_records_failures_once_and_stops_owned_servers(
    tmp_path, monkeypatch
):
    monkeypatch.setattr("development_v2.experiment.machine", lambda: {"test": True})
    calls, servers = [], []

    class Fake:
        cold_start_ms = 1
        binary_sha256 = "test"
        closed = False

        def __init__(self, *args):
            servers.append(self)

        def __enter__(self):
            return self

        def __exit__(self, *_):
            self.closed = True

        def extract(self, case, seed):
            calls.append(case["id"])
            return {"id": case["id"], "error": "timeout", "latency_ms": 60000}

    record = evaluate("control", tmp_path, Fake)
    assert record["summary"]["failures"] == 24
    assert len(record["runs"]) == 24
    assert len(set(r["id"] for r in record["runs"])) == 24
    assert len(calls) == 26
    assert all(s.closed for s in servers)
    with pytest.raises(FileExistsError):
        evaluate("control", tmp_path, Fake)


def test_experiment_cleans_up_after_interruption(tmp_path, monkeypatch):
    monkeypatch.setattr("development_v2.experiment.machine", lambda: {"test": True})
    closed = []

    class Interrupted:
        cold_start_ms = 1
        binary_sha256 = "test"

        def __init__(self, *args):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_):
            closed.append(True)

        def extract(self, *_):
            raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        evaluate("candidate", tmp_path, Interrupted)
    assert closed
    assert (
        json.loads((tmp_path / "qwen3-4b-candidate.json").read_text())["status"]
        == "failed"
    )


def test_compare_rejects_changed_labels_missing_cases_and_protocol():
    cases = load()
    record = {
        "status": "complete",
        "completed_at": "test",
        "split": "development",
        "extractor": "qwen3-4b",
        "variant": "control",
        "dataset_sha256": sha256(DATASET),
        "annotations_sha256": sha256(ANNOTATIONS),
        "protocol": protocol("control"),
        "runs": [{"id": c["id"], "error": "timeout"} for c in cases],
    }
    assert checked(record, "control", cases)[0]["failures"] == 24
    for field, bad in [
        ("annotations_sha256", "changed"),
        ("split", "heldout"),
        ("private", True),
        ("protocol", {}),
        ("runs", record["runs"][:-1]),
    ]:
        wrong = copy.deepcopy(record)
        wrong[field] = bad
        with pytest.raises(ValueError):
            checked(wrong, "control", cases)
