import os
import shutil
from pathlib import Path

import chess.engine
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .pipeline import run_pipeline
from .stockfish_service import RankedGroups, StockfishEvaluationError


class RecoverRequest(BaseModel):
    fens: list[str] = Field(min_length=2, max_length=500)
    max_missing_fens: int = Field(default=2, ge=0, le=2)
    stockfish_depth: int = Field(default=15, ge=1, le=20)


class RankedPathResponse(BaseModel):
    moves: list[str]
    padding_scores: list[int]


class RankedGroupResponse(BaseModel):
    padding_indices: list[int]
    ranked_paths: list[RankedPathResponse]


class RecoverResponse(BaseModel):
    groups: list[RankedGroupResponse]


class HealthResponse(BaseModel):
    status: str


app = FastAPI(
    title="Chess FEN Recovery API",
    version="1.0.0",
)


def _resolve_stockfish_path() -> str:
    configured_path = os.environ.get("STOCKFISH_PATH")
    if configured_path:
        return configured_path

    executable_on_path = shutil.which("stockfish")
    if executable_on_path:
        return executable_on_path

    project_dir = Path(__file__).resolve().parent
    bundled_names = (
        ("stockfish-windows-x86-64-avx2.exe",)
        if os.name == "nt"
        else ("stockfish-ubuntu-x86-64-sse41-popcnt",)
    )
    for executable_name in bundled_names:
        bundled_path = project_dir / "stockfish" / executable_name
        if bundled_path.is_file():
            return str(bundled_path)

    raise FileNotFoundError("Stockfish executable was not found")


def _to_response(ranked_groups: RankedGroups) -> RecoverResponse:
    return RecoverResponse(
        groups=[
            RankedGroupResponse(
                padding_indices=list(padding_indices),
                ranked_paths=[
                    RankedPathResponse(
                        moves=moves,
                        padding_scores=padding_scores,
                    )
                    for moves, padding_scores in ranked_paths
                ],
            )
            for padding_indices, ranked_paths in ranked_groups.items()
        ]
    )


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.post("/v1/recover", response_model=RecoverResponse)
def recover(request: RecoverRequest) -> RecoverResponse:
    try:
        stockfish_path = _resolve_stockfish_path()
        ranked_groups = run_pipeline(
            raw_fens=request.fens,
            stockfish_path=stockfish_path,
            max_missing_fens=request.max_missing_fens,
            stockfish_depth=request.stockfish_depth,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (
        OSError,
        chess.engine.EngineError,
        StockfishEvaluationError,
    ) as exc:
        raise HTTPException(
            status_code=503,
            detail="Stockfish is unavailable",
        ) from exc

    return _to_response(ranked_groups)
