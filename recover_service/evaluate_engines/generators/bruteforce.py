from __future__ import annotations

import chess

from .base import RankedMove


class BruteforceGenerator:
    name = "bruteforce"
    ranked = False

    def propose(self, board: chess.Board, top_k: int) -> list[RankedMove]:
        moves = sorted(board.legal_moves, key=lambda item: item.uci())
        probability = 1.0 / len(moves) if moves else 0.0
        return [
            RankedMove(move, rank, None, probability, self.name)
            for rank, move in enumerate(moves, start=1)
        ]

    def close(self) -> None:
        return None

