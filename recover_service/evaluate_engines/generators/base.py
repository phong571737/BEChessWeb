from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import chess


@dataclass(frozen=True)
class RankedMove:
    move: chess.Move
    rank: int
    raw_score: float | None
    probability: float
    generator: str


class CandidateGenerator(Protocol):
    name: str
    ranked: bool

    def propose(self, board: chess.Board, top_k: int) -> list[RankedMove]: ...

    def close(self) -> None: ...

