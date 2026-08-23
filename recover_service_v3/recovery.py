from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import chess

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from recover_service_v3.service.fen_to_pgn import (
    FenConversionError,
    _san_for_inferred_move,
    infer_move_from_fen,
)
from recover_service_v3.noise import (
    detect_and_clean_extra_piece_noise,
    no_noise_cleaning,
)


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
            inferred = infer_move_from_fen(before, viewed)
            # v2's recovery graph currently stores one forced move per observed
            # transition. Preserve multi-candidates separately in recover(); do
            # not pick one arbitrarily here.
            moves.append(inferred if isinstance(inferred, chess.Move) else None)
        except (FenConversionError, ValueError):
            moves.append(None)
        before = viewed
    return moves


def infer_move_candidate_sets(
    start_fen: str, viewed_fens: list[str]
) -> list[tuple[chess.Move, ...]]:
    """Keep every legal candidate returned for each local FEN transition."""
    candidate_sets: list[tuple[chess.Move, ...]] = []
    before = start_fen
    for viewed in viewed_fens:
        try:
            inferred = infer_move_from_fen(before, viewed)
            if inferred is None:
                candidates: tuple[chess.Move, ...] = ()
            elif isinstance(inferred, tuple):
                candidates = inferred
            else:
                candidates = (inferred,)
        except (FenConversionError, ValueError):
            candidates = ()
        candidate_sets.append(candidates)
        before = viewed
    return candidate_sets


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


def _build_final_move_lists(
    moves: list[chess.Move | None],
    components: list[dict],
    inferred_sans: list[str] | None = None,
) -> list[dict]:
    # The inferred move template is authoritative outside recovered X slots.
    # A closed recovery component must not erase moves that infer_move already
    # found in later observations.
    san_template = (
        list(inferred_sans)
        if inferred_sans is not None
        else ["X"] * len(moves)
    )
    if len(san_template) != len(moves):
        raise ValueError("inferred_sans must have the same length as moves")

    move_lists = [{
        "uci": _move_tokens(moves, 0, len(moves)),
        "san": san_template,
    }]
    for component in reversed(components):
        start = component["startMoveIndex"]
        end = component["endMoveIndex"] + 1
        move_lists = [
            {
                "uci": [
                    *template["uci"][:start],
                    *component_moves["uci"],
                    *template["uci"][end:],
                ],
                "san": [
                    *template["san"][:start],
                    *component_moves["san"],
                    *template["san"][end:],
                ],
            }
            for template in move_lists
            for component_moves in component["moveLists"]
        ]
    return move_lists


def _inferred_san_tokens(
    start_fen: str,
    viewed_fens: list[str],
    moves: list[chess.Move | None],
) -> list[str]:
    """Render every local infer_move result without requiring a live branch."""
    tokens: list[str] = []
    before_fen = start_fen
    for viewed_fen, move in zip(viewed_fens, moves):
        tokens.append(
            "X" if move is None else _san_for_inferred_move(before_fen, move)
        )
        before_fen = viewed_fen
    return tokens


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
    move_lists: list[dict], replacements: dict[int, list[list[str]]]
) -> list[dict]:
    for x_index in sorted(replacements, reverse=True):
        move_lists = [
            {
                "uci": [
                    *move_list["uci"][:x_index],
                    *replacement,
                    *move_list["uci"][x_index + 1:],
                ],
                "san": [
                    *move_list["san"][:x_index],
                    *(["X"] * len(replacement)),
                    *move_list["san"][x_index + 1:],
                ],
            }
            for move_list in move_lists
            for replacement in replacements[x_index]
        ]
    return move_lists


def _advance_continuous(
    states: list[tuple[chess.Board, tuple[str, ...], tuple[str, ...]]],
    viewed_fen: str,
    detected_move: chess.Move | None,
    padding: int,
) -> list[tuple[chess.Board, tuple[str, ...], tuple[str, ...]]]:
    results: dict[
        tuple[str, tuple[str, ...]],
        tuple[chess.Board, tuple[str, ...]],
    ] = {}

    for start_board, uci_path, san_path in states:
        assumed_states = [(start_board, uci_path, san_path)]
        for _ in range(padding):
            expanded = []
            for board, current_uci_path, current_san_path in assumed_states:
                for move in board.legal_moves:
                    san = board.san(move)
                    next_board = board.copy(stack=False)
                    next_board.push(move)
                    expanded.append((
                        next_board,
                        (*current_uci_path, move.uci()),
                        (*current_san_path, san),
                    ))
            assumed_states = expanded

        for board, current_uci_path, current_san_path in assumed_states:
            candidates = (
                list(board.legal_moves)
                if detected_move is None
                else [detected_move] if detected_move in board.legal_moves else []
            )
            for move in candidates:
                san = board.san(move)
                next_board = board.copy(stack=False)
                next_board.push(move)
                if not compatible(viewed_fen, next_board):
                    continue
                next_uci_path = (*current_uci_path, move.uci())
                next_san_path = (*current_san_path, san)
                key = (next_board.fen(en_passant="fen"), next_uci_path)
                results[key] = (next_board, next_san_path)

    return [
        (board, uci_path, san_path)
        for (_, uci_path), (board, san_path) in results.items()
    ]


def _continuous_postprocess(
    start_fen: str,
    viewed_fens: list[str],
    moves: list[chess.Move | None],
) -> tuple[list[dict], list[dict], list[dict]]:
    states: list[tuple[chess.Board, tuple[str, ...], tuple[str, ...]]] = [
        (chess.Board(start_fen), (), ())
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

    paths = sorted({(uci_path, san_path) for _, uci_path, san_path in states})
    return [
        {"uci": list(uci_path), "san": list(san_path)}
        for uci_path, san_path in paths
    ], attempts, repairs


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


def recover(
    fen_history: list[str],
    start_fen: str = chess.STARTING_FEN,
    *,
    clean_extra_piece_noise: bool = True,
    max_new_noise_per_transition: int = 2,
    max_total_masked_squares: int = 4,
) -> dict:
    # Invariant: raw consecutive duplicates are collapsed before noise
    # detection. The detector must never interpret repeated camera frames as
    # separate chess transitions.
    deduplicated_before_noise_fens = preprocess(fen_history, start_fen)
    raw_candidate_sets = infer_move_candidate_sets(
        start_fen, deduplicated_before_noise_fens
    )
    noise_cleaning = (
        detect_and_clean_extra_piece_noise(
            deduplicated_before_noise_fens,
            start_fen,
            max_new_masks_per_transition=max_new_noise_per_transition,
            max_total_masked_squares=max_total_masked_squares,
        )
        if clean_extra_piece_noise
        else no_noise_cleaning(deduplicated_before_noise_fens)
    )
    noise_cleaning_metadata = noise_cleaning.to_dict(
        applied=clean_extra_piece_noise
    )
    noise_cleaning_metadata.update({
        "inputFenCount": len(fen_history),
        "deduplicatedBeforeNoiseCount": len(
            deduplicated_before_noise_fens
        ),
        "deduplicatedBeforeNoiseCleaning": True,
    })
    cleaned_observed_fens = list(noise_cleaning.cleaned_fens)
    # Do not deduplicate again after masking. Recovery receives exactly one
    # cleaned observation for every raw observation retained by the initial
    # pre-noise deduplication pass.
    viewed_fens = list(cleaned_observed_fens)
    cleaned_candidate_sets = infer_move_candidate_sets(start_fen, viewed_fens)

    # A unique move seen in raw observations is stronger information than a
    # destination erased by a persistent noise mask. Preserve it and let each
    # canonical recovery branch perform the final legality check. Only fall
    # back to cleaned inference when raw inference was not unique.
    moves: list[chess.Move | None] = []
    inferred_move_sources: list[str] = []
    inferred_move_candidates: list[list[str]] = []
    for raw_candidates, cleaned_candidates in zip(
        raw_candidate_sets, cleaned_candidate_sets
    ):
        if len(raw_candidates) == 1:
            chosen = raw_candidates[0]
            source = "raw"
            output_candidates = raw_candidates
        elif len(cleaned_candidates) == 1:
            chosen = cleaned_candidates[0]
            source = "cleaned"
            output_candidates = cleaned_candidates
        else:
            chosen = None
            source = "ambiguous" if raw_candidates or cleaned_candidates else "X"
            output_candidates = raw_candidates or cleaned_candidates
        moves.append(chosen)
        inferred_move_sources.append(source)
        inferred_move_candidates.append(
            [move.uci() for move in output_candidates]
        )
    inferred_sans = _inferred_san_tokens(start_fen, viewed_fens, moves)
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
        move_templates = [[move.uci() for move in complete]]
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
            "observedFens": deduplicated_before_noise_fens,
            "cleanedFens": cleaned_observed_fens,
            "noiseCleaning": dict(noise_cleaning_metadata),
            "normalizedFens": viewed_fens,
            "normalizedSides": normalized_sides,
            "inferredSides": inferred_side_tokens,
            "inferredMoves": [move.uci() for move in complete],
            "inferredMoveCandidates": inferred_move_candidates,
            "rawInferredMoveCandidates": [
                [move.uci() for move in candidates]
                for candidates in raw_candidate_sets
            ],
            "cleanedInferredMoveCandidates": [
                [move.uci() for move in candidates]
                for candidates in cleaned_candidate_sets
            ],
            "inferredMoveSources": inferred_move_sources,
            "components": [{
                "startMoveIndex": 0,
                "endMoveIndex": len(moves) - 1,
                "startFen": start_fen,
                "moveLists": move_lists,
            }],
            "moveTemplates": move_templates,
            "final_move_lists": move_lists,
            "branchCount": 1,
            "moveLists": move_lists,
        }

    first_x = x_indexes[0]
    prefix_board = _replay_prefix(start_fen, viewed_fens, moves, first_x)
    if prefix_board is None:
        final_move_lists = _build_final_move_lists(moves, [], inferred_sans)
        move_templates = [move_list["uci"] for move_list in final_move_lists]
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
            "observedFens": deduplicated_before_noise_fens,
            "cleanedFens": cleaned_observed_fens,
            "noiseCleaning": dict(noise_cleaning_metadata),
            "normalizedFens": viewed_fens,
            "normalizedSides": normalized_sides,
            "inferredSides": inferred_side_tokens,
            "inferredMoves": [move.uci() if move else "X" for move in moves],
            "inferredMoveCandidates": inferred_move_candidates,
            "rawInferredMoveCandidates": [
                [move.uci() for move in candidates]
                for candidates in raw_candidate_sets
            ],
            "cleanedInferredMoveCandidates": [
                [move.uci() for move in candidates]
                for candidates in cleaned_candidate_sets
            ],
            "inferredMoveSources": inferred_move_sources,
            "components": [],
            "moveTemplates": move_templates,
            "final_move_lists": final_move_lists,
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
    final_move_lists = _build_final_move_lists(
        moves, components, inferred_sans
    )
    continuous_move_lists, padding_attempts, padding_repairs = (
        _continuous_postprocess(start_fen, viewed_fens, moves)
    )

    if continuous_move_lists:
        final_move_lists = continuous_move_lists
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
        final_move_lists = _apply_padding_replacements(
            final_move_lists, padding_replacements
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

    move_templates = [move_list["uci"] for move_list in final_move_lists]

    return {
        "fullyRecovered": not skipped_x_indexes,
        "continuedToEnd": continued_to_end,
        "stoppedAtMoveIndex": stopped_at,
        "skippedXIndexes": skipped_x_indexes,
        "skippedRanges": skipped_ranges,
        "unresolvedSegments": unresolved_segments,
        "paddingAttempts": padding_attempts,
        "paddingRepairs": padding_repairs,
        "observedFens": deduplicated_before_noise_fens,
        "cleanedFens": cleaned_observed_fens,
        "noiseCleaning": dict(noise_cleaning_metadata),
        "normalizedFens": viewed_fens,
        "normalizedSides": normalized_sides,
        "inferredSides": inferred_side_tokens,
        "inferredMoves": [move.uci() if move else "X" for move in moves],
        "inferredMoveCandidates": inferred_move_candidates,
        "rawInferredMoveCandidates": [
            [move.uci() for move in candidates]
            for candidates in raw_candidate_sets
        ],
        "cleanedInferredMoveCandidates": [
            [move.uci() for move in candidates]
            for candidates in cleaned_candidate_sets
        ],
        "inferredMoveSources": inferred_move_sources,
        "components": components,
        "moveTemplates": move_templates,
        "final_move_lists": final_move_lists,
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
