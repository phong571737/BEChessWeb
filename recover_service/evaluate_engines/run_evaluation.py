from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import os
import platform
import shlex
import shutil
import sys
import time
from pathlib import Path
from typing import Any, Iterable

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from evaluate_engines.dataset import GameCase, load_dataset
from evaluate_engines.evaluator import EvaluationRun, recover_case
from evaluate_engines.generators import (
    BruteforceGenerator,
    CandidateGenerator,
    UciGenerator,
    UciLimit,
)
from evaluate_engines.metrics import ResourceSampler, aggregate_records, score_game


MODEL_NAMES = (
    "bruteforce",
    "stockfish",
    "leela",
    "maia_1900",
    "maia3_79m",
)
EVALUATION_SCHEMA_VERSION = 2


def main() -> int:
    args = _parse_args()
    games = load_dataset(args.dataset)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = args.output_dir / "checkpoint.jsonl"
    baseline_cache_dir = args.output_dir / "baseline_cache"
    baseline_cache_dir.mkdir(exist_ok=True)
    completed, records = _load_checkpoint(checkpoint_path)
    selected = _parse_models(args.models)
    generators, setup_failures = _build_generators(selected, args)
    failures: list[dict[str, Any]] = list(setup_failures)

    try:
        for index, game in enumerate(games, start=1):
            print(f"[{index}/{len(games)}] {game.game_id}", flush=True)
            baseline_generator = BruteforceGenerator()
            try:
                cached_baseline = _load_baseline_cache(baseline_cache_dir, game)
                if cached_baseline is None:
                    baseline_record, baseline_run = _execute(
                        game,
                        baseline_generator,
                        baseline_lines=None,
                        top_k=args.top_k,
                        max_branches=args.max_branches,
                    )
                    _save_baseline_cache(
                        baseline_cache_dir,
                        game,
                        baseline_record,
                        baseline_run,
                    )
                else:
                    baseline_record, baseline_run = cached_baseline
            except Exception as exc:
                failure = _failure(game.game_id, "bruteforce", exc)
                failures.append(failure)
                print(f"  bruteforce: ERROR {exc}", flush=True)
                continue

            if "bruteforce" in selected and (game.game_id, "bruteforce") not in completed:
                _append_jsonl(checkpoint_path, baseline_record)
                records.append(baseline_record)
                completed.add((game.game_id, "bruteforce"))
            print(
                f"  bruteforce: {len(baseline_run.lines)} final lines",
                flush=True,
            )

            for model, generator in generators.items():
                if model == "bruteforce" or (game.game_id, model) in completed:
                    continue
                try:
                    record, run = _execute(
                        game,
                        generator,
                        baseline_lines=baseline_run.lines,
                        top_k=args.top_k,
                        max_branches=args.max_branches,
                    )
                    _append_jsonl(checkpoint_path, record)
                    records.append(record)
                    completed.add((game.game_id, model))
                    print(f"  {model}: {len(run.lines)} final lines", flush=True)
                except Exception as exc:
                    failure = _failure(game.game_id, model, exc)
                    failures.append(failure)
                    print(f"  {model}: ERROR {exc}", flush=True)
    finally:
        for generator in generators.values():
            try:
                generator.close()
            except Exception:
                pass

    game_ids = {game.game_id for game in games}
    current_records = [
        record
        for record in records
        if record.get("gameId") in game_ids and record.get("model") in selected
        and record.get("schemaVersion") == EVALUATION_SCHEMA_VERSION
    ]
    summaries = aggregate_records(current_records)
    _write_outputs(args.output_dir, current_records, failures, summaries, args)
    print(f"Results: {args.output_dir.resolve()}", flush=True)
    return 0 if not failures else 1


def _execute(
    game: GameCase,
    generator: CandidateGenerator,
    *,
    baseline_lines: tuple[tuple[str, ...], ...] | None,
    top_k: int,
    max_branches: int | None,
) -> tuple[dict[str, Any], EvaluationRun]:
    sampler = ResourceSampler()
    sampler.start()
    started = time.perf_counter()
    try:
        run = recover_case(
            game,
            generator,
            top_k=top_k,
            max_branches=max_branches,
        )
    finally:
        latency = time.perf_counter() - started
        resources = sampler.stop()

    reference = baseline_lines if baseline_lines is not None else run.lines
    metrics = score_game(
        proposal_events=run.proposal_events,
        baseline_lines=reference,
        recovered_lines=run.lines,
        target_line=(
            game.target_uci_moves if game.ground_truth_available else None
        ),
        ranked=generator.ranked,
    )
    performance = {
        "latencySeconds": latency,
        "proposalLatencySeconds": run.proposal_latency_seconds,
        "proposalCount": run.proposal_count,
        "proposalsPerSecond": (
            run.proposal_count / run.proposal_latency_seconds
            if run.proposal_latency_seconds
            else None
        ),
        **resources,
    }
    return (
        {
            "status": "ok",
            "schemaVersion": EVALUATION_SCHEMA_VERSION,
            "gameId": game.game_id,
            "sourceFile": game.source_file,
            "groundTruthAvailable": game.ground_truth_available,
            "model": generator.name,
            "finalLineCount": len(run.lines),
            "metrics": metrics,
            "performance": performance,
        },
        run,
    )


def _build_generators(
    selected: set[str],
    args: argparse.Namespace,
) -> tuple[dict[str, CandidateGenerator], list[dict[str, Any]]]:
    generators: dict[str, CandidateGenerator] = {}
    failures: list[dict[str, Any]] = []
    if "bruteforce" in selected:
        generators["bruteforce"] = BruteforceGenerator()

    limit = UciLimit(args.uci_time, args.uci_depth, args.uci_nodes)
    specifications: dict[str, tuple[list[str] | None, dict[str, object]]] = {
        "stockfish": (_plain_command(args.stockfish_path, "stockfish"), {}),
        "leela": (
            _lc0_command(args.leela_path, args.leela_weights),
            _json_options("LEELA_OPTIONS"),
        ),
        "maia_1900": (
            _lc0_command(args.maia_1900_path or args.leela_path, args.maia_1900_weights),
            _json_options("MAIA_1900_OPTIONS"),
        ),
        "maia3_79m": (
            _maia3_command(
                args.maia3_path,
                args.maia3_checkpoint,
                args.maia3_elo,
            ),
            _json_options("MAIA3_OPTIONS"),
        ),
    }
    for name in MODEL_NAMES:
        if name == "bruteforce" or name not in selected:
            continue
        command, options = specifications[name]
        if command is None:
            failures.append(
                {
                    "status": "setup_error",
                    "gameId": None,
                    "model": name,
                    "error": "Engine path or required weights are missing",
                }
            )
            continue
        try:
            generators[name] = UciGenerator(
                name,
                command,
                limit=limit,
                options=options,
            )
        except Exception as exc:
            failures.append(_failure(None, name, exc, status="setup_error"))
    return generators, failures


def _plain_command(value: str | None, fallback: str) -> list[str] | None:
    executable = value or shutil.which(fallback)
    return shlex.split(executable) if executable else None


def _lc0_command(engine_path: str | None, weights: str | None) -> list[str] | None:
    executable = engine_path or shutil.which("lc0")
    if not executable or not weights:
        return None
    return [*shlex.split(executable), f"--weights={weights}"]


def _maia3_command(
    path: str | None,
    checkpoint: str | None,
    elo: int | None,
) -> list[str] | None:
    executable = path or shutil.which("maia3-uci")
    if not executable:
        return None
    preset = "maia3-79m" if checkpoint else "79m"
    command = [*shlex.split(executable), "--model", preset]
    if checkpoint:
        command.extend(["--checkpoint-path", checkpoint])
    command.append("--use-uci-history")
    if elo is not None:
        command.extend(["--elo", str(elo)])
    return command


def _json_options(environment_name: str) -> dict[str, object]:
    value = os.getenv(environment_name)
    if not value:
        return {}
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise ValueError(f"{environment_name} must be a JSON object")
    return parsed


def _load_checkpoint(path: Path) -> tuple[set[tuple[str, str]], list[dict[str, Any]]]:
    records: list[dict[str, Any]] = []
    if path.exists():
        records = [
            json.loads(line)
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    completed = {
        (str(item["gameId"]), str(item["model"]))
        for item in records
        if item.get("status") == "ok"
        and item.get("schemaVersion") == EVALUATION_SCHEMA_VERSION
    }
    return completed, records


def _baseline_cache_path(directory: Path, game: GameCase) -> Path:
    content = json.dumps(
        {
            "schemaVersion": EVALUATION_SCHEMA_VERSION,
            "id": game.game_id,
            "fenHistory": game.fen_history,
            "targetUciMoves": game.target_uci_moves,
            "startFen": game.start_fen,
        },
        sort_keys=True,
    ).encode("utf-8")
    return directory / f"{hashlib.sha256(content).hexdigest()}.json.gz"


def _load_baseline_cache(
    directory: Path,
    game: GameCase,
) -> tuple[dict[str, Any], EvaluationRun] | None:
    path = _baseline_cache_path(directory, game)
    if not path.exists():
        return None
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        payload = json.load(handle)
    run = EvaluationRun(
        lines=tuple(tuple(line) for line in payload["lines"]),
        proposal_events=(),
        proposal_count=0,
        proposal_latency_seconds=0.0,
    )
    return payload["record"], run


def _save_baseline_cache(
    directory: Path,
    game: GameCase,
    record: dict[str, Any],
    run: EvaluationRun,
) -> None:
    path = _baseline_cache_path(directory, game)
    with gzip.open(path, "wt", encoding="utf-8") as handle:
        json.dump({"record": record, "lines": run.lines}, handle)


def _append_jsonl(path: Path, value: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(value, ensure_ascii=False) + "\n")


def _write_outputs(
    output_dir: Path,
    records: list[dict[str, Any]],
    failures: list[dict[str, Any]],
    summaries: list[dict[str, Any]],
    args: argparse.Namespace,
) -> None:
    _write_jsonl(output_dir / "per_game.jsonl", records)
    _write_jsonl(output_dir / "failures.jsonl", failures)
    metadata = {
        "python": sys.version,
        "schemaVersion": EVALUATION_SCHEMA_VERSION,
        "platform": platform.platform(),
        "dataset": str(args.dataset.resolve()),
        "models": sorted(_parse_models(args.models)),
        "topK": args.top_k,
        "maxBranches": args.max_branches,
        "gamesWithGroundTruth": len(
            {
                record.get("gameId")
                for record in records
                if record.get("groundTruthAvailable")
            }
        ),
    }
    (output_dir / "summary.json").write_text(
        json.dumps({"metadata": metadata, "models": summaries}, indent=2),
        encoding="utf-8",
    )
    if summaries:
        with (output_dir / "summary.csv").open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(summaries[0]))
            writer.writeheader()
            writer.writerows(summaries)


def _write_jsonl(path: Path, values: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for value in values:
            handle.write(json.dumps(value, ensure_ascii=False) + "\n")


def _failure(
    game_id: str | None,
    model: str,
    exc: Exception,
    *,
    status: str = "error",
) -> dict[str, Any]:
    return {
        "status": status,
        "gameId": game_id,
        "model": model,
        "error": f"{type(exc).__name__}: {exc}",
    }


def _parse_models(value: str) -> set[str]:
    models = {item.strip() for item in value.split(",") if item.strip()}
    unknown = models - set(MODEL_NAMES)
    if unknown:
        raise ValueError(f"Unknown models: {', '.join(sorted(unknown))}")
    return models


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate FEN recovery candidate engines")
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument(
        "--models",
        default=",".join(MODEL_NAMES),
        help="Comma-separated model names",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "outputs",
    )
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--max-branches", type=int)
    parser.add_argument("--uci-time", type=float, default=0.1)
    parser.add_argument("--uci-depth", type=int)
    parser.add_argument("--uci-nodes", type=int)
    parser.add_argument("--stockfish-path", default=os.getenv("STOCKFISH_PATH"))
    parser.add_argument("--leela-path", default=os.getenv("LEELA_PATH"))
    parser.add_argument("--leela-weights", default=os.getenv("LEELA_WEIGHTS"))
    parser.add_argument("--maia-1900-path", default=os.getenv("MAIA_1900_PATH"))
    parser.add_argument("--maia-1900-weights", default=os.getenv("MAIA_1900_WEIGHTS"))
    parser.add_argument("--maia3-path", default=os.getenv("MAIA3_PATH"))
    parser.add_argument("--maia3-checkpoint", default=os.getenv("MAIA3_CHECKPOINT"))
    parser.add_argument(
        "--maia3-elo",
        type=int,
        default=(int(os.environ["MAIA3_ELO"]) if os.getenv("MAIA3_ELO") else None),
    )
    args = parser.parse_args()
    if args.top_k < 1:
        parser.error("--top-k must be at least 1")
    if args.max_branches is not None and args.max_branches < 1:
        parser.error("--max-branches must be at least 1")
    return args


if __name__ == "__main__":
    raise SystemExit(main())
