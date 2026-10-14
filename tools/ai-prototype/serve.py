"""Run the already-pinned local model for the development-only web prototype."""
import json
from pathlib import Path
import signal
import sys
import tempfile
import threading

EVALUATION = Path(__file__).resolve().parents[1] / 'ai-evaluation'
sys.path.insert(0, str(EVALUATION))
from fom_eval.runtime import Server  # noqa: E402


def main():
    stopped = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stopped.set())
    config = json.loads((EVALUATION / 'config.json').read_text())
    # Only runtime logs go here; no datasets, requests or model responses are saved.
    with tempfile.TemporaryDirectory(prefix='fom-ai-prototype-') as directory:
        with Server('qwen3-4b', Path(directory), config) as server:
            print('Local Qwen3-4B ready. Keep this terminal open; Ctrl+C stops it.', flush=True)
            print(f'FOM_AI_LOCAL_URL={server.base}', flush=True)
            while not stopped.wait(1):
                if server.process.poll() is not None:
                    raise RuntimeError('Local inference process exited. Restart the launcher.')
    print('Local inference stopped; cached weights retained.', flush=True)


if __name__ == '__main__':
    main()
