from pydantic import BaseModel, ConfigDict, Field


class EvaluateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fen: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Forsyth-Edwards Notation of the position to evaluate.",
        examples=[
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        ],
    )
    depth: int = Field(default=16, ge=1, le=22)


class RankedMove(BaseModel):
    rank: int
    move: str
    scoreCp: int | None
    mateIn: int | None


class EvaluateResponse(BaseModel):
    moves: list[RankedMove]
    depth: int
    sideToMove: str


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
