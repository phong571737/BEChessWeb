from __future__ import annotations

from typing import Any, Dict, Mapping, Optional

from fastapi import HTTPException

from recover_service.service import recovery


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
    try:
        result = recovery.recover_fens(
            fen_history,
            start_fen=start_fen or recovery.chess.STARTING_FEN,
            headers=headers,
            max_branches=max_branches,
            n_retry=n_retry,
            deduplicate_positions=deduplicate_positions,
            max_repair_gaps=max_repair_gaps,
            max_total_padding=max_total_padding,
        )
        return result.to_dict(include_steps=not final_only)
    except recovery.FenConversionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except recovery.RecoveryLimitError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # pragma: no cover - unexpected
        raise HTTPException(status_code=500, detail=str(exc))
