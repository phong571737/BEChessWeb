"""Copy of recovery.py adapted to run as a service backend."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping

import chess

from .fen_to_pgn import (
    FenConversionError,
    _format_move_list,
    _piece_board,
    _san_for_inferred_move,
    fens_to_pgn,
    infer_move_from_fen,
)


class RecoveryLimitError(RuntimeError):
    pass


@dataclass(frozen=True)
class DetectedTransition:
    ply: int
    before_fen: str
    after_fen: str
    move: chess.Move | None
    error: str | None = None

    @property
    def detected(self) -> bool:
        return self.move is not None

    def to_dict(self) -> dict[str, object]:
        return {
            "ply": self.ply,
            "detected": self.detected,
            "move": self.move.uci() if self.move is not None else None,
            "error": self.error,
        }


@dataclass(frozen=True)
class RecoveryLine:
    uci_moves: tuple[str, ...]
    san_moves: tuple[str, ...]
    move_sources: tuple[str, ...]
    assumed_fens: tuple[str, ...]

    @property
    def movetext(self) -> str:
        return _format_move_list(list(self.san_moves))

    def to_dict(self) -> dict[str, object]:
        return {
            "uciMoves": list(self.uci_moves),
            "sanMoves": list(self.san_moves),
            "moveSources": list(self.move_sources),
            "assumedFens": list(self.assumed_fens),
            "movetext": self.movetext,
        }


@dataclass(frozen=True)
class RecoveryStep:
    ply: int
    observed_fen: str
    detected_move: str | None
    detection_error: str | None
    candidates: tuple[RecoveryLine, ...]

    @property
    def used_assumption(self) -> bool:
        return self.detected_move is None

    def to_dict(self) -> dict[str, object]:
        return {
            "ply": self.ply,
            "observedFen": self.observed_fen,
            "detectedMove": self.detected_move,
            "detectionError": self.detection_error,
            "usedAssumption": self.used_assumption,
            "candidateCount": len(self.candidates),
            "moveLists": [candidate.to_dict() for candidate in self.candidates],
        }


@dataclass(frozen=True)
class RecoveryResult:
    original_pgn: str
    detections: tuple[DetectedTransition, ...]
    steps: tuple[RecoveryStep, ...]
    initial_line: RecoveryLine

    @property
    def lines(self) -> tuple[RecoveryLine, ...]:
        if not self.steps:
            return (self.initial_line,)
        return self.steps[-1].candidates

    @property
    def failed_plies(self) -> tuple[int, ...]:
        return tuple(item.ply for item in self.detections if not item.detected)

    @property
    def fully_recovered(self) -> bool:
        return not self.detections or bool(self.steps and self.steps[-1].candidates)

    @property
    def longest_recovered_ply(self) -> int:
        if self.fully_recovered:
            return len(self.detections)
        for step in reversed(self.steps):
            if step.candidates:
                return step.ply
        return 0

    @property
    def best_lines(self) -> tuple[RecoveryLine, ...]:
        if self.fully_recovered:
            return self.lines
        for step in reversed(self.steps):
            if step.candidates:
                return step.candidates
        return (self.initial_line,)

    def to_dict(self, *, include_steps: bool = True) -> dict[str, object]:
        data: dict[str, object] = {
            "originalPgn": self.original_pgn,
            "failedPlies": list(self.failed_plies),
            "detections": [item.to_dict() for item in self.detections],
            "survivorCounts": [len(step.candidates) for step in self.steps],
            "fullyRecovered": self.fully_recovered,
            "longestRecoveredPly": self.longest_recovered_ply,
            "finalMoveLists": [line.to_dict() for line in self.lines],
            "bestMoveLists": [line.to_dict() for line in self.best_lines],
        }
        if include_steps:
            data["steps"] = [step.to_dict() for step in self.steps]
        return data


@dataclass
class _Branch:
    board: chess.Board
    uci_moves: list[str]
    san_moves: list[str]
    move_sources: list[str]
    assumed_fens: list[str]

    def freeze(self) -> RecoveryLine:
        return RecoveryLine(
            uci_moves=tuple(self.uci_moves),
            san_moves=tuple(self.san_moves),
            move_sources=tuple(self.move_sources),
            assumed_fens=tuple(self.assumed_fens),
        )


def fen_is_compatible(observed_fen: str, assumed_fen: str) -> bool:
    observed = _piece_board(observed_fen)
    assumed = _piece_board(assumed_fen)
    return _observed_board_matches(observed, assumed)


def detect_transitions(
    fen_history: Iterable[str],
    *,
    start_fen: str = chess.STARTING_FEN,
) -> tuple[DetectedTransition, ...]:
    history = list(fen_history)
    detections: list[DetectedTransition] = []
    before_fen = start_fen

    for ply, after_fen in enumerate(history, start=1):
        try:
            move = infer_move_from_fen(before_fen, after_fen)
            error = None if move is not None else "No piece-placement change"
        except (FenConversionError, ValueError) as exc:
            move = None
            error = str(exc)

        detections.append(
            DetectedTransition(
                ply=ply,
                before_fen=before_fen,
                after_fen=after_fen,
                move=move,
                error=error,
            )
        )
        before_fen = after_fen

    return tuple(detections)


def detected_move_token(transition: DetectedTransition) -> str:
    if transition.move is None:
        return "X"
    return _san_for_inferred_move(transition.before_fen, transition.move)


def parse_fen_text(text: str) -> list[str]:
    history: list[str] = []
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        fen = re.sub(r"^\d+\s*\.\s*", "", line, count=1).strip()
        if not fen:
            continue
        try:
            _piece_board(fen)
        except FenConversionError as exc:
            raise FenConversionError(
                f"Invalid FEN at line {line_number}: {fen!r}"
            ) from exc
        history.append(fen)

    if not history:
        raise FenConversionError("Input contains no FEN lines")
    return history


def recover_fens(
    fen_history: Iterable[str],
    *,
    start_fen: str = chess.STARTING_FEN,
    headers: Mapping[str, str] | None = None,
    max_branches: int | None = None,
) -> RecoveryResult:
    history = list(fen_history)
    if max_branches is not None and max_branches < 1:
        raise ValueError("max_branches must be at least 1")

    observed_boards = [_piece_board(fen) for fen in history]
    initial_board = _load_start_board(start_fen)
    detections = detect_transitions(history, start_fen=start_fen)
    original_pgn = fens_to_pgn(history, start_fen=start_fen, headers=headers)

    initial_line = RecoveryLine((), (), (), ())
    branches = [_Branch(initial_board, [], [], [], [])]
    steps: list[RecoveryStep] = []

    for detection, observed in zip(detections, observed_boards):
        next_branches: list[_Branch] = []

        for branch in branches:
            if detection.move is None:
                moves = list(branch.board.legal_moves)
                source = "assumed"
            elif detection.move in branch.board.legal_moves:
                moves = [detection.move]
                source = "detected"
            else:
                moves = []
                source = "detected"

            for move in moves:
                san = branch.board.san(move)
                next_board = branch.board.copy(stack=False)
                next_board.push(move)

                if not _observed_board_matches(observed, next_board):
                    continue

                next_branches.append(
                    _Branch(
                        board=next_board,
                        uci_moves=[*branch.uci_moves, move.uci()],
                        san_moves=[*branch.san_moves, san],
                        move_sources=[*branch.move_sources, source],
                        assumed_fens=[
                            *branch.assumed_fens,
                            next_board.fen(en_passant="fen"),
                        ],
                    )
                )
                if max_branches is not None and len(next_branches) > max_branches:
                    raise RecoveryLimitError(
                        f"Ply {detection.ply} produced more than "
                        f"{max_branches} compatible branches"
                    )

        branches = next_branches
        steps.append(
            RecoveryStep(
                ply=detection.ply,
                observed_fen=detection.after_fen,
                detected_move=(
                    detection.move.uci() if detection.move is not None else None
                ),
                detection_error=detection.error,
                candidates=tuple(branch.freeze() for branch in branches),
            )
        )

    return RecoveryResult(
        original_pgn=original_pgn,
        detections=detections,
        steps=tuple(steps),
        initial_line=initial_line,
    )


def _observed_board_matches(
    observed: chess.Board,
    assumed: chess.Board,
) -> bool:
    return all(
        assumed.piece_at(square) == piece
        for square, piece in observed.piece_map().items()
    )


def _load_start_board(start_fen: str) -> chess.Board:
    try:
        return chess.Board(start_fen)
    except ValueError as full_fen_error:
        if len(start_fen.split()) != 1:
            raise FenConversionError(f"Invalid start FEN: {start_fen!r}") from full_fen_error
        try:
            return chess.Board(f"{start_fen} w - - 0 1")
        except ValueError as exc:
            raise FenConversionError(
                f"Invalid start FEN: {start_fen!r}"
            ) from exc


def recovery_line_to_pgn(
    line: RecoveryLine,
    *,
    total_plies: int | None = None,
    headers: Mapping[str, str] | None = None,
) -> str:
    recovered_plies = len(line.uci_moves)
    if total_plies is None:
        total_plies = recovered_plies
    if total_plies < recovered_plies:
        raise ValueError("total_plies cannot be shorter than the recovery line")

    game = chess.pgn.Game()
    game.headers.update(
        {
            "Event": "FEN Multiverse Recovery",
            "Site": "?",
            "Date": "????.??.??",
            "Round": "1",
            "White": "?",
            "Black": "?",
            "Result": "*",
            "Recovery": (
                "Complete" if recovered_plies == total_plies else "Partial"
            ),
            "RecoveredPly": f"{recovered_plies}/{total_plies}",
        }
    )
    if headers:
        game.headers.update({str(key): str(value) for key, value in headers.items()})

    board = game.board()
    node: chess.pgn.GameNode = game
    for uci, source in zip(line.uci_moves, line.move_sources):
        try:
            move = chess.Move.from_uci(uci)
        except ValueError as exc:
            raise FenConversionError(f"Invalid recovered UCI move: {uci!r}") from exc
        if move not in board.legal_moves:
            raise FenConversionError(
                f"Recovered move {uci!r} is illegal at ply {board.ply() + 1}"
            )

        node = node.add_variation(move)
        if source == "assumed":
            node.comment = "assumed"
        board.push(move)

    if recovered_plies < total_plies:
        unrecoverable_from = recovered_plies + 1
        game.headers["UnrecoverableFrom"] = str(unrecoverable_from)
        message = (
            f"recovery stopped before ply {unrecoverable_from}; "
            f"plies {unrecoverable_from}-{total_plies} could not be recovered"
        )
        node.comment = f"{node.comment}; {message}".strip("; ")

    return str(game)
