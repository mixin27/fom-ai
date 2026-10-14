import importlib.util
import json
from pathlib import Path

from fom_eval.artifacts import ROOT, REPO
from fom_eval.protocol import verify_freeze

spec = importlib.util.spec_from_file_location('public_guard', REPO / 'scripts/check_public.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


def test_public_freeze_is_explicit_and_preserves_historical_manifest():
    historical = json.loads((ROOT / 'frozen-v1.json').read_text())
    current = verify_freeze()
    assert current != historical
    assert set(current['files']) == set(historical['files'])
    changed = {p for p, digest in current['files'].items() if digest != historical['files'][p]}
    assert changed == {
        'apps/api/src/orders/order-message-parser.service.spec.ts',
        'tools/ai-evaluation/fom_eval/protocol.py',
        'tools/ai-evaluation/fom_eval/__main__.py',
    }


def test_public_guard_rejects_private_paths_and_credentials_without_echo(tmp_path):
    path = tmp_path / 'sample.txt'
    path.write_text('synthetic fixture only')
    assert guard.issues(path, Path('examples/order.txt')) == []
    assert guard.issues(path, Path('private/message.txt'))
    assert guard.issues(path, Path('.env.production'))
    env = tmp_path / '.env.production'
    env.write_text('synthetic')
    assert guard.issues(env, Path('.env.production'))
    secret = 'postgresql://' + 'sample:synthetic@localhost/db'
    path.write_text(secret)
    errors = guard.issues(path, Path('sample.txt'))
    assert errors and all(secret not in error for error in errors)
    path.write_text('-----BEGIN ' + 'PRIVATE KEY-----')
    assert guard.issues(path, Path('sample.txt'))


def test_public_guard_rejects_external_symlinks(tmp_path):
    target = tmp_path / 'outside.txt'
    target.write_text('private')
    link = tmp_path / 'link.txt'
    link.symlink_to(target)
    assert guard.issues(link, Path('link.txt'))
