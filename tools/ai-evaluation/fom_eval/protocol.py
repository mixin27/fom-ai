import hashlib
import json
import platform
import subprocess
from .artifacts import ROOT, REPO, sha256
from .contract import Extraction


def fingerprint():
    files = [
        ROOT / "prompt.txt",
        ROOT / "schema.json",
        ROOT / "config.json",
        ROOT / "artifacts.json",
        ROOT / "requirements.txt",
        ROOT / "datasets/synthetic-v1.jsonl",
        REPO / "apps/api/scripts/evaluate-order-parser.ts",
    ]
    files += sorted((ROOT / "fom_eval").glob("*.py"))
    files += sorted((REPO / "apps/api/src/orders").glob("order-message-parser*.ts"))
    return {
        "files": {str(p.relative_to(REPO)): sha256(p) for p in files},
        "schema_sha256": hashlib.sha256(
            json.dumps(Extraction.model_json_schema(), sort_keys=True).encode()
        ).hexdigest(),
    }


def verify_freeze():
    frozen = json.loads((ROOT / "frozen-public-v1.json").read_text())
    if frozen != fingerprint():
        raise ValueError(
            "Frozen evaluation changed. Do not reuse held-out evidence after tuning; create a new evaluation version."
        )
    return frozen


def machine():
    result = {
        "platform": platform.platform(),
        "architecture": platform.machine(),
        "python": platform.python_version(),
        "measurement_scope": "this machine only; sampled process RSS excludes separate Metal allocations and total system pressure",
    }
    if platform.system() == "Darwin":
        for key in ("hw.memsize", "machdep.cpu.brand_string", "hw.physicalcpu"):
            result[key] = subprocess.check_output(
                ["sysctl", "-n", key], text=True
            ).strip()
    return result
