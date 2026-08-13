"""Preprocessing helpers for chronological FEN observations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class PreprocessedFenHistory:
    history: tuple[str, ...]
    processed_to_input_indexes: tuple[tuple[int, ...], ...]
    original_fen_count: int

    @property
    def removed_duplicate_count(self) -> int:
        return self.original_fen_count - len(self.history)

    def to_dict(self) -> dict[str, object]:
        return {
            "originalFenCount": self.original_fen_count,
            "processedFenCount": len(self.history),
            "removedDuplicateCount": self.removed_duplicate_count,
            "processedToInputIndexes": [
                list(indexes) for indexes in self.processed_to_input_indexes
            ],
        }


def position_key(fen: str) -> str:
    fields = str(fen).strip().split()
    if not fields:
        raise ValueError("FEN must not be empty")
    return fields[0]


def preprocess_fen_history(
    fen_history: Iterable[str],
    *,
    deduplicate_positions: bool = True,
) -> PreprocessedFenHistory:
    source = tuple(str(fen).strip() for fen in fen_history)
    if not deduplicate_positions:
        return PreprocessedFenHistory(
            history=source,
            processed_to_input_indexes=tuple((index,) for index in range(len(source))),
            original_fen_count=len(source),
        )

    history: list[str] = []
    mappings: list[list[int]] = []
    previous_key: str | None = None
    for index, fen in enumerate(source):
        key = position_key(fen)
        if history and key == previous_key:
            mappings[-1].append(index)
            continue
        history.append(fen)
        mappings.append([index])
        previous_key = key

    return PreprocessedFenHistory(
        history=tuple(history),
        processed_to_input_indexes=tuple(tuple(indexes) for indexes in mappings),
        original_fen_count=len(source),
    )
