"""Small public-content guard; not a comprehensive secret or personal-data scanner."""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_DIRECTORIES = {"node_modules", ".venv", "__pycache__", "models", "runtime", "private", "runs", ".cache"}
FORBIDDEN_SUFFIXES = {".gguf", ".safetensors", ".bin", ".pem", ".key", ".dump", ".backup", ".log"}
PATTERNS = [
    re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(rb"(?:postgres(?:ql)?|mysql)://[^\s/:]+:[^\s/@]+@", re.I),
    re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|AKIA[A-Z0-9]{16})\b"),
]


def issues(path: Path, relative: Path) -> list[str]:
    problems = []
    if path.is_symlink():
        return ["symlinks must not expose external files"]
    if any(p in FORBIDDEN_DIRECTORIES for p in relative.parts):
        problems.append("private/generated directory")
    if relative.suffix in FORBIDDEN_SUFFIXES or (relative.name.startswith('.env') and relative.name != '.env.example'):
        problems.append("private/binary/environment file")
    if path.stat().st_size > 3_000_000:
        problems.append("large file requires explicit publication review")
        return problems
    data = path.read_bytes()
    if b'\0' in data:
        problems.append("unexpected binary content")
    if any(pattern.search(data) for pattern in PATTERNS):
        problems.append("possible credential; inspect privately")
    return problems


def main():
    names = subprocess.check_output(
        ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT
    ).decode().split('\0')
    failures = []
    for name in sorted(set(filter(None, names))):
        path = ROOT / name
        if not path.exists() and not path.is_symlink():
            continue
        for issue in issues(path, Path(name)):
            failures.append(f'{name}: {issue}')
    if failures:
        print('\n'.join(failures), file=sys.stderr)
        return 1
    print('Public-content guard passed. Review staged data manually before publication.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
