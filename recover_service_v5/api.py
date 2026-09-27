from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from pipeline import PipelineResult, run_pipeline


class RecoverRequest(BaseModel):
    fens: list[str] = Field(min_length=1, max_length=500)
    max_missing_fens: int = Field(default=2, ge=0, le=2)


class RankedPathResponse(BaseModel):
    moves: list[str]
    rank: int


class RecoverResponse(BaseModel):
    results: list[RankedPathResponse]


app = FastAPI(title="Chess FEN Recovery - Bruteforce", version="1.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/recover", response_model=RecoverResponse)
def recover(request: RecoverRequest) -> RecoverResponse:
    try:
        result: PipelineResult = run_pipeline(
            request.fens,
            max_missing_fens=request.max_missing_fens,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return RecoverResponse(**result)
