import chess

from .FEN_utils import (
    deduplicate,
    infer_initial_move_sequence,
    patch_missing_transitions_with_indices,
    process_fen_stream,
)
from .models import FEN, Move, SingleSequence
from .stockfish_service import RankedGroups, rank_paths_by_stockfish


def _validate_fens(raw_fens: list[FEN]) -> None:
    if not raw_fens:
        raise ValueError("raw_fens must contain at least one FEN")

    for index, fen in enumerate(raw_fens):
        if not isinstance(fen, str):
            raise ValueError(f"invalid FEN at raw_fens[{index}]")
        try:
            chess.Board(fen)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"invalid FEN at raw_fens[{index}]") from exc


def run_pipeline(
    raw_fens: list[FEN],
    stockfish_path: str,
    max_missing_fens: int = 2,
    stockfish_depth: int = 15,
) -> RankedGroups:
    """Recover, evaluate, group, and rank move paths from sensor FENs."""
    _validate_fens(raw_fens)
    if max_missing_fens < 0:
        raise ValueError("max_missing_fens must be non-negative")
    if stockfish_depth < 1:
        raise ValueError("stockfish_depth must be at least 1")

    viewed_fens = deduplicate(raw_fens)
    initial_moves: list[Move] = infer_initial_move_sequence(viewed_fens)

    # Preserve the existing end-to-end recovery stage used by main.py. Its
    # local sequences and active nodes are recovery metadata, while the public
    # pipeline result is produced from the complete padding branches below.
    process_fen_stream(viewed_fens, initial_moves)

    full_sequence = SingleSequence(
        start_fen=viewed_fens[0],
        move_list=initial_moves,
        viewed_fen_list=viewed_fens,
    )
    branches = patch_missing_transitions_with_indices(
        full_sequence,
        max_missingFEN=max_missing_fens,
    )

    return rank_paths_by_stockfish(
        start_fen=viewed_fens[0],
        branches=branches,
        stockfish_path=stockfish_path,
        depth=stockfish_depth,
    )
