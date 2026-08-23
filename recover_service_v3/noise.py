"""Safe persistent-square masking for extra-piece FEN observations."""

from __future__ import annotations

from dataclasses import dataclass

import chess

from recover_service_v3.service.fen_to_pgn import (
    FenConversionError,
    infer_move_from_fen,
)


@dataclass(frozen=True)
class PersistentNoiseMask:
    square: chess.Square
    start_index: int
    detected_piece: chess.Piece
    reason: str = "extraPieceAfterUniqueLegalMove"

    def to_dict(self) -> dict[str, object]:
        return {
            "square": chess.square_name(self.square),
            "startIndex": self.start_index,
            "detectedPiece": self.detected_piece.symbol(),
            "pieceType": chess.piece_name(self.detected_piece.piece_type),
            "color": "white" if self.detected_piece.color else "black",
            "reason": self.reason,
        }


@dataclass(frozen=True)
class NoiseCleaningResult:
    cleaned_fens: tuple[str, ...]
    masks: tuple[PersistentNoiseMask, ...]
    unresolved_events: tuple[dict[str, object], ...]
    scan_completed: bool
    removed_observation_count: int

    def to_dict(self, *, applied: bool = True) -> dict[str, object]:
        return {
            "applied": applied,
            "scanCompleted": self.scan_completed,
            "maskCount": len(self.masks),
            "removedObservationCount": self.removed_observation_count,
            "masks": [mask.to_dict() for mask in self.masks],
            "unresolvedEvents": list(self.unresolved_events),
        }


def _piece_board(fen: str) -> chess.Board:
    placement = str(fen).strip().split()[0]
    return chess.Board(f"{placement} w - - 0 1")


def _clear_squares(fen: str, squares: set[chess.Square]) -> str:
    fields = str(fen).strip().split()
    board = chess.Board(f"{fields[0]} w - - 0 1")
    for square in squares:
        board.remove_piece_at(square)
    fields[0] = board.board_fen()
    return " ".join(fields)


def apply_persistent_masks(
    fens: list[str], masks: list[PersistentNoiseMask]
) -> tuple[tuple[str, ...], int]:
    """Materialize all masks in one forward pass over immutable observations."""
    starts: dict[int, list[chess.Square]] = {}
    for mask in masks:
        starts.setdefault(mask.start_index, []).append(mask.square)

    active: set[chess.Square] = set()
    cleaned: list[str] = []
    removed_count = 0
    for index, fen in enumerate(fens):
        active.update(starts.get(index, ()))
        raw_board = _piece_board(fen)
        removed_count += sum(
            raw_board.piece_at(square) is not None for square in active
        )
        cleaned.append(_clear_squares(fen, active))
    return tuple(cleaned), removed_count


def _canonical_after_move(
    board: chess.Board, move: chess.Move
) -> chess.Board | None:
    next_board = board.copy(stack=False)
    moving_piece = next_board.piece_at(move.from_square)
    if moving_piece is None:
        return None
    # Observation side-to-move is unreliable, so align the temporary canonical
    # board with the color of the inferred moving piece before legality checks.
    next_board.turn = moving_piece.color
    if move not in next_board.legal_moves:
        return None
    next_board.push(move)
    return next_board


def detect_and_clean_extra_piece_noise(
    fens: list[str],
    start_fen: str,
    *,
    max_new_masks_per_transition: int = 2,
    max_total_masked_squares: int = 4,
) -> NoiseCleaningResult:
    """Detect safe extra-piece masks in one scan, then clean history once.

    A new persistent mask is accepted only after one unique legal inferred move
    and only when every unmasked residual is an extra observed non-king piece.
    Once detected, a square remains an observation wildcard through game end.
    """
    if max_new_masks_per_transition < 0:
        raise ValueError("max_new_masks_per_transition must be at least 0")
    if max_total_masked_squares < 0:
        raise ValueError("max_total_masked_squares must be at least 0")

    canonical = chess.Board(start_fen)
    masks: list[PersistentNoiseMask] = []
    active_squares: set[chess.Square] = set()
    unresolved: list[dict[str, object]] = []
    scan_completed = True

    for index, raw_fen in enumerate(fens):
        masked_fen = _clear_squares(raw_fen, active_squares)
        try:
            inferred = infer_move_from_fen(
                canonical.fen(en_passant="fen"), masked_fen
            )
        except (FenConversionError, ValueError) as exc:
            unresolved.append({
                "index": index,
                "reason": "noUniqueLegalMove",
                "detail": str(exc),
            })
            scan_completed = False
            break

        if inferred is None:
            # Cleaning can collapse a raw noise-only snapshot to the current
            # canonical position. It is not a chess move and does not break the
            # scan; final preprocessing will remove the duplicate.
            if _piece_board(masked_fen).board_fen() == canonical.board_fen():
                continue
            unresolved.append({
                "index": index,
                "reason": "noPiecePlacementChangeWithoutCanonicalMatch",
            })
            scan_completed = False
            break

        if isinstance(inferred, tuple):
            unresolved.append({
                "index": index,
                "reason": "multipleLegalCandidates",
                "candidates": [move.uci() for move in inferred],
            })
            scan_completed = False
            break

        predicted = _canonical_after_move(canonical, inferred)
        if predicted is None:
            unresolved.append({
                "index": index,
                "reason": "inferredMoveIllegalOnCanonicalBoard",
                "move": inferred.uci(),
            })
            scan_completed = False
            break

        raw_board = _piece_board(raw_fen)
        extras: list[tuple[chess.Square, chess.Piece]] = []
        missing: list[chess.Square] = []
        wrong: list[chess.Square] = []
        for square in chess.SQUARES:
            if square in active_squares:
                continue
            observed_piece = raw_board.piece_at(square)
            predicted_piece = predicted.piece_at(square)
            if observed_piece == predicted_piece:
                continue
            if observed_piece is not None and predicted_piece is None:
                extras.append((square, observed_piece))
            elif observed_piece is None:
                missing.append(square)
            else:
                wrong.append(square)

        safe_extras = (
            not missing
            and not wrong
            and len(extras) <= max_new_masks_per_transition
            and len(active_squares) + len(extras) <= max_total_masked_squares
            and all(
                piece.piece_type != chess.KING for _, piece in extras
            )
        )
        if (missing or wrong or extras) and not safe_extras:
            unresolved.append({
                "index": index,
                "reason": "unsafeObservationDifference",
                "move": inferred.uci(),
                "extraSquares": [chess.square_name(square) for square, _ in extras],
                "missingSquares": [chess.square_name(square) for square in missing],
                "wrongPieceSquares": [chess.square_name(square) for square in wrong],
            })
            scan_completed = False
            break

        for square, piece in extras:
            masks.append(PersistentNoiseMask(square, index, piece))
            active_squares.add(square)
        canonical = predicted

    cleaned_fens, removed_count = apply_persistent_masks(fens, masks)
    return NoiseCleaningResult(
        cleaned_fens=cleaned_fens,
        masks=tuple(masks),
        unresolved_events=tuple(unresolved),
        scan_completed=scan_completed,
        removed_observation_count=removed_count,
    )


def no_noise_cleaning(fens: list[str]) -> NoiseCleaningResult:
    return NoiseCleaningResult(
        cleaned_fens=tuple(fens),
        masks=(),
        unresolved_events=(),
        scan_completed=True,
        removed_observation_count=0,
    )
