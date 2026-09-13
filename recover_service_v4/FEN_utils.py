import chess

from .models import FEN, Move, SingleSequence, StateNode
from .move_service import FenConversionError, infer_move_from_fen


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
        if observed_piece is not None and assumed_board.piece_at(square) != observed_piece:
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
        if get_fen_position(current_fen) != get_fen_position(deduped_fens[-1]):
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


def _boards_for_both_turns(fen: FEN) -> tuple[chess.Board, chess.Board]:
    white_board = chess.Board(fen)
    white_board.turn = chess.WHITE
    black_board = chess.Board(fen)
    black_board.turn = chess.BLACK
    return white_board, black_board


def start_padding_find(
    fen1: FEN,
    fen2: FEN,
    max_missingFEN: int = 2,
) -> list[list[Move]]:
    target_position = get_fen_position(fen2)
    max_depth = max_missingFEN + 1
    solutions: list[list[Move]] = []

    def dfs(current_board: chess.Board, depth: int, path: list[chess.Move]) -> None:
        if get_fen_position(current_board.fen()) == target_position:
            solutions.append([move.uci() for move in path])
            return
        if depth == 0:
            return

        for move in list(current_board.legal_moves):
            current_board.push(move)
            dfs(current_board, depth - 1, path + [move])
            current_board.pop()

    for start_board in _boards_for_both_turns(fen1):
        dfs(start_board, max_depth, [])
    return [list(path) for path in dict.fromkeys(tuple(path) for path in solutions)]


def _deduplicate_paths(paths: list[list[Move]]) -> list[list[Move]]:
    return [list(path) for path in dict.fromkeys(tuple(path) for path in paths)]


def _merge_nodes_by_position(nodes: list[StateNode]) -> list[StateNode]:
    merged_nodes: dict[str, StateNode] = {}
    for node in nodes:
        position = get_fen_position(node.fen)
        if position not in merged_nodes:
            merged_nodes[position] = StateNode(node.fen, [list(path) for path in node.paths])
        else:
            merged = merged_nodes[position]
            merged.paths = _deduplicate_paths(merged.paths + node.paths)
    return list(merged_nodes.values())


def _push_known_move(board: chess.Board, move_uci: Move) -> bool:
    move = chess.Move.from_uci(move_uci)
    moving_piece = board.piece_at(move.from_square)
    if moving_piece is not None:
        board.turn = moving_piece.color
    if move not in board.legal_moves:
        return False
    board.push(move)
    return True


def recover_local_component(sequence: SingleSequence) -> list[StateNode]:
    if not sequence.move_list or sequence.move_list[0] != "X":
        return []

    active_nodes: list[StateNode] = []

    for start_board in _boards_for_both_turns(sequence.start_fen):
        for candidate in list(start_board.legal_moves):
            assumed_board = start_board.copy(stack=False)
            assumed_board.push(candidate)
            if not compatible(assumed_board.fen(), sequence.viewed_fen_list[1]):
                continue

            assumed_paths = [
                parent_path + [candidate.uci()]
                for parent_path in sequence.parent_paths
            ]
            branch_is_valid = True

            for local_index, known_move in enumerate(sequence.move_list[1:], start=1):
                if known_move == "X" or not _push_known_move(assumed_board, known_move):
                    branch_is_valid = False
                    break
                if not compatible(
                    assumed_board.fen(),
                    sequence.viewed_fen_list[local_index + 1],
                ):
                    branch_is_valid = False
                    break
                assumed_paths = [path + [known_move] for path in assumed_paths]

            if branch_is_valid:
                active_nodes.append(StateNode(assumed_board.fen(), assumed_paths))

    return _merge_nodes_by_position(active_nodes)


def patch_missing_transitions(
    sequence: SingleSequence,
    max_missingFEN: int = 2,
) -> list[list[Move]]:
    branches = patch_missing_transitions_with_indices(
        sequence,
        max_missingFEN=max_missingFEN,
    )
    return _deduplicate_paths(
        [path for path, _padding_indices in branches]
    )


def patch_missing_transitions_with_indices(
    sequence: SingleSequence,
    max_missingFEN: int = 2,
) -> list[tuple[list[Move], list[int]]]:
    """Patch every X and retain each padding move's final path index."""
    if len(sequence.viewed_fen_list) != len(sequence.move_list) + 1:
        raise ValueError("move_list and viewed_fen_list have incompatible lengths")

    result_branches: list[tuple[list[Move], list[int]]] = [([], [])]
    for index, move in enumerate(sequence.move_list):
        replacements = [[move]]
        is_padding = move == "X"
        if move == "X":
            padding_paths = start_padding_find(
                sequence.viewed_fen_list[index],
                sequence.viewed_fen_list[index + 1],
                max_missingFEN=max_missingFEN,
            )
            if padding_paths:
                replacements = padding_paths

        next_branches: list[tuple[list[Move], list[int]]] = []
        for current_path, padding_indices in result_branches:
            for replacement in replacements:
                final_path = current_path + replacement
                final_padding_indices = list(padding_indices)
                if is_padding and replacement != ["X"]:
                    final_padding_indices.extend(
                        range(len(current_path), len(final_path))
                    )
                next_branches.append((final_path, final_padding_indices))
        result_branches = next_branches

    unique: dict[tuple[tuple[Move, ...], tuple[int, ...]], None] = {}
    for path, padding_indices in result_branches:
        unique[(tuple(path), tuple(padding_indices))] = None
    return [
        (list(path), list(padding_indices))
        for path, padding_indices in unique
    ]


def process_fen_stream(
    fen_list: list[FEN],
    initial_moves: list[Move] | None = None,
) -> tuple[list[SingleSequence], list[StateNode]]:
    if len(fen_list) < 2:
        return [], []

    moves = initial_moves if initial_moves is not None else infer_initial_move_sequence(fen_list)
    if len(moves) != len(fen_list) - 1:
        raise ValueError("move_list and fen_list have incompatible lengths")

    x_indices = [index for index, move in enumerate(moves) if move == "X"]
    if not x_indices:
        return [], []

    first_x = x_indices[0]
    initial_board = chess.Board(fen_list[0])
    prefix_is_valid = all(
        _push_known_move(initial_board, move)
        for move in moves[:first_x]
    )
    initial_fen = initial_board.fen() if prefix_is_valid else fen_list[first_x]
    start_nodes = [StateNode(initial_fen, [moves[:first_x]])]
    sequences: list[SingleSequence] = []

    for x_number, x_position in enumerate(x_indices):
        end_position = (
            x_indices[x_number + 1]
            if x_number + 1 < len(x_indices)
            else len(moves)
        )
        active_nodes = _merge_nodes_by_position(start_nodes)
        if not active_nodes:
            active_nodes = [StateNode(fen_list[x_position], [[]])]

        next_start_nodes: list[StateNode] = []
        for active_node in active_nodes:
            sequence = SingleSequence(
                start_fen=active_node.fen,
                move_list=list(moves[x_position:end_position]),
                viewed_fen_list=list(fen_list[x_position:end_position + 1]),
                parent_paths=[list(path) for path in active_node.paths],
            )
            sequences.append(sequence)
            next_start_nodes.extend(recover_local_component(sequence))

        start_nodes = _merge_nodes_by_position(next_start_nodes)

    return sequences, start_nodes
