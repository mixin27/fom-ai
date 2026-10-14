"""Optional, read-only implementation parity check against a local FOM checkout."""
import argparse
import hashlib
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('platform', type=Path)
    args = parser.parse_args()
    candidates = list((ROOT / 'apps/api/src/orders/ai').glob('*.ts'))
    candidates += list((ROOT / 'apps/api/src/orders').glob('order-message-parser*.ts'))
    candidates += [ROOT / 'apps/api/src/common/http/app-http.exception.ts',
                   ROOT / 'apps/api/scripts/evaluate-local-ai.ts',
                   ROOT / 'apps/api/scripts/evaluate-order-parser.ts']
    differing = []
    for path in candidates:
        if path.name.endswith('.spec.ts'):
            continue
        relative = path.relative_to(ROOT)
        other = args.platform / relative
        if not other.is_file() or hashlib.sha256(path.read_bytes()).digest() != hashlib.sha256(other.read_bytes()).digest():
            differing.append(str(relative))
    if differing:
        print('Implementation drift (not automatically synchronized):\n' + '\n'.join(differing))
        return 1
    print('Extraction and baseline implementation match the supplied FOM checkout.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
