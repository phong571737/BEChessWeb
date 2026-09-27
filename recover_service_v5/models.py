from dataclasses import dataclass, field
from typing import TypeAlias

import chess

from candidate_service import CandidateComparison, generate_candidate


FEN: TypeAlias = str
Move: TypeAlias = str
Square: TypeAlias = str | None
Board: TypeAlias = list[Square]
RankTrace: TypeAlias = tuple[int, ...]
RankedXPath: TypeAlias = tuple[list[Move], list[RankTrace]]


def _copy_ranked_path(path: RankedXPath | list[Move]) -> RankedXPath:
    if isinstance(path, tuple) and len(path) == 2:
        moves, rank_groups = path
        return list(moves), list(rank_groups)
    legacy_moves = list(path)
    return legacy_moves, [() for _move in legacy_moves]


@dataclass
class StateNode:
    """An assumed boundary position and ranked choices for processed X entries."""

    fen: FEN
    paths: list[RankedXPath] = field(default_factory=list)


def _position(fen: FEN) -> str:
    return fen.strip().split()[0]


def _compatible(assumed_fen: FEN, observed_fen: FEN) -> bool:
    """Check every visible observed piece against an assumed position."""
    assumed_board = chess.Board(assumed_fen)
    observed_board = chess.Board(observed_fen)
    return all(
        observed_board.piece_at(square) is None
        or assumed_board.piece_at(square) == observed_board.piece_at(square)
        for square in chess.SQUARES
    )


def _push_known_move(board: chess.Board, move_uci: Move) -> bool:
    try:
        move = chess.Move.from_uci(move_uci)
    except ValueError:
        return False

    moving_piece = board.piece_at(move.from_square)
    if moving_piece is None:
        return False
    if move not in board.legal_moves:
        return False
    board.push(move)
    return True


def _rank_groups_key(
    rank_groups: list[RankTrace],
    unresolved_rank: int = 1_000_000,
) -> tuple[int, ...]:
    return tuple(
        rank
        for group in rank_groups
        for rank in (group if group else (unresolved_rank,))
    )


def _deduplicate_ranked_paths(paths: list[RankedXPath]) -> list[RankedXPath]:
    best: dict[tuple[Move, ...], RankedXPath] = {}
    for source_path in paths:
        path = _copy_ranked_path(source_path)
        key = tuple(path[0])
        current = best.get(key)
        if current is None or _rank_groups_key(path[1]) < _rank_groups_key(current[1]):
            best[key] = path
    return sorted(best.values(), key=lambda path: _rank_groups_key(path[1]))


@dataclass(init=False)
class SingleSequence:
    """A local component beginning with an unresolved transition (``X``)."""

    state_node: StateNode
    move_list: list[Move]
    viewed_fen_list: list[FEN]
    parent_paths: list[RankedXPath]

    def __init__(
        self,
        state_node: StateNode | None = None,
        move_list: list[Move] | None = None,
        viewed_fen_list: list[FEN] | None = None,
        parent_paths: list[RankedXPath] | None = None,
        *,
        start_fen: FEN | None = None,
    ) -> None:
        if state_node is None:
            if start_fen is None:
                raise TypeError("state_node is required")
            legacy_paths = parent_paths if parent_paths is not None else [([], [])]
            state_node = StateNode(
                fen=start_fen,
                paths=[_copy_ranked_path(path) for path in legacy_paths],
            )
        elif start_fen is not None:
            raise TypeError("pass state_node or start_fen, not both")

        self.state_node = state_node
        self.move_list = list(move_list) if move_list is not None else []
        self.viewed_fen_list = (
            list(viewed_fen_list) if viewed_fen_list is not None else []
        )
        self.parent_paths = (
            [_copy_ranked_path(path) for path in parent_paths]
            if parent_paths is not None
            else [_copy_ranked_path(path) for path in state_node.paths]
        )

    @property
    def start_fen(self) -> FEN:
        return self.state_node.fen

    def inference(
        self,
        comparison_function: CandidateComparison | None = None,
        candidate_top_k: int | None = 5,
        candidate_unranked: bool = False,
    ) -> list[StateNode]:
        """Infer and rank the first X, then validate the local component."""
        if not self.move_list or self.move_list[0] != "X":
            raise ValueError("SingleSequence.move_list must start with X")
        if len(self.viewed_fen_list) != len(self.move_list) + 1:
            raise ValueError(
                "move_list and viewed_fen_list have incompatible lengths"
            )

        source_paths = [
            _copy_ranked_path(path) for path in self.state_node.paths
        ] or [([], [])]
        candidate_end_fens: dict[Move, FEN] = {}

        def validate_candidate(board: chess.Board, move_uci: Move) -> bool:
            assumed_board = board.copy(stack=False)
            move = chess.Move.from_uci(move_uci)
            if move not in assumed_board.legal_moves:
                return False
            assumed_board.push(move)
            if not _compatible(assumed_board.fen(), self.viewed_fen_list[1]):
                return False

            for local_index, known_move in enumerate(
                self.move_list[1:], start=1
            ):
                if known_move == "X" or not _push_known_move(
                    assumed_board, known_move
                ):
                    return False
                if not _compatible(
                    assumed_board.fen(),
                    self.viewed_fen_list[local_index + 1],
                ):
                    return False

            candidate_end_fens[move_uci] = assumed_board.fen()
            return True

        ranked_candidates = generate_candidate(
            boards=[chess.Board(self.state_node.fen)],
            comparison_function=comparison_function,
            top_k=candidate_top_k,
            candidate_filter=validate_candidate,
            unranked=candidate_unranked,
        )

        if not ranked_candidates:
            return [
                StateNode(
                    fen=self.viewed_fen_list[-1],
                    paths=[
                        (
                            x_moves + ["X"],
                            rank_groups + [()],
                        )
                        for x_moves, rank_groups in source_paths
                    ],
                )
            ]

        nodes_by_position: dict[str, StateNode] = {}
        for candidate_move, local_rank in ranked_candidates:
            end_fen = candidate_end_fens[candidate_move]
            position = _position(end_fen)
            new_paths = [
                (
                    x_moves + [candidate_move],
                    rank_groups + [(local_rank,)],
                )
                for x_moves, rank_groups in source_paths
            ]
            if position not in nodes_by_position:
                nodes_by_position[position] = StateNode(end_fen, new_paths)
            else:
                node = nodes_by_position[position]
                node.paths = _deduplicate_ranked_paths(node.paths + new_paths)

        return list(nodes_by_position.values())
