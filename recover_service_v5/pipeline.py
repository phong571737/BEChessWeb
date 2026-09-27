from typing import TypeAlias

import chess

from FEN_utils import (
    FullRankedSequence,
    build_full_move_sequences,
    deduplicate,
    final_padding_find,
    infer_initial_move_sequence,
    normalize_fen_turns,
    process_fen_stream,
    rank_groups_key,
)
from models import FEN, Move


PipelineResult: TypeAlias = dict[str, list[dict[str, object]]]


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


def _deduplicate_final_sequences(
    sequences: list[FullRankedSequence],
) -> list[FullRankedSequence]:
    best: dict[tuple[Move, ...], FullRankedSequence] = {}
    for source_moves, source_rank_groups in sequences:
        candidate = (list(source_moves), list(source_rank_groups))
        key = tuple(candidate[0])
        current = best.get(key)
        if current is None or rank_groups_key(
            candidate[1], 1_000_000
        ) < rank_groups_key(current[1], 1_000_000):
            best[key] = candidate
    return sorted(
        best.values(),
        key=lambda item: rank_groups_key(item[1], 1_000_000),
    )


def _public_result(sequences: list[FullRankedSequence]) -> PipelineResult:
    return {
        "results": [
            {"moves": list(moves), "rank": rank}
            for rank, (moves, _rank_groups) in enumerate(sequences, start=1)
        ]
    }


def run_pipeline(
    raw_fens: list[FEN],
    max_missing_fens: int = 2,
) -> PipelineResult:
    """Recover every legal path with depth-bounded python-chess brute force."""
    _validate_fens(raw_fens)
    if max_missing_fens < 0:
        raise ValueError("max_missing_fens must be non-negative")

    viewed_fens = deduplicate(raw_fens)
    initial_moves = infer_initial_move_sequence(viewed_fens)
    viewed_fens = normalize_fen_turns(viewed_fens, initial_moves)
    x_indices = [
        index for index, move in enumerate(initial_moves) if move == "X"
    ]
    if not x_indices:
        return {
            "results": [{"moves": list(initial_moves), "rank": 1}]
        }

    _sequences, last_state_nodes = process_fen_stream(
        viewed_fens,
        initial_moves,
        comparison_function=None,
        candidate_top_k=None,
        candidate_unranked=True,
    )
    full_sequences = build_full_move_sequences(
        initial_moves,
        x_indices,
        last_state_nodes,
    )

    padded_sequences: list[FullRankedSequence] = []
    for full_moves, rank_groups in full_sequences:
        padded_sequences.extend(
            final_padding_find(
                move_list=full_moves,
                viewed_fen_list=viewed_fens,
                max_missingFEN=max_missing_fens,
                x_indices=x_indices,
                rank_groups=rank_groups,
                comparison_function=None,
                candidate_top_k=None,
                candidate_unranked=True,
            )
        )

    return _public_result(_deduplicate_final_sequences(padded_sequences))
