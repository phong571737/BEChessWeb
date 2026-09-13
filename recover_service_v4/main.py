import argparse
import os
import shutil
from pathlib import Path

import chess

from .models import Move
from .pipeline import run_pipeline
from .stockfish_service import RankedGroups


def _to_san(start_fen: str, path: list[Move]) -> list[str] | None:
    board = chess.Board(start_fen)
    san_moves: list[str] = []
    for uci_move in path:
        if uci_move == "X":
            return None
        move = chess.Move.from_uci(uci_move)
        if move not in board.legal_moves:
            return None
        san_moves.append(board.san(move))
        board.push(move)
    return san_moves


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Recover chess moves from a stream of observed FENs."
    )
    parser.add_argument(
        "--stockfish",
        help=(
            "Path to the Stockfish executable. Defaults to STOCKFISH_PATH "
            "or a stockfish executable available on PATH."
        ),
    )
    parser.add_argument(
        "--depth",
        type=int,
        default=15,
        help="Stockfish analysis depth for each branch node (default: 15).",
    )
    return parser.parse_args()


def _print_groups(start_fen: str, ranked_groups: RankedGroups) -> None:
    for padding_indices, ranked_paths in ranked_groups.items():
        print(f"Padding indices: {padding_indices}")
        for index, (path, scores) in enumerate(ranked_paths, start=1):
            print(f"  Path {index} (UCI): {path}")
            print(f"  Path {index} scores (mover POV): {scores}")
            san_moves = _to_san(start_fen, path)
            if san_moves is not None:
                print(f"  Path {index} (SAN): {' '.join(san_moves)}")
            else:
                print(f"  Path {index} (SAN): unavailable")


def main() -> None:
    args = _parse_args()
    raw_fen_stream = [
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    ]

    print(f"[*] Received {len(raw_fen_stream)} sensor frames.")
    bundled_stockfish = (
        Path(__file__).resolve().parent
        / "stockfish"
        / "stockfish-windows-x86-64-avx2.exe"
    )
    stockfish_path = (
        args.stockfish
        or os.environ.get("STOCKFISH_PATH")
        or shutil.which("stockfish")
        or (str(bundled_stockfish) if bundled_stockfish.is_file() else None)
    )
    if stockfish_path is None:
        raise FileNotFoundError(
            "Stockfish not found. Use --stockfish PATH or set STOCKFISH_PATH."
        )

    ranked_groups = run_pipeline(
        raw_fens=raw_fen_stream,
        stockfish_path=stockfish_path,
        max_missing_fens=2,
        stockfish_depth=args.depth,
    )
    print("\n" + "=" * 50)
    print(f"Recovered paths: {sum(map(len, ranked_groups.values()))}")
    print(
        "[*] Paths grouped by padding indices and ranked lexicographically "
        f"(mover POV, depth={args.depth})."
    )
    _print_groups(raw_fen_stream[0], ranked_groups)


if __name__ == "__main__":
    main()
