"""Explicit local development comparison using the real Nest service, without Nest/DB startup."""

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import signal
import subprocess
import time

from fom_eval.artifacts import ROOT, REPO, external, sha256
from fom_eval.baseline import run as baseline
from fom_eval.contract import Extraction, flatten
from fom_eval.protocol import machine, verify_freeze
from fom_eval.runtime import Server
from fom_eval.scoring import aggregate, score
from label_review.__main__ import revisions, serialized

DATASET = ROOT / 'datasets/development-v2-r1.jsonl'
HERE = Path(__file__).resolve().parent


def cases():
    expected, _ = revisions()
    if DATASET.read_text() != serialized(expected):
        raise ValueError('Development labels differ from the recorded user-policy revision')
    if any(c['split'] != 'development' for c in expected):
        raise ValueError('This command only accepts development cases')
    return expected


def protocol():
    verify_freeze()
    paths = [DATASET, ROOT / 'datasets/development-v2-r1.jsonl.manifest.json',
             ROOT / 'label_review/decisions.json', ROOT / 'config.json',
             ROOT / 'artifacts.json', ROOT / 'requirements.txt',
             REPO / 'pnpm-lock.yaml', REPO / 'apps/api/package.json',
             REPO / 'apps/api/tsconfig.json', REPO / 'apps/api/tsconfig.build.json',
             REPO / 'apps/api/scripts/evaluate-local-ai.ts',
             REPO / 'apps/api/src/orders/ai/ai-draft.service.ts',
             REPO / 'apps/api/src/orders/ai/ai-draft.contract.ts',
             REPO / 'apps/api/src/orders/ai/ai-phone-policy.ts',
             REPO / 'apps/api/src/orders/ai/ai-item-policy.ts',
             REPO / 'apps/api/src/orders/ai/ai-conversation-item-policy.ts',
             REPO / 'apps/api/src/orders/ai/ai-language-policy.ts',
             REPO / 'apps/api/src/orders/ai/ai-address-policy.ts',
             REPO / 'apps/api/src/orders/ai/ai-customer-policy.ts',
             REPO / 'apps/api/src/orders/ai/ai-note-policy.ts',
             REPO / 'apps/api/src/common/http/app-http.exception.ts']
    paths += sorted(HERE.glob('*.py'))
    return {'frozen_v1': verify_freeze(),
            'current': {str(p.relative_to(REPO)): sha256(p) for p in paths}}


def save(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def validate_result(result, case):
    if not isinstance(result, dict) or result.get('id') != case['id']:
        raise ValueError('Adapter identity mismatch')
    if result.get('error'):
        if 'draft' in result:
            raise ValueError('Rejected adapter response must not contain a scored draft')
        return result
    parsed = Extraction.model_validate({k: result[k] for k in ('schema_version', 'draft', 'evidence')})
    # Current service allows multiple original lines and ambiguity evidence for nulls.
    # Do not apply the older frozen validator's different evidence vocabulary.
    fields = flatten(parsed.draft.model_dump())
    seen = set()
    for entry in parsed.evidence:
        if entry.field not in fields or entry.quote not in case['text']:
            raise ValueError('Invalid adapter evidence')
        seen.add(entry.field)
    if any(value is not None and field not in seen for field, value in fields.items()):
        raise ValueError('Missing adapter evidence')
    if result.get('schema_valid') is not True or result.get('evidence_valid') is not True:
        raise ValueError('Adapter acceptance flags missing')
    return result


def extract(case, origin):
    env = {**os.environ, 'NODE_ENV': 'development', 'FOM_AI_LOCAL_ENABLED': 'true',
           'FOM_AI_LOCAL_URL': origin}
    command = ['pnpm', '--filter', 'api', 'exec', 'ts-node', '--transpile-only',
               'scripts/evaluate-local-ai.ts']
    start = time.perf_counter()
    process = subprocess.Popen(command, cwd=REPO, env=env, stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, start_new_session=True)
    try:
        stdout, _ = process.communicate(json.dumps({'id': case['id'], 'text': case['text']}), timeout=75)
        if process.returncode:
            return {'id': case['id'], 'error': 'runner_process_failed'}
        result = validate_result(json.loads(stdout), case)
        result['adapter_wall_ms'] = round((time.perf_counter() - start) * 1000, 2)
        return result
    except subprocess.TimeoutExpired:
        return {'id': case['id'], 'error': 'runner_deadline', 'latency_ms': 75000}
    except (ValueError, KeyError, TypeError):
        return {'id': case['id'], 'error': 'runner_protocol_error'}
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)


def summarize(rows, runs):
    if [r['id'] for r in runs] != [c['id'] for c in rows]:
        raise ValueError('Missing, duplicate or reordered cases')
    scores = [score(c, r) for c, r in zip(rows, runs, strict=True)]
    groups = {}
    for kind, keys in [('language', sorted({c['language'] for c in rows})),
                       ('scenario', sorted({t for c in rows for t in c['tags']}))]:
        groups[kind] = {}
        for key in keys:
            indexes = [i for i, c in enumerate(rows) if
                       (c['language'] == key if kind == 'language' else key in c['tags'])]
            groups[kind][key] = aggregate([scores[i] for i in indexes], [runs[i] for i in indexes])
    return {'summary': aggregate(scores, runs), 'groups': groups,
            'failure_reasons': dict(Counter(r.get('reason') or r['error'] for r in runs if r.get('error'))),
            'review_warning_cases': sum(bool(r.get('review_warnings')) for r in runs),
            'cases': [{'id': s['id'], 'failure': s['failure'], 'complete': s['complete'],
                       'mismatched_fields': [e['field'] for e in s['errors']]} for s in scores]}


def comparison(record):
    if record['status'] != 'complete' or record['protocol'] != protocol():
        raise ValueError('Incomplete run or changed protocol; preserve old reports and use a new run')
    return {'experiment': record['experiment'], 'scope': 'known development cases; provisional labels',
            'scored_output': 'current service output AFTER conservative price review policy; not raw model accuracy',
            'dataset_sha256': sha256(DATASET), 'protocol': record['protocol'],
            'machine': record['machine'], 'started_at': record['started_at'],
            'completed_at': record['completed_at'], 'startup': record['startup'],
            'results': {name: summarize(cases(), runs) for name, runs in record['runs'].items()}}


def markdown(report):
    lines = ['# Current web prototype: development comparison', '',
             'Known development cases with provisional, user-informed labels. No independent Myanmar review, fresh held-out evidence or production approval.', '',
             'The prototype is scored after its validation and conservative price review policy. This measures the application extraction path, not raw model accuracy. No failed request is retried or replaced.', '',
             '| Extractor | Complete / cases | Failed requests | Phone / qty / price errors | Total critical errors | p50 / p95 ms |',
             '| --- | ---: | ---: | ---: | ---: | ---: |']
    for name, result in report['results'].items():
        s = result['summary']; c = s['counts']
        lines.append(f"| {name} | {s['complete_drafts']}/{s['cases']} | {s['failures']} | "
                     f"{c.get('phone_errors', 0)} / {c.get('quantity_errors', 0)} / {c.get('price_errors', 0)} | "
                     f"{c.get('critical_errors', 0)} | {s['warm_latency_p50_ms']} / {s['warm_latency_p95_ms']} |")
    lines += ['', 'Critical errors count fields, including omissions and delivery fees. All failed requests remain in the denominator. Schema/evidence counts describe accepted outputs available to the scorer; rejected model JSON is not exposed by the API adapter.', '',
              'Two model warmups are excluded. Model weights stay loaded; each adapter invocation starts Node anew, whose startup is excluded from service request latency and recorded separately in raw artifacts. This is a sequential Mac diagnostic, not a capacity test. RSS covers the inference process, not total Metal memory or the full application. One seed (42), no stability repeats.', '',
              '## Results by language', '', '| Extractor | Language | Complete / cases | Critical errors | Failures |', '| --- | --- | ---: | ---: | ---: |']
    for name, result in report['results'].items():
        for language, s in result['groups']['language'].items():
            lines.append(f"| {name} | {language} | {s['complete_drafts']}/{s['cases']} | {s['counts'].get('critical_errors', 0)} | {s['failures']} |")
    lines += ['', '## Failure inventory', '']
    for name, result in report['results'].items():
        lines += [f'### {name}', '', f"Rejected requests: `{json.dumps(result['failure_reasons'], sort_keys=True)}`. Review warnings: {result['review_warning_cases']} cases.", '',
                  '| Case | Rejection | Mismatched fields |', '| --- | --- | --- |']
        for row in result['cases']:
            if not row['complete']:
                lines.append(f"| {row['id']} | {row['failure'] or '—'} | {', '.join(row['mismatched_fields']) or '—'} |")
    lines += ['', '## Interpretation', '',
              'Use these failures to prioritize development and label review. Do not tune against these cases and describe a rerun as an independent benchmark. The next quality decision requires representative anonymized shop samples, reviewed labels and a fresh held-out set. The historical v1 reports remain unchanged.', '',
              'The companion JSON contains language/scenario metrics, field precision/recall, missing-value metrics, default corrections, unsupported values, protocol hashes and machine details. It omits source messages, quotations and field values. Raw local results remain outside Git.', '']
    return '\n'.join(lines)


def evaluate(output, server_factory=Server, extract_fn=extract, baseline_fn=baseline):
    rows = cases()
    frozen = protocol()
    directory = external(output)
    directory.mkdir(parents=True, exist_ok=False)
    path = directory / 'run.json'
    record = {'experiment': 'prototype-development-v1', 'status': 'running',
              'protocol': frozen, 'machine': machine(),
              'started_at': datetime.now(timezone.utc).isoformat(), 'warmups': [], 'runs': {}}
    save(path, record)
    try:
        record['runs']['baseline'], record['baseline_runtime'] = baseline_fn(rows)
        save(path, record)
        config = json.loads((ROOT / 'config.json').read_text())
        with server_factory('qwen3-4b', directory, config) as server:
            record['startup'] = {'cold_start_ms': server.cold_start_ms, 'binary_sha256': server.binary_sha256}
            for i in range(2):
                record['warmups'].append(extract_fn({'id': f'warmup-{i}', 'text': 'Product: Tea\nQty: 1\nUnit price: 1000\nDelivery fee: 0'}, server.base))
            record['runs']['prototype'] = []
            for i, case in enumerate(rows):
                result = extract_fn(case, server.base)
                result['rss_bytes'] = server.peak
                record['runs']['prototype'].append(result)
                save(path, record)
                print(f"{i + 1}/{len(rows)} {case['id']}: {result.get('reason') or result.get('error') or 'accepted'}", flush=True)
        if protocol() != frozen:
            raise ValueError('Inputs changed during evaluation')
        record.update(status='complete', completed_at=datetime.now(timezone.utc).isoformat())
        report = comparison(record)
        save(directory / 'comparison.json', report)
        (directory / 'comparison.md').write_text(markdown(report))
    except BaseException as error:
        record.update(status='failed', failure=type(error).__name__)
        raise
    finally:
        save(path, record)
    return record


def main():
    os.umask(0o077)
    def interrupted(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    run = sub.add_parser('run'); run.add_argument('--output', type=Path, required=True)
    report = sub.add_parser('report'); report.add_argument('run', type=Path)
    args = parser.parse_args()
    if args.command == 'run':
        evaluate(args.output)
    else:
        path = external(args.run)
        result = comparison(json.loads(path.read_text()))
        save(path.parent / 'comparison.json', result)
        (path.parent / 'comparison.md').write_text(markdown(result))


if __name__ == '__main__':
    main()
