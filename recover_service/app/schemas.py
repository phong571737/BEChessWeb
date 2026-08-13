from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class RecoverRequest(BaseModel):
    fenHistory: List[str] = Field(..., description="List of FEN strings in chronological order")
    startFen: Optional[str] = Field(None, description="Optional start FEN")
    headers: Optional[Dict[str, str]] = Field(None, description="Optional PGN headers")
    maxBranches: Optional[int] = Field(None, description="Optional maximum number of branches")
    nRetry: int = Field(5, ge=0, description="Wildcard padding attempts per broken gap")
    deduplicatePositions: bool = Field(
        True,
        description="Collapse consecutive FENs with identical piece placement",
    )
    maxRepairGaps: int = Field(10, ge=0, description="Maximum repaired gaps")
    maxTotalPadding: int = Field(20, ge=0, description="Maximum synthetic FENs")
    finalOnly: Optional[bool] = Field(False, description="Return only final move lists")


class ErrorResponse(BaseModel):
    detail: str
