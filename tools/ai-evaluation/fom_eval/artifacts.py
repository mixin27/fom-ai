"""Download only manifest-selected artifacts, outside the repository."""

import hashlib
import json
import os
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]


def external(path: Path) -> Path:
    path = path.expanduser().resolve()
    if path == REPO or REPO in path.parents:
        raise ValueError(
            "Models, runtimes, private data and raw runs must be outside the repository"
        )
    return path


def cache_dir() -> Path:
    return external(Path(os.environ.get("FOM_AI_CACHE", "~/.cache/fom-ai-evaluation")))


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def manifest() -> dict:
    return json.loads((ROOT / "artifacts.json").read_text())


def download(info: dict, destination: Path):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if (
        destination.exists()
        and destination.stat().st_size == info["size"]
        and sha256(destination) == info["sha256"]
    ):
        print(f"Verified cached {destination.name}", flush=True)
        return
    url = (
        info.get("url")
        or f"https://huggingface.co/{info['repository']}/resolve/{info['revision']}/{info['filename']}"
    )
    temp = destination.with_suffix(destination.suffix + ".partial")
    print(f'Downloading {destination.name} ({info["size"]:,} bytes)', flush=True)
    with urllib.request.urlopen(url, timeout=60) as response, temp.open("wb") as out:
        while block := response.read(1024 * 1024):
            out.write(block)
    if temp.stat().st_size != info["size"] or sha256(temp) != info["sha256"]:
        raise ValueError(f"Artifact integrity failure: {destination.name}")
    temp.replace(destination)
    print(f"Verified {destination.name}", flush=True)


def prepare():
    config, cache = manifest(), cache_dir()
    runtime = config["runtime"]
    archive = cache / runtime["filename"]
    download(runtime, archive)
    directory = cache / runtime["release"]
    directory.mkdir(exist_ok=True)
    with tarfile.open(archive) as bundle:
        bundle.extractall(directory, filter="data")
    for model in config["models"].values():
        download(model, cache / model["filename"])
