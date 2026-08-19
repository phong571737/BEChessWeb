from __future__ import annotations

from typing import Any, Dict, Mapping, Optional

import chess

from recover_service.service.fen_to_pgn import FenConversionError
from recover_service_v2.recovery import recover as recover_v2


class InvalidRecoveryInputError(ValueError):
    pass


class RecoveryLimitError(RuntimeError):
    pass


def run_recovery(
    fen_history: list[str],
    *,
    start_fen: Optional[str] = None,
    headers: Optional[Mapping[str, str]] = None,
    max_branches: Optional[int] = None,
    n_retry: int = 5,
    deduplicate_positions: bool = True,
    max_repair_gaps: int = 10,
    max_total_padding: int = 20,
    final_only: bool = False,
) -> Dict[str, Any]:
    del headers, n_retry, deduplicate_positions, max_repair_gaps, max_total_padding, final_only

    if not 1 <= len(fen_history) <= 500:
        raise InvalidRecoveryInputError(
            "fenHistory must contain between 1 and 500 FEN positions"
        )

    clean_history = [str(fen).strip() for fen in fen_history]
    if any(not fen or not fen.split()[0] for fen in clean_history):
        raise InvalidRecoveryInputError(
            "fenHistory must contain between 1 and 500 FEN positions"
        )

    try:
        result = recover_v2(clean_history, (start_fen or chess.STARTING_FEN).strip())
    except (FenConversionError, ValueError, IndexError) as exc:
        raise InvalidRecoveryInputError(str(exc)) from exc

    final_lists = result.get("final_move_lists")
    branch_count = len(final_lists) if isinstance(final_lists, list) else 0
    if max_branches is not None and max_branches > 0 and branch_count > max_branches:
        raise RecoveryLimitError(
            f"Recovery produced more than {max_branches} compatible branches"
        )

    return result
