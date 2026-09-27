from collections.abc import Callable
from typing import TypeAlias

import chess


Move: TypeAlias = str
RankKey: TypeAlias = int | tuple[int, ...]
CandidateRank: TypeAlias = tuple[Move, int]
CandidateComparison: TypeAlias = Callable[[chess.Board, Move], RankKey]
CandidateFilter: TypeAlias = Callable[[chess.Board, Move], bool]


def generate_candidate(
    boards: list[chess.Board],
    comparison_function: CandidateComparison | None = None,
    top_k: int | None = 5,
    candidate_filter: CandidateFilter | None = None,
    unranked: bool = False,
) -> list[CandidateRank]:
    """Generate, rank, and retain the best legal move candidates.

    Board context is kept internally for filtering and comparison.  The public
    result contains each UCI move and its local rank. ``top_k=None`` retains
    every candidate; ``unranked=True`` skips scoring, orders moves by UCI,
    and assigns rank -1. Brute force uses both options together.
    """
    if top_k is not None and top_k < 1:
        raise ValueError("top_k must be at least 1 or None")

    unique: dict[Move, chess.Board] = {}
    for source_board in boards:
        board = source_board.copy(stack=False)
        for chess_move in list(board.legal_moves):
            move = chess_move.uci()
            if candidate_filter is not None and not candidate_filter(
                board.copy(stack=False), move
            ):
                continue
            unique.setdefault(move, board.copy(stack=False))

    candidates = list(unique.items())
    if unranked:
        candidates.sort(key=lambda item: item[0])
    elif comparison_function is not None:
        compared = [
            (
                move,
                board,
                comparison_function(board.copy(stack=False), move),
            )
            for move, board in candidates
        ]
        compared.sort(key=lambda item: item[2], reverse=True)
        candidates = [(move, board) for move, board, _rank_key in compared]

    if top_k is not None:
        candidates = candidates[:top_k]

    return [
        (move, -1 if unranked else rank)
        for rank, (move, _board) in enumerate(candidates, start=1)
    ]
