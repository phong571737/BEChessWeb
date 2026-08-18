"""Minimal copy of fen_to_pgn from original project."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable, Mapping

import chess
import chess.pgn


class FenConversionError(ValueError):
    """Raised when one move cannot be inferred from two piece placements."""


def _piece_board(fen: str) -> chess.Board:
    placement = fen.split(maxsplit=1)[0]
    try:
        return chess.Board(f"{placement} w - - 0 1")
    except ValueError as exc:
        raise FenConversionError(f"Invalid FEN piece placement: {fen!r}") from exc


def _same_moving_piece(before: chess.Piece, after: chess.Piece) -> bool:
    if before.color != after.color:
        return False
    return before.piece_type == after.piece_type or (
        before.piece_type == chess.PAWN
        and after.piece_type in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
    )


def infer_move_from_fen(before_fen: str, after_fen: str) -> chess.Move | None:
    before = _piece_board(before_fen)
    after = _piece_board(after_fen)
    changed = [
        square
        for square in chess.SQUARES
        if before.piece_at(square) != after.piece_at(square)
    ]

    if not changed:
        return None

    king_from = next(
        (
            square
            for square in changed
            if (piece := before.piece_at(square)) is not None
            and piece.piece_type == chess.KING
            and after.piece_at(square) != piece
        ),
        None,
    )
    if king_from is not None:
        king = before.piece_at(king_from)
        king_to = next(
            (
                square
                for square in changed
                if (piece := after.piece_at(square)) is not None
                and piece.piece_type == chess.KING
                and piece.color == king.color
                and square != king_from
            ),
            None,
        )
        if king_to is not None:
            return chess.Move(king_from, king_to)

    candidates: list[chess.Move] = []
    for from_square in changed:
        moving_piece = before.piece_at(from_square)
        if moving_piece is None or after.piece_at(from_square) == moving_piece:
            continue
        for to_square in changed:
            destination_piece = before.piece_at(to_square)
            if destination_piece is not None and destination_piece.color == moving_piece.color:
                continue
            arrived_piece = after.piece_at(to_square)
            if arrived_piece is None or not _same_moving_piece(moving_piece, arrived_piece):
                continue
            promotion = (
                arrived_piece.piece_type
                if moving_piece.piece_type == chess.PAWN
                and arrived_piece.piece_type != chess.PAWN
                else None
            )
            candidates.append(chess.Move(from_square, to_square, promotion=promotion))

    unique = list(dict.fromkeys(candidates))
    if len(unique) == 1:
        return unique[0]
    raise FenConversionError(
        "Cannot infer one unambiguous move from piece placement:\n"
        f"before: {before_fen}\nafter:  {after_fen}"
    )


def _san_for_inferred_move(before_fen: str, move: chess.Move) -> str:
    placement_board = _piece_board(before_fen)
    piece = placement_board.piece_at(move.from_square)
    if piece is None:
        return move.uci()

    castling = "-"
    if piece.piece_type == chess.KING and abs(
        chess.square_file(move.to_square) - chess.square_file(move.from_square)
    ) == 2:
        if piece.color == chess.WHITE:
            castling = "K" if move.to_square > move.from_square else "Q"
        else:
            castling = "k" if move.to_square > move.from_square else "q"

    en_passant = "-"
    if (
        piece.piece_type == chess.PAWN
        and chess.square_file(move.from_square) != chess.square_file(move.to_square)
        and placement_board.piece_at(move.to_square) is None
    ):
        en_passant = chess.square_name(move.to_square)

    turn = "w" if piece.color == chess.WHITE else "b"
    reconstructed = f"{before_fen.split(maxsplit=1)[0]} {turn} {castling} {en_passant} 0 1"
    try:
        return chess.Board(reconstructed).san(move)
    except (AssertionError, ValueError):
        return move.uci()


def _format_move_list(move_tokens: list[str]) -> str:
    lines: list[str] = []
    for index, token in enumerate(move_tokens):
        move_number = index // 2 + 1
        if index % 2 == 0:
            lines.append(f"{move_number}. {token}")
        else:
            lines.append(f"{move_number}... {token}")
    return "\n".join(lines)


def _missing_move_token(before_fen: str, after_fen: str) -> str:
    return f'X {{beforeFEN "{before_fen}"; afterFEN "{after_fen}"}}'


def fens_to_pgn(
    fen_history: Iterable[str],
    *,
    start_fen: str = chess.STARTING_FEN,
    headers: Mapping[str, str] | None = None,
) -> str:
    game = chess.pgn.Game()
    game.headers.update(
        {
            "Event": "?",
            "Site": "?",
            "Date": "????.??.??",
            "Round": "1",
            "White": "?",
            "Black": "?",
            "Result": "*",
        }
    )
    if headers:
        game.headers.update({str(key): str(value) for key, value in headers.items()})

    history = list(fen_history)
    if not history:
        headers_text = "\n".join(f"[{name} \"{value}\"]" for name, value in game.headers.items())
        return f"{headers_text}\n\n"

    move_tokens: list[str] = []
    previous_fen = start_fen

    for next_fen in history:
        try:
            move = infer_move_from_fen(previous_fen, next_fen)
            if move is None:
                move_tokens.append(_missing_move_token(previous_fen, next_fen))
            else:
                move_tokens.append(_san_for_inferred_move(previous_fen, move))
        except (FenConversionError, ValueError):
            move_tokens.append(_missing_move_token(previous_fen, next_fen))
        previous_fen = next_fen

    move_text = _format_move_list(move_tokens)
    headers_text = "\n".join(f"[{name} \"{value}\"]" for name, value in game.headers.items())
    return f"{headers_text}\n\n{move_text}"
