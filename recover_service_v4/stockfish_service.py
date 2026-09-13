from collections.abc import Sequence
from typing import TypeAlias

import chess
import chess.engine

from .models import FEN, Move


MATE_SCORE = 100_000

PaddingBranch: TypeAlias = tuple[list[Move], Sequence[int]]
RankedPath: TypeAlias = tuple[list[Move], list[int]]
RankedGroups: TypeAlias = dict[tuple[int, ...], list[RankedPath]]
EvaluationPoint: TypeAlias = tuple[FEN, chess.Color]


class StockfishEvaluationError(RuntimeError):
    pass


def _validate_padding_indices(
    path: list[Move],
    padding_indices: Sequence[int],
) -> tuple[int, ...]:
    key = tuple(padding_indices)
    if any(not isinstance(index, int) for index in key):
        raise ValueError("padding indices must be integers")
    if tuple(sorted(set(key))) != key:
        raise ValueError("padding indices must be unique and strictly increasing")
    if any(index < 0 or index >= len(path) for index in key):
        raise ValueError("padding index is outside the move path")
    return key


def _prepare_evaluation_points(
    start_fen: FEN,
    path: list[Move],
    padding_indices: tuple[int, ...],
) -> list[EvaluationPoint] | None:
    """Replay a branch and capture positions after padding moves only."""
    board = chess.Board(start_fen)
    padding_index_set = set(padding_indices)
    evaluation_points: list[EvaluationPoint] = []

    for index, move_uci in enumerate(path):
        if move_uci == "X":
            return None
        try:
            move = chess.Move.from_uci(move_uci)
        except ValueError:
            return None

        moving_piece = board.piece_at(move.from_square)
        if moving_piece is None:
            return None

        # Only the initial side-to-move field may come from an unreliable
        # sensor FEN. Once replay starts, legal chess turn order is preserved.
        if index == 0:
            board.turn = moving_piece.color
        if move not in board.legal_moves:
            return None

        mover = board.turn
        board.push(move)
        if index in padding_index_set:
            evaluation_points.append((board.fen(), mover))

    if len(evaluation_points) != len(padding_indices):
        raise ValueError("padding indices do not match the replayed path")
    return evaluation_points


def _score_position(
    engine: chess.engine.SimpleEngine,
    fen: FEN,
    mover: chess.Color,
    limit: chess.engine.Limit,
) -> int:
    analysis = engine.analyse(chess.Board(fen), limit)
    pov_score = analysis.get("score")
    if pov_score is None:
        raise StockfishEvaluationError("Stockfish returned no score")
    score = pov_score.pov(mover).score(mate_score=MATE_SCORE)
    if score is None:
        raise StockfishEvaluationError("Stockfish score cannot be converted")
    return score


def rank_paths_by_stockfish(
    start_fen: FEN,
    branches: list[PaddingBranch],
    stockfish_path: str,
    depth: int = 15,
) -> RankedGroups:
    """Group and rank complete branches using padding-move evaluations.

    Branches are grouped by their final padding indices. Only positions after
    padding moves are evaluated. Each group is sorted lexicographically in
    descending score order; Python's stable sort preserves generation order
    for equal score vectors. Incomplete or illegal branches are excluded.
    """
    if depth < 1:
        raise ValueError("depth must be at least 1")

    prepared: list[tuple[list[Move], tuple[int, ...], list[EvaluationPoint]]] = []
    for source_path, source_indices in branches:
        path = list(source_path)
        padding_indices = _validate_padding_indices(path, source_indices)
        evaluation_points = _prepare_evaluation_points(
            start_fen,
            path,
            padding_indices,
        )
        if evaluation_points is not None:
            prepared.append((path, padding_indices, evaluation_points))

    if not prepared:
        return {}

    requires_engine = any(points for _path, _indices, points in prepared)
    engine: chess.engine.SimpleEngine | None = None
    score_cache: dict[tuple[FEN, chess.Color, int], int] = {}
    grouped: RankedGroups = {}

    try:
        if requires_engine:
            engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)

        limit = chess.engine.Limit(depth=depth)
        for path, padding_indices, evaluation_points in prepared:
            scores: list[int] = []
            for fen, mover in evaluation_points:
                cache_key = (fen, mover, depth)
                score = score_cache.get(cache_key)
                if score is None:
                    if engine is None:
                        raise StockfishEvaluationError(
                            "Stockfish is required for padding evaluation"
                        )
                    score = _score_position(engine, fen, mover, limit)
                    score_cache[cache_key] = score
                scores.append(score)
            grouped.setdefault(padding_indices, []).append((path, scores))
    finally:
        if engine is not None:
            engine.quit()

    for ranked_paths in grouped.values():
        ranked_paths.sort(key=lambda item: item[1], reverse=True)
    return grouped
