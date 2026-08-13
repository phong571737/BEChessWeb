from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

import chess


@dataclass(frozen=True)
class GameCase:
    game_id: str
    fen_history: tuple[str, ...]
    target_uci_moves: tuple[str, ...] | None
    start_fen: str
    headers: Mapping[str, str]
    source_file: str | None
    ground_truth_available: bool

    @property
    def recovery_accuracy_mode(self) -> str:
        return "exact_target" if self.ground_truth_available else "baseline_compatible"


def load_dataset(path: Path) -> list[GameCase]:
    if path.suffix.lower() == ".jsonl":
        raw_games = [
            json.loads(line)
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    else:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            raw_games = payload.get("games", [payload])
        else:
            raw_games = payload

    if not isinstance(raw_games, list):
        raise ValueError("Dataset must contain a JSON array or JSONL objects")
    return [_normalize_game(item, index) for index, item in enumerate(raw_games)]


def _normalize_game(raw: Any, index: int) -> GameCase:
    if not isinstance(raw, dict):
        raise ValueError(f"Game at index {index} must be an object")
    history = raw.get("fenHistory", raw.get("fen_history"))
    if not isinstance(history, list) or not history:
        raise ValueError(f"Game at index {index} has no fenHistory")
    target = raw.get("targetUciMoves", raw.get("target_uci_moves"))
    if target is not None and not isinstance(target, list):
        raise ValueError(f"Game at index {index} has invalid targetUciMoves")
    headers = raw.get("headers") or {}
    if not isinstance(headers, dict):
        raise ValueError(f"Game at index {index} has invalid headers")
    ground_truth_available = bool(
        raw.get("groundTruthAvailable", target is not None)
    )
    if ground_truth_available and target is None:
        raise ValueError(
            f"Game at index {index} marks ground truth available but has no targetUciMoves"
        )
    return GameCase(
        game_id=str(raw.get("id", raw.get("gameId", index))),
        fen_history=tuple(str(value) for value in history),
        target_uci_moves=(
            tuple(str(value) for value in target) if target is not None else None
        ),
        start_fen=str(raw.get("startFen", raw.get("start_fen", chess.STARTING_FEN))),
        headers={str(key): str(value) for key, value in headers.items()},
        source_file=(
            str(raw["sourceFile"])
            if raw.get("sourceFile") is not None
            else None
        ),
        ground_truth_available=ground_truth_available,
    )
