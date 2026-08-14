from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

import chess
import chess.engine

from .base import RankedMove


@dataclass(frozen=True)
class UciLimit:
    time_seconds: float | None = 0.1
    depth: int | None = None
    nodes: int | None = None

    def to_chess_limit(self) -> chess.engine.Limit:
        return chess.engine.Limit(
            time=self.time_seconds,
            depth=self.depth,
            nodes=self.nodes,
        )


class UciGenerator:
    ranked = True

    def __init__(
        self,
        name: str,
        command: str | Sequence[str],
        *,
        limit: UciLimit,
        options: Mapping[str, object] | None = None,
    ) -> None:
        self.name = name
        self.command = command
        self.limit = limit
        self._engine = chess.engine.SimpleEngine.popen_uci(command)
        if options:
            self._engine.configure(dict(options))

    def propose(self, board: chess.Board, top_k: int) -> list[RankedMove]:
        count = min(max(1, top_k), board.legal_moves.count())
        if count == 0:
            return []
        analyses = self._engine.analyse(
            board,
            self.limit.to_chess_limit(),
            multipv=count,
        )
        if isinstance(analyses, dict):
            analyses = [analyses]

        scored: list[tuple[chess.Move, float]] = []
        analyses.sort(key=lambda info: int(info.get("multipv", 1)))
        for info in analyses:
            pv = info.get("pv")
            if not pv:
                continue
            score = info.get("score")
            numeric = 0.0
            if score is not None:
                value = score.pov(board.turn).score(mate_score=100000)
                numeric = float(value if value is not None else 0.0)
            scored.append((pv[0], numeric))

        probabilities = _rank_probabilities(len(scored))
        return [
            RankedMove(move, rank, score, probability, self.name)
            for rank, ((move, score), probability) in enumerate(
                zip(scored, probabilities), start=1
            )
        ]

    def close(self) -> None:
        self._engine.quit()


def _rank_probabilities(count: int) -> list[float]:
    if count == 0:
        return []
    weights = [1.0 / rank for rank in range(1, count + 1)]
    total = sum(weights)
    return [weight / total for weight in weights]
