from __future__ import annotations

import statistics
from collections import defaultdict
from typing import Any, Iterable, Mapping, Sequence


def score_game(
    *,
    proposal_events: Sequence[Mapping[str, Any]],
    baseline_lines: Sequence[Sequence[str]],
    recovered_lines: Sequence[Sequence[str]],
    target_line: Sequence[str] | None,
    ranked: bool,
) -> dict[str, Any]:
    baseline_prefixes = _prefix_targets(baseline_lines)
    hit_ranks: list[int] = []
    evaluated = 0
    misses = 0

    if ranked:
        for event in proposal_events:
            prefix = tuple(event["prefix"])
            targets = baseline_prefixes.get(prefix)
            if not targets:
                continue
            evaluated += 1
            rank = _first_hit_rank(event["candidates"], targets)
            if rank is None:
                misses += 1
            else:
                hit_ranks.append(rank)

    recovered = {tuple(line) for line in recovered_lines}
    baseline = {tuple(line) for line in baseline_lines}
    exact_recovery_hit = (
        tuple(target_line) in recovered if target_line is not None else None
    )
    baseline_compatible_hit = (
        bool(recovered & baseline) if target_line is None else None
    )

    return {
        "rankingEvents": evaluated,
        "hitRanks": hit_ranks,
        "hitAt1": sum(rank <= 1 for rank in hit_ranks),
        "hitAt3": sum(rank <= 3 for rank in hit_ranks),
        "hitAt5": sum(rank <= 5 for rank in hit_ranks),
        "misses": misses,
        "meanHitRank": statistics.fmean(hit_ranks) if hit_ranks else None,
        "medianHitRank": statistics.median(hit_ranks) if hit_ranks else None,
        "mrr": (
            sum(1.0 / rank for rank in hit_ranks) / evaluated if evaluated else None
        ),
        "recoveryAccuracyMode": (
            "exact_target" if target_line is not None else "baseline_compatible"
        ),
        "exactRecoveryHit": exact_recovery_hit,
        "baselineCompatibleRecoveryHit": baseline_compatible_hit,
    }


def aggregate_records(records: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for record in records:
        if record.get("status") == "ok":
            grouped[str(record["model"])].append(record)

    summaries: list[dict[str, Any]] = []
    for model, items in sorted(grouped.items()):
        ranks = [rank for item in items for rank in item["metrics"]["hitRanks"]]
        events = sum(item["metrics"]["rankingEvents"] for item in items)
        misses = sum(item["metrics"]["misses"] for item in items)
        latency = [float(item["performance"]["latencySeconds"]) for item in items]
        total_latency = sum(latency)
        summaries.append(
            {
                "model": model,
                "games": len(items),
                "hitAt1": _rate(items, "hitAt1", events),
                "hitAt3": _rate(items, "hitAt3", events),
                "hitAt5": _rate(items, "hitAt5", events),
                "meanHitRank": statistics.fmean(ranks) if ranks else None,
                "medianHitRank": statistics.median(ranks) if ranks else None,
                "mrr": (
                    sum(1.0 / rank for rank in ranks) / events if events else None
                ),
                "missRate": misses / events if events else None,
                "exactRecoveryAccuracy": _recovery_rate(
                    items,
                    "exactRecoveryHit",
                ),
                "baselineCompatibleRecoveryRate": _recovery_rate(
                    items,
                    "baselineCompatibleRecoveryHit",
                ),
                "latencyP50Seconds": _percentile(latency, 50),
                "latencyP95Seconds": _percentile(latency, 95),
                "throughputGamesPerSecond": (
                    len(items) / total_latency if total_latency else None
                ),
                "meanCpuPercent": _mean_resource(items, "meanCpuPercent"),
                "peakRssMb": max(
                    float(item["performance"].get("peakRssMb") or 0.0)
                    for item in items
                ),
                "meanGpuPercent": _mean_resource(items, "meanGpuPercent"),
                "peakVramMb": max(
                    float(item["performance"].get("peakVramMb") or 0.0)
                    for item in items
                ),
            }
        )
    return summaries


def _prefix_targets(lines: Sequence[Sequence[str]]) -> dict[tuple[str, ...], set[str]]:
    result: dict[tuple[str, ...], set[str]] = defaultdict(set)
    for line in lines:
        for index, move in enumerate(line):
            result[tuple(line[:index])].add(move)
    return result


def _first_hit_rank(candidates: Sequence[str], targets: set[str]) -> int | None:
    return next(
        (rank for rank, move in enumerate(candidates, start=1) if move in targets),
        None,
    )


def _rate(items: Sequence[Mapping[str, Any]], key: str, total: int) -> float | None:
    if not total:
        return None
    return sum(int(item["metrics"][key]) for item in items) / total


def _mean_resource(items: Sequence[Mapping[str, Any]], key: str) -> float | None:
    values = [
        float(item["performance"][key])
        for item in items
        if item["performance"].get(key) is not None
    ]
    return statistics.fmean(values) if values else None


def _recovery_rate(
    items: Sequence[Mapping[str, Any]],
    key: str,
) -> float | None:
    values = [
        bool(item["metrics"][key])
        for item in items
        if item["metrics"].get(key) is not None
    ]
    return sum(values) / len(values) if values else None


def _percentile(values: Sequence[float], percentile: int) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = (len(ordered) - 1) * percentile / 100
    lower = int(index)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = index - lower
    return ordered[lower] * (1 - fraction) + ordered[upper] * fraction
