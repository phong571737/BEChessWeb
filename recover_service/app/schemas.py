from pydantic import BaseModel, Field


class RecoverRequest(BaseModel):
    fenHistory: list[str] = Field(min_length=1, max_length=500)
    startFen: str | None = None
    headers: dict[str, str] | None = None
    maxBranches: int = Field(default=10000, ge=1, le=10000)
    maxMissingFens: int = Field(default=2, ge=0, le=2)
    # Accepted for older callers; V5 does not evaluate moves with Stockfish.
    stockfishDepth: int = Field(default=15, ge=1, le=20)
