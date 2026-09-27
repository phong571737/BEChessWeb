from dataclasses import dataclass, field
from typing import TypeAlias

FEN: TypeAlias = str
Move: TypeAlias = str
Square: TypeAlias = str | None
Board: TypeAlias = list[Square]

@dataclass
class SingleSequence:
    start_fen: FEN
    move_list: list[Move]
    viewed_fen_list: list[FEN]
    parent_paths: list[list[Move]] = field(default_factory=lambda: [[]])

@dataclass
class StateNode:
    fen: FEN
    paths: list[list[Move]] = field(default_factory=list)

