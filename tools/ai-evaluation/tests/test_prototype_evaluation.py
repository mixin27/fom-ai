import copy
import json
import subprocess

import pytest

from fom_eval.contract import flatten
from prototype_eval.__main__ import (
    cases, comparison, evaluate, extract, markdown, summarize, validate_result,
)


def accepted(case):
    return {
        'id': case['id'], 'schema_version': '1.0', 'draft': case['expected'],
        'evidence': [{'field': k, 'quote': case['text']} for k, v in flatten(case['expected']).items() if v is not None],
        'schema_valid': True, 'evidence_valid': True, 'error': None,
        'latency_ms': 2, 'review_warnings': [],
    }


def test_current_evidence_allows_multiline_and_null_ambiguity_without_old_contract():
    case = cases()[0]
    row = accepted(case)
    field = next(k for k, v in flatten(case['expected']).items() if v is None)
    row['evidence'] += [{'field': field, 'quote': case['text'].splitlines()[0]},
                        {'field': 'customer.name', 'quote': case['text'].splitlines()[0]}]
    assert validate_result(row, case) == row
    for wrong in [dict(row, id='wrong'), dict(row, error='invalid')]:
        with pytest.raises(ValueError):
            validate_result(wrong, case)
    wrong = copy.deepcopy(row)
    wrong['evidence'][0]['quote'] = 'invented quote'
    with pytest.raises(ValueError):
        validate_result(wrong, case)


def test_scoring_accounts_for_every_failure_and_does_not_publish_field_values():
    rows = cases()
    runs = [accepted(c) for c in rows]
    runs[0] = {'id': rows[0]['id'], 'error': 'AI_DRAFT_INVALID', 'reason': 'unsupported_phone'}
    summary = summarize(rows, runs)
    assert summary['summary']['cases'] == 24
    assert summary['summary']['failures'] == 1
    assert summary['summary']['complete_drafts'] == 23
    assert summary['summary']['counts']['phone_errors'] == 1
    assert summary['failure_reasons'] == {'unsupported_phone': 1}
    assert rows[1]['text'] not in json.dumps(summary, ensure_ascii=False)
    assert 'expected' not in summary['cases'][1]
    for broken in [runs[:-1], runs + [runs[0]], list(reversed(runs))]:
        with pytest.raises(ValueError):
            summarize(rows, broken)


def test_real_path_orchestration_excludes_warmups_preserves_failures_and_closes(tmp_path, monkeypatch):
    monkeypatch.setattr('prototype_eval.__main__.machine', lambda: {'test': True})
    calls, closed = [], []

    class FakeServer:
        cold_start_ms, binary_sha256, base, peak = 1, 'test', 'http://127.0.0.1:1234', 1
        def __init__(self, *args): pass
        def __enter__(self): return self
        def __exit__(self, *_): closed.append(True)

    def fake_extract(case, origin):
        calls.append(case['id'])
        return {'id': case['id'], 'error': 'AI_LOCAL_CONNECTION_FAILED', 'latency_ms': 1}

    output = tmp_path / 'new-run'
    record = evaluate(output, FakeServer, fake_extract, lambda rows: ([accepted(c) for c in rows], {}))
    assert len(calls) == 26 and len(set(calls)) == 26
    assert closed == [True]
    report = comparison(record)
    assert report['results']['prototype']['summary']['failures'] == 24
    assert report['results']['baseline']['summary']['complete_drafts'] == 24
    assert 'not raw model accuracy' in markdown(report)
    assert 'Source' not in (output / 'comparison.json').read_text()
    with pytest.raises(FileExistsError):
        evaluate(output, FakeServer, fake_extract)
    for change in [{'status': 'running'}, {'protocol': {}}]:
        with pytest.raises(ValueError):
            comparison({**record, **change})

    def interrupt(*_): raise KeyboardInterrupt
    with pytest.raises(KeyboardInterrupt):
        evaluate(tmp_path / 'interrupted', FakeServer, interrupt, lambda rows: ([accepted(c) for c in rows], {}))
    assert closed == [True, True]
    assert json.loads((tmp_path / 'interrupted/run.json').read_text())['status'] == 'failed'


def test_evaluation_cannot_store_raw_runs_in_git():
    from fom_eval.artifacts import ROOT
    with pytest.raises(ValueError, match='outside the repository'):
        evaluate(ROOT / 'reports/do-not-create')


def test_adapter_deadline_terminates_its_process_group_without_retry(monkeypatch):
    calls = []
    class Stalled:
        pid = 123
        def communicate(self, *args, **kwargs):
            calls.append('request')
            raise subprocess.TimeoutExpired('adapter', 75)
        def poll(self): return None
        def wait(self, **kwargs): calls.append('wait')
    monkeypatch.setattr('prototype_eval.__main__.subprocess.Popen', lambda *args, **kwargs: Stalled())
    monkeypatch.setattr('prototype_eval.__main__.os.killpg', lambda *args: calls.append('terminate'))
    row = extract(cases()[0], 'http://127.0.0.1:1234')
    assert row['error'] == 'runner_deadline'
    assert calls == ['request', 'terminate', 'wait']


def test_malformed_adapter_output_is_a_failure_without_echoing_output(monkeypatch):
    class BadOutput:
        returncode = 0
        def communicate(self, *args, **kwargs): return 'private malformed response', ''
        def poll(self): return 0
    monkeypatch.setattr('prototype_eval.__main__.subprocess.Popen', lambda *args, **kwargs: BadOutput())
    row = extract(cases()[0], 'http://127.0.0.1:1234')
    assert row['error'] == 'runner_protocol_error'
    assert 'private' not in json.dumps(row)
