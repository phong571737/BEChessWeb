from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import chess

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from recover_service.service.fen_to_pgn import FenConversionError, infer_move_from_fen


MoveReplacement = tuple[chess.Move, ...]
MovePath = list[tuple[int, MoveReplacement]]


def position(fen: str) -> str:
    return fen.split()[0]


def preprocess(fens: list[str], start_fen: str | None = None) -> list[str]:
    result: list[str] = []
    previous_position = position(start_fen) if start_fen is not None else None
    for fen in fens:
        current_position = position(fen)
        if current_position != previous_position:
            result.append(fen)
        previous_position = current_position
    return result


def compatible(viewed_fen: str, assumed_board: chess.Board) -> bool:
    viewed = chess.Board(f"{position(viewed_fen)} w - - 0 1")
    return all(
        assumed_board.piece_at(square) == piece
        for square, piece in viewed.piece_map().items()
    )


def infer_moves(start_fen: str, viewed_fens: list[str]) -> list[chess.Move | None]:
    moves: list[chess.Move | None] = []
    before = start_fen
    for viewed in viewed_fens:
        try:
            moves.append(infer_move_from_fen(before, viewed))
        except (FenConversionError, ValueError):
            moves.append(None)
        before = viewed
    return moves


def _replace_side_to_move(fen: str, color: chess.Color) -> str:
    fields = fen.split()
    defaults = ["w", "-", "-", "0", "1"]
    while len(fields) < 6:
        fields.append(defaults[len(fields) - 1])
    fields[1] = "w" if color == chess.WHITE else "b"
    return " ".join(fields)


def _inferred_move_side(before_fen: str, move: chess.Move | None) -> chess.Color | None:
    if move is None:
        return None
    board = chess.Board(f"{position(before_fen)} w - - 0 1")
    piece = board.piece_at(move.from_square)
    return piece.color if piece else None


def normalize_side_to_move(
    start_fen: str,
    viewed_fens: list[str],
    moves: list[chess.Move | None],
) -> tuple[str, list[str], list[chess.Color | None]]:
    inferred_sides: list[chess.Color | None] = []
    before_fen = start_fen
    for viewed_fen, move in zip(viewed_fens, moves):
        inferred_sides.append(_inferred_move_side(before_fen, move))
        before_fen = viewed_fen

    normalized_fens = list(viewed_fens)
    for move_index in range(1, len(moves)):
        mover_side = inferred_sides[move_index]
        if mover_side is None:
            continue
        from_fen_index = move_index - 1
        normalized_fens[from_fen_index] = _replace_side_to_move(
            normalized_fens[from_fen_index], mover_side
        )

    return start_fen, normalized_fens, inferred_sides


def _move_tokens(moves: list[chess.Move | None], start: int, end: int) -> list[str]:
    return [move.uci() if move else "X" for move in moves[start:end]]


@dataclass
class FenNode:
    fen: str
    parents: list[MovePath]

    @property
    def position(self) -> str:
        return position(self.fen)


@dataclass
class SingleSequence:
    start_fen: str
    viewed_fens: list[str]
    moves: list[chess.Move | None]
    parents: list[MovePath]
    x_index: int
    def assume(self, padding: int = 0) -> list[FenNode]:
        if not self.moves or self.moves[0] is not None:
            raise ValueError("A sequence must start with X")
        start_board = chess.Board(self.start_fen)
        results: list[FenNode] = []

        assumed_states: list[tuple[chess.Board, MoveReplacement]] = [
            (start_board, ())
        ]
        for _ in range(padding):
            next_states: list[tuple[chess.Board, MoveReplacement]] = []
            for board, assumed_moves in assumed_states:
                for move in board.legal_moves:
                    next_board = board.copy(stack=False)
                    next_board.push(move)
                    next_states.append((next_board, (*assumed_moves, move)))
            assumed_states = next_states

        for padding_board, padding_moves in assumed_states:
            for assumed_move in padding_board.legal_moves:
                board = padding_board.copy(stack=False)
                board.push(assumed_move)
                assumed_moves = (*padding_moves, assumed_move)

                if not compatible(self.viewed_fens[0], board):
                    continue

                alive = True
                for viewed_fen, detected_move in zip(
                    self.viewed_fens[1:], self.moves[1:]
                ):
                    if detected_move is None or detected_move not in board.legal_moves:
                        alive = False
                        break
                    board.push(detected_move)
                    if not compatible(viewed_fen, board):
                        alive = False
                        break

                if alive:
                    new_parents = [
                        [*parent, (self.x_index, assumed_moves)]
                        for parent in self.parents
                    ]
                    results.append(
                        FenNode(board.fen(en_passant="fen"), new_parents)
                    )
        return results
    def is_alive(self) -> bool:
        return bool(self.assume())
def _group_by_position(nodes: list[FenNode]) -> list[FenNode]:
    grouped: dict[str, FenNode] = {}
    for node in nodes:
        current = grouped.get(node.position)
        if current is None:
            grouped[node.position] = node
            continue
        known = {
            tuple((index, tuple(move.uci() for move in replacement)) for index, replacement in path)
            for path in current.parents
        }
        for path in node.parents:
            key = tuple(
                (index, tuple(move.uci() for move in replacement))
                for index, replacement in path
            )
            if key not in known:
                current.parents.append(path)
                known.add(key)
    return list(grouped.values())


def _replay_prefix(
    start_fen: str,
    viewed_fens: list[str],
    moves: list[chess.Move | None],
    end: int,
) -> chess.Board | None:
    board = chess.Board(start_fen)
    for viewed_fen, move in zip(viewed_fens[:end], moves[:end]):
        if move is None or move not in board.legal_moves:
            return None
        board.push(move)
        if not compatible(viewed_fen, board):
            return None
    return board


def _replay_range(
    start_fen: str,
    viewed_fens: list[str],
    moves: list[chess.Move | None],
    start: int,
    end: int,
) -> chess.Board | None:
    board = chess.Board(start_fen)
    for index in range(start, end):
        move = moves[index]
        if move is None or move not in board.legal_moves:
            return None
        board.push(move)
        if not compatible(viewed_fens[index], board):
            return None
    return board


def _fill_moves(
    moves: list[chess.Move | None],
    path: MovePath,
    end: int,
) -> list[chess.Move]:
    return _fill_segment_moves(moves, path, 0, end)


def _fill_segment_moves(
    moves: list[chess.Move | None],
    path: MovePath,
    start: int,
    end: int,
) -> list[chess.Move]:
    replacements = dict(path)
    filled: list[chess.Move] = []
    for index in range(start, end):
        if index in replacements:
            filled.extend(replacements[index])
        elif moves[index] is not None:
            filled.append(moves[index])
        else:
            raise ValueError("Move segment still contains X")
    return filled


def _san_moves(start_fen: str, moves: list[chess.Move]) -> list[str]:
    board = chess.Board(start_fen)
    result: list[str] = []
    for move in moves:
        result.append(board.san(move))
        board.push(move)
    return result


def _valid_restart_fen(fen: str) -> bool:
    try:
        return chess.Board(fen).is_valid()
    except ValueError:
        return False


def _make_component(
    moves: list[chess.Move | None],
    start: int,
    end: int,
    start_fen: str,
    nodes: list[FenNode],
) -> dict | None:
    if end <= start:
        return None

    move_lists = []
    seen: set[tuple[str, ...]] = set()
    for node in nodes:
        for path in node.parents:
            filled = _fill_segment_moves(moves, path, start, end)
            key = tuple(move.uci() for move in filled)
        if key in seen:
            continue
        seen.add(key)
        move_lists.append(
            {
                "uci": list(key),
                "san": _san_moves(start_fen, filled),
            }
        )

    return {
        "startMoveIndex": start,
        "endMoveIndex": end - 1,
        "startFen": start_fen,
        "moveLists": move_lists,
    }


def _build_move_templates(
    moves: list[chess.Move | None], components: list[dict]
) -> list[list[str]]:
    templates = [_move_tokens(moves, 0, len(moves))]
    for component in reversed(components):
        start = component["startMoveIndex"]
        end = component["endMoveIndex"] + 1
        templates = [
            [*template[:start], *move_list["uci"], *template[end:]]
            for template in templates
            for move_list in component["moveLists"]
        ]
    return templates


def _postprocess_padding(
    viewed_fens: list[str],
    moves: list[chess.Move | None],
    unresolved_x_indexes: list[int],
    failed_start_nodes: dict[int, list[FenNode]],
) -> tuple[list[dict], list[dict], dict[int, list[list[str]]]]:
    attempts: list[dict] = []
    repairs: list[dict] = []
    replacements: dict[int, list[list[str]]] = {}

    for x_index in sorted(unresolved_x_indexes):
        start_nodes = failed_start_nodes.get(x_index, [])
        attempt = {
            "xIndex": x_index,
            "triedPaddingCounts": [],
            "repaired": False,
        }

        if not start_nodes:
            attempt["reason"] = "noStartNodes"
            attempts.append(attempt)
            continue

        for padding in range(1, 3):
            attempt["triedPaddingCounts"].append(padding)
            found = _try_padding_to_end(
                start_nodes,
                viewed_fens,
                moves,
                x_index,
                padding,
            )

            if found:
                replacements[x_index] = [list(item) for item in sorted(found)]
                attempt["repaired"] = True
                repairs.append({
                    "xIndex": x_index,
                    "paddingCount": padding,
                    "assumedMoveCount": padding + 1,
                    "candidateCount": len(found),
                })
                break

        attempts.append(attempt)

    return attempts, repairs, replacements


def _try_padding_to_end(
    start_nodes: list[FenNode],
    viewed_fens: list[str],
    moves: list[chess.Move | None],
    x_index: int,
    padding: int,
) -> set[tuple[str, ...]]:
    """Return replacements at x_index that leave a branch alive to game end."""
    states: list[tuple[chess.Board, MoveReplacement]] = [
        (chess.Board(node.fen), ())
        for node in start_nodes
    ]

    for index in range(x_index, len(moves)):
        next_states: list[tuple[chess.Board, MoveReplacement]] = []

        for board, target_replacement in states:
            if index == x_index:
                assumed_states = [(board, ())]
                for _ in range(padding + 1):
                    expanded: list[tuple[chess.Board, MoveReplacement]] = []
                    for assumed_board, assumed_moves in assumed_states:
                        for move in assumed_board.legal_moves:
                            next_board = assumed_board.copy(stack=False)
                            next_board.push(move)
                            expanded.append((next_board, (*assumed_moves, move)))
                    assumed_states = expanded

                for next_board, assumed_moves in assumed_states:
                    if compatible(viewed_fens[index], next_board):
                        next_states.append((next_board, assumed_moves))
                continue

            detected_move = moves[index]
            if detected_move is not None:
                if detected_move not in board.legal_moves:
                    continue
                next_board = board.copy(stack=False)
                next_board.push(detected_move)
                if compatible(viewed_fens[index], next_board):
                    next_states.append((next_board, target_replacement))
                continue

            for assumed_move in board.legal_moves:
                next_board = board.copy(stack=False)
                next_board.push(assumed_move)
                if compatible(viewed_fens[index], next_board):
                    next_states.append((next_board, target_replacement))

        grouped: dict[tuple[str, MoveReplacement], chess.Board] = {}
        for board, target_replacement in next_states:
            grouped[(board.fen(en_passant="fen"), target_replacement)] = board
        states = [
            (board, target_replacement)
            for (_, target_replacement), board in grouped.items()
        ]
        if not states:
            return set()

    return {
        tuple(move.uci() for move in target_replacement)
        for _, target_replacement in states
    }


def _apply_padding_replacements(
    templates: list[list[str]], replacements: dict[int, list[list[str]]]
) -> list[list[str]]:
    for x_index in sorted(replacements, reverse=True):
        templates = [
            [*template[:x_index], *replacement, *template[x_index + 1:]]
            for template in templates
            for replacement in replacements[x_index]
        ]
    return templates


def _advance_continuous(
    states: list[tuple[chess.Board, tuple[str, ...]]],
    viewed_fen: str,
    detected_move: chess.Move | None,
    padding: int,
) -> list[tuple[chess.Board, tuple[str, ...]]]:
    results: dict[tuple[str, tuple[str, ...]], chess.Board] = {}

    for start_board, path in states:
        assumed_states = [(start_board, path)]
        for _ in range(padding):
            expanded = []
            for board, current_path in assumed_states:
                for move in board.legal_moves:
                    next_board = board.copy(stack=False)
                    next_board.push(move)
                    expanded.append((next_board, (*current_path, move.uci())))
            assumed_states = expanded

        for board, current_path in assumed_states:
            candidates = (
                list(board.legal_moves)
                if detected_move is None
                else [detected_move] if detected_move in board.legal_moves else []
            )
            for move in candidates:
                next_board = board.copy(stack=False)
                next_board.push(move)
                if not compatible(viewed_fen, next_board):
                    continue
                next_path = (*current_path, move.uci())
                key = (next_board.fen(en_passant="fen"), next_path)
                results[key] = next_board

    return [(board, path) for (_, path), board in results.items()]


def _continuous_postprocess(
    start_fen: str,
    viewed_fens: list[str],
    moves: list[chess.Move | None],
) -> tuple[list[list[str]], list[dict], list[dict]]:
    states: list[tuple[chess.Board, tuple[str, ...]]] = [
        (chess.Board(start_fen), ())
    ]
    attempts: list[dict] = []
    repairs: list[dict] = []

    for index, (viewed_fen, detected_move) in enumerate(zip(viewed_fens, moves)):
        next_states = _advance_continuous(
            states, viewed_fen, detected_move, padding=0
        )
        if next_states:
            states = next_states
            continue

        attempt = {
            "moveIndex": index,
            "triedPaddingCounts": [],
            "repaired": False,
        }
        for padding in range(1, 3):
            attempt["triedPaddingCounts"].append(padding)
            next_states = _advance_continuous(
                states, viewed_fen, detected_move, padding=padding
            )
            if not next_states:
                continue
            attempt["repaired"] = True
            repairs.append({
                "moveIndex": index,
                "paddingCount": padding,
                "preservedMove": detected_move.uci() if detected_move else "X",
                "candidateCount": len(next_states),
            })
            states = next_states
            break

        attempts.append(attempt)
        if not attempt["repaired"]:
            return [], attempts, repairs

    paths = sorted({path for _, path in states})
    return [list(path) for path in paths], attempts, repairs


def _build_unresolved_segments(
    moves: list[chess.Move | None], unresolved_x_indexes: list[int]
) -> list[dict]:
    all_x_indexes = [index for index, move in enumerate(moves) if move is None]
    segments = []
    for x_index in unresolved_x_indexes:
        x_number = all_x_indexes.index(x_index)
        end = (
            all_x_indexes[x_number + 1]
            if x_number + 1 < len(all_x_indexes)
            else len(moves)
        )
        segments.append({
            "startMoveIndex": x_index,
            "endMoveIndex": end - 1,
            "moves": _move_tokens(moves, x_index, end),
        })
    return segments


def recover(fen_history: list[str], start_fen: str = chess.STARTING_FEN) -> dict:
    viewed_fens = preprocess(fen_history, start_fen)
    moves = infer_moves(start_fen, viewed_fens)
    start_fen, viewed_fens, inferred_sides = normalize_side_to_move(
        start_fen, viewed_fens, moves
    )
    normalized_sides = [fen.split()[1] for fen in viewed_fens]
    inferred_side_tokens = [
        None if side is None else "w" if side == chess.WHITE else "b"
        for side in inferred_sides
    ]
    x_indexes = [index for index, move in enumerate(moves) if move is None]

    if not x_indexes:
        complete = _fill_moves(moves, [], len(moves))
        move_lists = [{
            "uci": [move.uci() for move in complete],
            "san": _san_moves(start_fen, complete),
        }]
        return {
            "fullyRecovered": True,
            "continuedToEnd": True,
            "stoppedAtMoveIndex": None,
            "skippedXIndexes": [],
            "skippedRanges": [],
            "unresolvedSegments": [],
            "paddingAttempts": [],
            "paddingRepairs": [],
            "normalizedFens": viewed_fens,
            "normalizedSides": normalized_sides,
            "inferredSides": inferred_side_tokens,
            "inferredMoves": [move.uci() for move in complete],
            "components": [{
                "startMoveIndex": 0,
                "endMoveIndex": len(moves) - 1,
                "startFen": start_fen,
                "moveLists": move_lists,
            }],
            "moveTemplates": [[move.uci() for move in complete]],
            "final_move_lists": [[move.uci() for move in complete]],
            "branchCount": 1,
            "moveLists": move_lists,
        }

    first_x = x_indexes[0]
    prefix_board = _replay_prefix(start_fen, viewed_fens, moves, first_x)
    if prefix_board is None:
        return {
            "fullyRecovered": False,
            "continuedToEnd": False,
            "stoppedAtMoveIndex": first_x,
            "skippedXIndexes": [],
            "skippedRanges": [{"start": 0, "end": first_x - 1}],
            "unresolvedSegments": [{
                "startMoveIndex": 0,
                "endMoveIndex": first_x - 1,
                "moves": _move_tokens(moves, 0, first_x),
            }],
            "paddingAttempts": [],
            "paddingRepairs": [],
            "normalizedFens": viewed_fens,
            "normalizedSides": normalized_sides,
            "inferredSides": inferred_side_tokens,
            "inferredMoves": [move.uci() if move else "X" for move in moves],
            "components": [],
            "moveTemplates": [_move_tokens(moves, 0, len(moves))],
            "final_move_lists": [_move_tokens(moves, 0, len(moves))],
            "branchCount": 1,
            "moveLists": [],
        }

    nodes = [FenNode(prefix_board.fen(en_passant="fen"), [[]])]
    components: list[dict] = []
    failed_start_nodes: dict[int, list[FenNode]] = {}
    skipped_x_indexes: list[int] = []
    skipped_ranges: list[dict[str, int]] = []
    unresolved_segments: list[dict] = []
    component_start = 0
    component_start_fen = start_fen
    recovered_end = first_x
    stopped_at: int | None = None
    x_number = 0
    component_open = True

    while x_number < len(x_indexes):
        current_x = x_indexes[x_number]
        end = x_indexes[x_number + 1] if x_number + 1 < len(x_indexes) else len(moves)
        candidates: list[FenNode] = []

        for node in nodes:
            candidates.extend(
                SingleSequence(
                    start_fen=node.fen,
                    viewed_fens=viewed_fens[current_x:end],
                    moves=moves[current_x:end],
                    parents=node.parents,
                    x_index=current_x,
                ).assume()
            )

        if candidates:
            nodes = _group_by_position(candidates)
            recovered_end = end
            x_number += 1
            continue

        failed_start_nodes[current_x] = nodes
        component = _make_component(
            moves, component_start, recovered_end, component_start_fen, nodes
        )
        if component is not None:
            components.append(component)

        next_x = x_indexes[x_number + 1] if x_number + 1 < len(x_indexes) else len(moves)
        restart_fen = viewed_fens[current_x]
        restart_board = None
        if _valid_restart_fen(restart_fen):
            restart_board = _replay_range(
                restart_fen,
                viewed_fens,
                moves,
                current_x + 1,
                next_x,
            )

        if restart_board is not None:
            skipped_x_indexes.append(current_x)
            skipped_ranges.append({"start": current_x, "end": current_x})
            unresolved_segments.append({
                "startMoveIndex": current_x,
                "endMoveIndex": current_x,
                "moves": ["X"],
            })
            nodes = [FenNode(restart_board.fen(en_passant="fen"), [[]])]
            component_start = current_x + 1
            component_start_fen = restart_fen
            recovered_end = next_x
            x_number += 1
            continue

        restart_number = x_number + 1
        while restart_number < len(x_indexes):
            restart_x = x_indexes[restart_number]
            restart_fen = viewed_fens[restart_x - 1]
            if _valid_restart_fen(restart_fen):
                break
            restart_number += 1

        skipped_indexes = x_indexes[x_number:restart_number]
        skipped_x_indexes.extend(skipped_indexes)
        skipped_ranges.extend(
            {"start": index, "end": index} for index in skipped_indexes
        )

        if restart_number >= len(x_indexes):
            unresolved_segments.append({
                "startMoveIndex": current_x,
                "endMoveIndex": len(moves) - 1,
                "moves": _move_tokens(moves, current_x, len(moves)),
            })
            stopped_at = current_x
            component_open = False
            break

        restart_x = x_indexes[restart_number]
        restart_fen = viewed_fens[restart_x - 1]
        unresolved_segments.append({
            "startMoveIndex": current_x,
            "endMoveIndex": restart_x - 1,
            "moves": _move_tokens(moves, current_x, restart_x),
        })

        nodes = [FenNode(restart_fen, [[]])]
        component_start = restart_x
        component_start_fen = restart_fen
        recovered_end = restart_x
        x_number = restart_number

    if component_open:
        component = _make_component(
            moves, component_start, recovered_end, component_start_fen, nodes
        )
        if component is not None:
            components.append(component)

    move_lists = [
        {
            **move_list,
            "componentIndex": component_index,
            "startMoveIndex": component["startMoveIndex"],
            "endMoveIndex": component["endMoveIndex"],
        }
        for component_index, component in enumerate(components)
        for move_list in component["moveLists"]
    ]
    base_continued_to_end = component_open and recovered_end == len(moves)
    move_templates = _build_move_templates(moves, components)
    continuous_templates, padding_attempts, padding_repairs = (
        _continuous_postprocess(start_fen, viewed_fens, moves)
    )

    if continuous_templates:
        move_templates = continuous_templates
        skipped_x_indexes = []
        skipped_ranges = []
        unresolved_segments = []
        continued_to_end = True
        stopped_at = None
    else:
        padding_attempts, padding_repairs, padding_replacements = (
            _postprocess_padding(
                viewed_fens,
                moves,
                skipped_x_indexes,
                failed_start_nodes,
            )
        )
        move_templates = _apply_padding_replacements(
            move_templates, padding_replacements
        )
        repaired_x_indexes = set(padding_replacements)
        skipped_x_indexes = [
            index for index in skipped_x_indexes if index not in repaired_x_indexes
        ]
        skipped_ranges = [
            {"start": index, "end": index} for index in skipped_x_indexes
        ]
        unresolved_segments = _build_unresolved_segments(moves, skipped_x_indexes)
        continued_to_end = base_continued_to_end or not skipped_x_indexes
        stopped_at = None if not skipped_x_indexes else stopped_at

    return {
        "fullyRecovered": not skipped_x_indexes,
        "continuedToEnd": continued_to_end,
        "stoppedAtMoveIndex": stopped_at,
        "skippedXIndexes": skipped_x_indexes,
        "skippedRanges": skipped_ranges,
        "unresolvedSegments": unresolved_segments,
        "paddingAttempts": padding_attempts,
        "paddingRepairs": padding_repairs,
        "normalizedFens": viewed_fens,
        "normalizedSides": normalized_sides,
        "inferredSides": inferred_side_tokens,
        "inferredMoves": [move.uci() if move else "X" for move in moves],
        "components": components,
        "moveTemplates": move_templates,
        "final_move_lists": move_templates,
        "branchCount": len(move_templates),
        "moveLists": move_lists,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("fen_file", help="Text file containing one FEN per line")
    parser.add_argument("--start-fen", default=chess.STARTING_FEN)
    args = parser.parse_args()

    lines = Path(args.fen_file).read_text(encoding="utf-8-sig").splitlines()
    fens = [line.strip() for line in lines if line.strip() and not line.startswith("#")]
    print(json.dumps(recover(fens, args.start_fen), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
