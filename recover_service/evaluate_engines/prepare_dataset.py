from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import chess

from service import recovery


METADATA_PATTERN = re.compile(r"^#\s*([a-zA-Z_][\w-]*)\s*:\s*(.*?)\s*$")


def main() -> int:
    args = _parse_args()
    files = _input_files(args.input)
    games: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    seen_ids: set[str] = set()

    for path in files:
        try:
            game = _prepare_file(path, args.input)
            if game["id"] in seen_ids:
                raise ValueError(f"Duplicate game id: {game['id']}")
            seen_ids.add(game["id"])
            games.append(game)
            print(f"OK    {path.name}: {len(game['fenHistory'])} FENs")
        except Exception as exc:
            failures.append(
                {
                    "sourceFile": str(path),
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )
            print(f"ERROR {path.name}: {exc}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    _write_jsonl(args.output, games)
    failure_path = args.output.parent / "prepare_failures.jsonl"
    _write_jsonl(failure_path, failures)
    print(f"Prepared {len(games)} games -> {args.output}")
    if failures:
        print(f"Rejected {len(failures)} files -> {failure_path}")
    return 1 if failures else 0


def _prepare_file(path: Path, input_path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8-sig")
    metadata = _metadata(text)
    history = recovery.parse_fen_text(text)
    start_fen = metadata.get("start_fen", chess.STARTING_FEN)
    recovery._load_start_board(start_fen)
    game_id = metadata.get("id", path.stem).strip()
    if not game_id:
        raise ValueError("Game id cannot be empty")

    source = path.name
    if input_path.is_dir():
        source = str(path.relative_to(input_path))
    return {
        "id": game_id,
        "fenHistory": history,
        "startFen": start_fen,
        "targetUciMoves": None,
        "sourceFile": source,
        "groundTruthAvailable": False,
        "recoveryAccuracyMode": "baseline_compatible",
    }


def _metadata(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in text.splitlines():
        match = METADATA_PATTERN.match(line.strip())
        if match:
            result[match.group(1).lower().replace("-", "_")] = match.group(2)
    return result


def _input_files(path: Path) -> list[Path]:
    if path.is_file():
        return [path]
    if not path.is_dir():
        raise ValueError(f"Input does not exist: {path}")
    files = sorted(item for item in path.iterdir() if item.is_file() and item.suffix.lower() == ".fen")
    if not files:
        raise ValueError(f"No .fen files found in {path}")
    return files


def _write_jsonl(path: Path, values: list[dict[str, Any]]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        for value in values:
            handle.write(json.dumps(value, ensure_ascii=False) + "\n")
    temporary.replace(path)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert raw numbered FEN files to evaluation JSONL")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())

