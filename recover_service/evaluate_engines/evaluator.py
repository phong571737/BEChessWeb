from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any

import chess

from service import recovery

from .dataset import GameCase
from .generators import CandidateGenerator, RankedMove


@dataclass
class _Branch:
    board: chess.Board
    moves: tuple[str, ...]
    log_probability: float


@dataclass(frozen=True)
class EvaluationRun:
    lines: tuple[tuple[str, ...], ...]
    proposal_events: tuple[dict[str, Any], ...]
    proposal_count: int
    proposal_latency_seconds: float


def recover_case(
    case: GameCase,
    generator: CandidateGenerator,
    *,
    top_k: int,
    max_branches: int | None,
) -> EvaluationRun:
    detections = recovery.detect_transitions(
        case.fen_history,
        start_fen=case.start_fen,
    )
    observed_boards = [recovery._piece_board(fen) for fen in case.fen_history]
    branches = [_Branch(recovery._load_start_board(case.start_fen), (), 0.0)]
    events: list[dict[str, Any]] = []
    proposal_count = 0
    proposal_latency = 0.0

    for detection, observed in zip(detections, observed_boards):
        next_branches: list[_Branch] = []
        for branch in branches:
            if detection.move is None:
                started = time.perf_counter()
                proposals = generator.propose(branch.board, top_k)
                proposal_latency += time.perf_counter() - started
                proposal_count += len(proposals)
                events.append(
                    {
                        "ply": detection.ply,
                        "prefix": list(branch.moves),
                        "candidates": [item.move.uci() for item in proposals],
                    }
                )
            elif detection.move in branch.board.legal_moves:
                proposals = [
                    RankedMove(
                        detection.move,
                        1,
                        None,
                        1.0,
                        "detected",
                    )
                ]
            else:
                proposals = []

            for proposal in proposals:
                next_board = branch.board.copy(stack=True)
                next_board.push(proposal.move)
                if not recovery._observed_board_matches(observed, next_board):
                    continue
                added_score = (
                    math.log(max(proposal.probability, 1e-12))
                    if detection.move is None
                    else 0.0
                )
                next_branches.append(
                    _Branch(
                        board=next_board,
                        moves=(*branch.moves, proposal.move.uci()),
                        log_probability=branch.log_probability + added_score,
                    )
                )

        next_branches.sort(key=lambda item: item.log_probability, reverse=True)
        if max_branches is not None and len(next_branches) > max_branches:
            raise recovery.RecoveryLimitError(
                f"Game {case.game_id}, ply {detection.ply} produced "
                f"{len(next_branches)} branches; limit is {max_branches}"
            )
        branches = next_branches

    return EvaluationRun(
        lines=tuple(branch.moves for branch in branches),
        proposal_events=tuple(events),
        proposal_count=proposal_count,
        proposal_latency_seconds=proposal_latency,
    )

