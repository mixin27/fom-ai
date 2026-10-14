"""Deterministic semantic scoring. Nulls are not treated as extracted facts."""

from collections import defaultdict
import math
from .contract import flatten, normalize, totals


def matches(actual, expected, field, alternatives):
    return any(
        normalize(actual, field) == normalize(option, field)
        for option in [expected, *alternatives.get(field, [])]
    )


def assignment(cost):
    """Minimum-cost square assignment, Hungarian algorithm, deterministic tie order."""
    n = len(cost)
    u, v, p, way = [0] * (n + 1), [0] * (n + 1), [0] * (n + 1), [0] * (n + 1)
    for i in range(1, n + 1):
        p[0] = i
        j0, minimum, used = 0, [math.inf] * (n + 1), [False] * (n + 1)
        while True:
            used[j0] = True
            i0, delta, j1 = p[j0], math.inf, 0
            for j in range(1, n + 1):
                if not used[j]:
                    current = cost[i0 - 1][j - 1] - u[i0] - v[j]
                    if current < minimum[j]:
                        minimum[j], way[j] = current, j0
                    if minimum[j] < delta:
                        delta, j1 = minimum[j], j
            for j in range(n + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minimum[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break
    result = [0] * n
    for j in range(1, n + 1):
        result[p[j] - 1] = j - 1
    return result


def align_items(expected, actual, alternatives):
    n = max(len(expected), len(actual))
    if not n:
        return []
    costs = []
    for i in range(n):
        costs.append([])
        for j in range(n):
            if i >= len(expected) or j >= len(actual):
                cost = 20
            else:
                # Product match dominates; quantities/prices disambiguate identical names.
                cost = sum(
                    weight
                    * (
                        not matches(
                            actual[j][key],
                            expected[i][key],
                            f"items.{i}.{key}",
                            alternatives,
                        )
                    )
                    for key, weight in [
                        ("product_name", 10),
                        ("qty", 2),
                        ("unit_price", 2),
                    ]
                )
            costs[-1].append(cost)
    return assignment(costs)


def score(case: dict, run: dict) -> dict:
    expected, actual = case["expected"], run.get("draft")
    # Failed requests miss every expected fact and never earn missing-value correctness.
    valid = run.get("error") is None and actual is not None
    actual = actual or {
        "customer": dict.fromkeys(expected["customer"]),
        "items": [],
        "delivery_fee": None,
        "note": None,
    }
    mapping = align_items(expected["items"], actual["items"], case["alternatives"])
    aligned = {
        **actual,
        "items": [
            (
                actual["items"][j]
                if j < len(actual["items"])
                else dict.fromkeys(("product_name", "qty", "unit_price"))
            )
            for j in mapping
        ],
    }
    e, a = flatten(expected), flatten(aligned)
    counters = defaultdict(int)
    fields, errors = {}, []
    raw_defaults = set(run.get("defaults", []))
    defaults = {
        f"items.{i}.{key}"
        for i, j in enumerate(mapping)
        for key in ("product_name", "qty", "unit_price")
        if f"items.{j}.{key}" in raw_defaults
    } | {k for k in raw_defaults if not k.startswith("items.")}
    for field in sorted(e.keys() | a.keys()):
        want, got = e.get(field), a.get(field)
        same = matches(got, want, field, case["alternatives"])
        kind = (
            field if not field.startswith("items.") else "items." + field.split(".")[-1]
        )
        metric = fields.setdefault(
            kind, {"tp": 0, "fp": 0, "fn": 0, "missing_total": 0, "missing_correct": 0}
        )
        if want is None:
            metric["missing_total"] += 1
            if got is None and valid:
                metric["missing_correct"] += 1
        if same and got is not None:
            metric["tp"] += 1
        elif not same:
            if got is not None:
                metric["fp"] += 1
            if want is not None:
                metric["fn"] += 1
            errors.append(
                {
                    "field": field,
                    "expected": want,
                    "actual": got,
                    "baseline_default": field in defaults,
                }
            )
            if got is not None:
                counters["unsupported_values"] += 1
                counters[
                    (
                        "default_corrections"
                        if field in defaults
                        else "unsupported_nondefault_values"
                    )
                ] += 1
            if field.endswith(".phone"):
                counters["phone_errors"] += 1
            if field.endswith(".qty"):
                counters["quantity_errors"] += 1
            if field.endswith(".unit_price") or field == "delivery_fee":
                counters["price_errors"] += 1
    counters["critical_errors"] = (
        counters["phone_errors"]
        + counters["quantity_errors"]
        + counters["price_errors"]
    )
    return {
        "id": case["id"],
        "valid": valid,
        "schema_valid": run.get("schema_valid", False),
        "evidence_valid": run.get("evidence_valid", False),
        "failure": run.get("error"),
        "complete": valid
        and not errors
        and len(actual["items"]) == len(expected["items"]),
        "item_count_correct": valid and len(actual["items"]) == len(expected["items"]),
        "fields": fields,
        "errors": errors,
        "counts": dict(counters),
        "totals": totals(actual),
        "expected_totals": totals(expected),
    }


def percentile(values, q):
    if not values:
        return None
    values = sorted(values)
    pos = (len(values) - 1) * q
    low = int(pos)
    high = min(low + 1, len(values) - 1)
    return round(values[low] + (values[high] - values[low]) * (pos - low), 2)


def aggregate(scores, runs):
    n = len(scores)
    fields = {}
    counts = defaultdict(int)
    for row in scores:
        for kind, metrics in row["fields"].items():
            target = fields.setdefault(kind, defaultdict(int))
            for key, value in metrics.items():
                target[key] += value
        for key, value in row["counts"].items():
            counts[key] += value
    for kind, metric in fields.items():
        metric["precision"] = (
            metric["tp"] / (metric["tp"] + metric["fp"])
            if metric["tp"] + metric["fp"]
            else None
        )
        metric["recall"] = (
            metric["tp"] / (metric["tp"] + metric["fn"])
            if metric["tp"] + metric["fn"]
            else None
        )
    latencies = [r["latency_ms"] for r in runs if r.get("latency_ms") is not None]
    return {
        "cases": n,
        "failures": sum(not s["valid"] for s in scores),
        "schema_valid": sum(s["schema_valid"] for s in scores),
        "evidence_valid": sum(s["evidence_valid"] for s in scores),
        "complete_drafts": sum(s["complete"] for s in scores),
        "item_count_correct": sum(s["item_count_correct"] for s in scores),
        "counts": dict(counts),
        "fields": fields,
        "warm_latency_p50_ms": percentile(latencies, 0.5),
        "warm_latency_p95_ms": percentile(latencies, 0.95),
        "timed_requests": len(latencies),
        "peak_sampled_rss_bytes": max((r.get("rss_bytes", 0) for r in runs), default=0),
    }
