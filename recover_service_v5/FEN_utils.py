from typing import TypeAlias

import chess

from candidate_service import CandidateComparison, generate_candidate
from models import FEN, Move, RankTrace, RankedXPath, SingleSequence, StateNode
from move_service import FenConversionError, infer_move_from_fen


FullRankedSequence: TypeAlias = tuple[list[Move], list[RankTrace]]


def fen_to_board(fen: FEN) -> chess.Board:
    return chess.Board(fen)


def get_fen_position(fen: FEN) -> str:
    return fen.strip().split()[0]


def set_side_to_move(fen: FEN, side: str) -> FEN:
    if side not in ("w", "b"):
        raise ValueError("invalid side")
    board = chess.Board(fen)
    board.turn = chess.WHITE if side == "w" else chess.BLACK
    return board.fen()


def compatible(assumed_fen: FEN, observed_fen: FEN) -> bool:
    try:
        assumed_board = chess.Board(assumed_fen)
        observed_board = chess.Board(observed_fen)
    except ValueError as exc:
        raise ValueError("invalid FEN") from exc

    for square in chess.SQUARES:
        observed_piece = observed_board.piece_at(square)
        if (
            observed_piece is not None
            and assumed_board.piece_at(square) != observed_piece
        ):
            return False
    return True


def merge_fen_position(fen_list: list[FEN]) -> list[FEN]:
    merged_fens: list[FEN] = []
    seen_positions: set[str] = set()
    for fen in fen_list:
        position = get_fen_position(fen)
        if position in seen_positions:
            continue
        seen_positions.add(position)
        merged_fens.append(fen)
    return merged_fens


def normalize_side_to_move(fen: FEN, move: chess.Move) -> FEN:
    board = chess.Board(fen)
    moving_piece = board.piece_at(move.from_square)
    if moving_piece is None:
        return fen
    side = "w" if moving_piece.color == chess.WHITE else "b"
    return set_side_to_move(fen, side)


def deduplicate(fen_list: list[FEN]) -> list[FEN]:
    if not fen_list:
        return []

    deduped_fens = [fen_list[0]]
    for current_fen in fen_list[1:]:
        if get_fen_position(current_fen) != get_fen_position(
            deduped_fens[-1]
        ):
            deduped_fens.append(current_fen)
    return deduped_fens


def infer_initial_move_sequence(fen_list: list[FEN]) -> list[Move]:
    moves: list[Move] = []
    for before_fen, after_fen in zip(fen_list, fen_list[1:]):
        try:
            inferred = infer_move_from_fen(before_fen, after_fen)
        except FenConversionError:
            inferred = None
        moves.append(inferred.uci() if isinstance(inferred, chess.Move) else "X")
    return moves


def normalize_fen_turns(
    fens: list[FEN],
    initial_moves: list[Move],
) -> list[FEN]:
    """Correct each source turn from its inferred outgoing move only."""
    if len(initial_moves) != max(len(fens) - 1, 0):
        raise ValueError("initial_moves and fens have incompatible lengths")

    normalized_fens = list(fens)
    for i, move_uci in enumerate(initial_moves):
        if move_uci == "X":
            continue

        # Use the original source; its recorded turn may be incorrect.
        board = chess.Board(fens[i])
        move = chess.Move.from_uci(move_uci)
        moving_piece = board.piece_at(move.from_square)
        if moving_piece is None:
            raise ValueError(
                f"No piece at {chess.square_name(move.from_square)} "
                f"in fens[{i}] for inferred move {move_uci}"
            )

        # Avoid board.fen(), which can also normalize other FEN fields.
        fields = fens[i].split()
        fields[1] = "w" if moving_piece.color == chess.WHITE else "b"
        normalized_fens[i] = " ".join(fields)

    return normalized_fens


def _copy_ranked_path(path: RankedXPath | list[Move]) -> RankedXPath:
    if isinstance(path, tuple) and len(path) == 2:
        moves, rank_groups = path
        return list(moves), list(rank_groups)
    legacy_moves = list(path)
    return legacy_moves, [() for _move in legacy_moves]


def rank_groups_key(
    rank_groups: list[RankTrace],
    unresolved_rank: int = 1_000_000,
) -> tuple[int, ...]:
    return tuple(
        rank
        for group in rank_groups
        for rank in (group if group else (unresolved_rank,))
    )


def _deduplicate_paths(paths: list[list[Move]]) -> list[list[Move]]:
    return [list(path) for path in dict.fromkeys(tuple(path) for path in paths)]


def _deduplicate_ranked_sequences(
    sequences: list[FullRankedSequence],
) -> list[FullRankedSequence]:
    best: dict[tuple[Move, ...], FullRankedSequence] = {}
    for source_moves, source_rank_groups in sequences:
        candidate = (list(source_moves), list(source_rank_groups))
        key = tuple(candidate[0])
        current = best.get(key)
        if current is None or rank_groups_key(candidate[1]) < rank_groups_key(
            current[1]
        ):
            best[key] = candidate
    return sorted(best.values(), key=lambda item: rank_groups_key(item[1]))


def _merge_nodes_by_position(nodes: list[StateNode]) -> list[StateNode]:
    merged_nodes: dict[str, StateNode] = {}
    for node in nodes:
        position = get_fen_position(node.fen)
        if position not in merged_nodes:
            merged_nodes[position] = StateNode(
                node.fen,
                [_copy_ranked_path(path) for path in node.paths],
            )
            continue

        merged = merged_nodes[position]
        merged.paths = _deduplicate_ranked_sequences(
            [_copy_ranked_path(path) for path in merged.paths + node.paths]
        )
    return list(merged_nodes.values())


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


def start_padding_find(
    fen1: FEN,
    fen2: FEN,
    max_missingFEN: int = 2,
    comparison_function: CandidateComparison | None = None,
    candidate_top_k: int | None = 5,
    candidate_unranked: bool = False,
) -> list[tuple[list[Move], RankTrace]]:
    """Find ranked paths between two observed positions using bounded DFS."""
    if max_missingFEN < 0:
        raise ValueError("max_missingFEN must be non-negative")
    target_position = get_fen_position(fen2)
    max_depth = max_missingFEN + 1
    solutions: list[tuple[list[Move], RankTrace]] = []

    def dfs(
        current_boards: list[chess.Board],
        depth: int,
        path: list[Move],
        rank_trace: RankTrace,
    ) -> None:
        if any(
            get_fen_position(board.fen()) == target_position
            for board in current_boards
        ):
            solutions.append((list(path), rank_trace))
            return
        if depth == 0:
            return

        ranked_candidates = generate_candidate(
            boards=current_boards,
            comparison_function=comparison_function,
            top_k=candidate_top_k,
            unranked=candidate_unranked,
        )
        for move_uci, local_rank in ranked_candidates:
            move = chess.Move.from_uci(move_uci)
            source_board = next(
                (
                    board
                    for board in current_boards
                    if move in board.legal_moves
                ),
                None,
            )
            if source_board is None:
                continue
            next_board = source_board.copy(stack=False)
            next_board.push(move)
            dfs(
                [next_board],
                depth - 1,
                path + [move_uci],
                rank_trace + (local_rank,),
            )

    dfs([chess.Board(fen1)], max_depth, [], ())

    best: dict[tuple[Move, ...], tuple[list[Move], RankTrace]] = {}
    for path, rank_trace in solutions:
        key = tuple(path)
        current = best.get(key)
        if current is None or rank_trace < current[1]:
            best[key] = (path, rank_trace)
    return sorted(best.values(), key=lambda item: item[1])


def recover_local_component(
    sequence: SingleSequence,
    comparison_function: CandidateComparison | None = None,
    candidate_top_k: int | None = 5,
    candidate_unranked: bool = False,
) -> list[StateNode]:
    """Compatibility wrapper for model-owned local inference."""
    return sequence.inference(
        comparison_function=comparison_function,
        candidate_top_k=candidate_top_k,
        candidate_unranked=candidate_unranked,
    )


def final_padding_find(
    move_list: list[Move],
    viewed_fen_list: list[FEN],
    max_missingFEN: int = 2,
    *,
    x_indices: list[int] | None = None,
    rank_groups: list[RankTrace] | None = None,
    comparison_function: CandidateComparison | None = None,
    candidate_top_k: int | None = 5,
    candidate_unranked: bool = False,
) -> list[FullRankedSequence]:
    """Replace every remaining X with ranked padding paths."""
    if len(viewed_fen_list) != len(move_list) + 1:
        raise ValueError("move_list and viewed_fen_list have incompatible lengths")

    resolved_x_indices = (
        list(x_indices)
        if x_indices is not None
        else [index for index, move in enumerate(move_list) if move == "X"]
    )
    if tuple(sorted(set(resolved_x_indices))) != tuple(resolved_x_indices):
        raise ValueError("x_indices must be unique and strictly increasing")
    if any(index < 0 or index >= len(move_list) for index in resolved_x_indices):
        raise ValueError("x index is outside move_list")

    resolved_rank_groups = (
        list(rank_groups)
        if rank_groups is not None
        else [() for _index in resolved_x_indices]
    )
    if len(resolved_rank_groups) != len(resolved_x_indices):
        raise ValueError("rank_groups and x_indices have incompatible lengths")

    x_number_by_index = {
        transition_index: x_number
        for x_number, transition_index in enumerate(resolved_x_indices)
    }
    result: list[FullRankedSequence] = [([], resolved_rank_groups)]

    for transition_index, move in enumerate(move_list):
        replacements: list[tuple[list[Move], RankTrace]] = [([move], ())]
        if move == "X":
            if transition_index not in x_number_by_index:
                raise ValueError("remaining X is missing from x_indices")
            replacements = start_padding_find(
                viewed_fen_list[transition_index],
                viewed_fen_list[transition_index + 1],
                max_missingFEN=max_missingFEN,
                comparison_function=comparison_function,
                candidate_top_k=candidate_top_k,
                candidate_unranked=candidate_unranked,
            )
            if not replacements:
                replacements = [(["X"], ())]

        next_result: list[FullRankedSequence] = []
        for current_moves, current_rank_groups in result:
            for replacement_moves, replacement_ranks in replacements:
                next_rank_groups = list(current_rank_groups)
                if move == "X":
                    x_number = x_number_by_index[transition_index]
                    next_rank_groups[x_number] = replacement_ranks
                next_result.append(
                    (
                        current_moves + replacement_moves,
                        next_rank_groups,
                    )
                )
        result = next_result

    return _deduplicate_ranked_sequences(result)


def patch_missing_transitions(
    sequence: SingleSequence,
    max_missingFEN: int = 2,
) -> list[list[Move]]:
    return [
        moves
        for moves, _rank_groups in final_padding_find(
            move_list=sequence.move_list,
            viewed_fen_list=sequence.viewed_fen_list,
            max_missingFEN=max_missingFEN,
            candidate_top_k=256,
        )
    ]


def patch_missing_transitions_with_indices(
    sequence: SingleSequence,
    max_missingFEN: int = 2,
) -> list[tuple[list[Move], list[int]]]:
    """Legacy padding output retained for callers during migration."""
    result_branches: list[tuple[list[Move], list[int]]] = [([], [])]
    for index, move in enumerate(sequence.move_list):
        replacements = [[move]]
        if move == "X":
            ranked_paths = start_padding_find(
                sequence.viewed_fen_list[index],
                sequence.viewed_fen_list[index + 1],
                max_missingFEN=max_missingFEN,
                candidate_top_k=256,
            )
            if ranked_paths:
                replacements = [path for path, _ranks in ranked_paths]

        next_branches: list[tuple[list[Move], list[int]]] = []
        for current_path, padding_indices in result_branches:
            for replacement in replacements:
                final_path = current_path + replacement
                final_indices = list(padding_indices)
                if move == "X" and replacement != ["X"]:
                    final_indices.extend(range(len(current_path), len(final_path)))
                next_branches.append((final_path, final_indices))
        result_branches = next_branches

    unique: dict[tuple[tuple[Move, ...], tuple[int, ...]], None] = {}
    for path, indices in result_branches:
        unique[(tuple(path), tuple(indices))] = None
    return [
        (list(path), list(indices))
        for path, indices in unique
    ]


def build_full_move_sequences(
    initial_moves: list[Move],
    x_indices: list[int],
    last_state_nodes: list[StateNode],
) -> list[FullRankedSequence]:
    """Build every full move list while preserving per-X rank groups."""
    if tuple(sorted(set(x_indices))) != tuple(x_indices):
        raise ValueError("x_indices must be unique and strictly increasing")
    if any(index < 0 or index >= len(initial_moves) for index in x_indices):
        raise ValueError("x index is outside initial_moves")
    actual_x_indices = [
        index for index, move in enumerate(initial_moves) if move == "X"
    ]
    if x_indices != actual_x_indices:
        raise ValueError("x_indices must identify every X in initial_moves")

    full_sequences: list[FullRankedSequence] = []
    for state_node in last_state_nodes:
        for source_path in state_node.paths:
            x_moves, rank_groups = _copy_ranked_path(source_path)
            if len(x_moves) != len(x_indices):
                raise ValueError(
                    "x_path length must match the number of X indices"
                )
            if len(rank_groups) != len(x_indices):
                raise ValueError(
                    "rank group count must match the number of X indices"
                )

            full_moves = list(initial_moves)
            for index, recovered_move in zip(x_indices, x_moves):
                full_moves[index] = recovered_move
            full_sequences.append((full_moves, list(rank_groups)))

    return _deduplicate_ranked_sequences(full_sequences)


def process_fen_stream(
    fen_list: list[FEN],
    initial_moves: list[Move] | None = None,
    comparison_function: CandidateComparison | None = None,
    candidate_top_k: int | None = 5,
    candidate_unranked: bool = False,
) -> tuple[list[SingleSequence], list[StateNode]]:
    if not fen_list:
        return [], []
    if len(fen_list) == 1:
        return [], [StateNode(fen_list[0], [([], [])])]

    moves = (
        initial_moves
        if initial_moves is not None
        else infer_initial_move_sequence(fen_list)
    )
    if len(moves) != len(fen_list) - 1:
        raise ValueError("move_list and fen_list have incompatible lengths")

    x_indices = [index for index, move in enumerate(moves) if move == "X"]
    if not x_indices:
        final_board = chess.Board(fen_list[0])
        all_moves_are_valid = all(
            _push_known_move(final_board, move) for move in moves
        )
        final_fen = final_board.fen() if all_moves_are_valid else fen_list[-1]
        return [], [StateNode(final_fen, [([], [])])]

    first_x = x_indices[0]
    initial_board = chess.Board(fen_list[0])
    prefix_is_valid = all(
        _push_known_move(initial_board, move) for move in moves[:first_x]
    )
    initial_fen = initial_board.fen() if prefix_is_valid else fen_list[first_x]
    start_nodes = [StateNode(initial_fen, [([], [])])]
    sequences: list[SingleSequence] = []

    for x_number, x_position in enumerate(x_indices):
        end_position = (
            x_indices[x_number + 1]
            if x_number + 1 < len(x_indices)
            else len(moves)
        )
        active_nodes = _merge_nodes_by_position(start_nodes)
        next_start_nodes: list[StateNode] = []

        for active_node in active_nodes:
            sequence = SingleSequence(
                state_node=active_node,
                move_list=list(moves[x_position:end_position]),
                viewed_fen_list=list(fen_list[x_position : end_position + 1]),
                parent_paths=[
                    _copy_ranked_path(path) for path in active_node.paths
                ],
            )
            sequences.append(sequence)
            next_start_nodes.extend(
                sequence.inference(
                    comparison_function=comparison_function,
                    candidate_top_k=candidate_top_k,
                    candidate_unranked=candidate_unranked,
                )
            )
        start_nodes = _merge_nodes_by_position(next_start_nodes)

    return sequences, _merge_nodes_by_position(start_nodes)
