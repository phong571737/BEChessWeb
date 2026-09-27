import argparse
from pathlib import Path

from pipeline import run_pipeline


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Recover chess paths using python-chess brute force only."
    )
    parser.add_argument("fen_file", type=Path, help="Text file containing one FEN per line")
    parser.add_argument(
        "--max-missing-fens",
        type=int,
        default=2,
        help="Maximum missing FEN count per unresolved transition (default: 2)",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    fens = [
        line.strip()
        for line in args.fen_file.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    result = run_pipeline(fens, max_missing_fens=args.max_missing_fens)
    for item in result["results"]:
        print(f"Rank {item['rank']}: {' '.join(item['moves'])}")


if __name__ == "__main__":
    main()
