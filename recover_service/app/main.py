from __future__ import annotations

from fastapi import FastAPI

from .schemas import RecoverRequest
from .runner import run_recovery

app = FastAPI(title="FEN Recovery Service")


@app.post("/recover")
def recover(req: RecoverRequest):
    return run_recovery(
        req.fenHistory,
        start_fen=req.startFen,
        headers=req.headers,
        max_branches=req.maxBranches,
        final_only=bool(req.finalOnly),
    )
