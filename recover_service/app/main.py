from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware  # Thêm dòng này

from .schemas import RecoverRequest
from .runner import run_recovery

app = FastAPI(title="FEN Recovery Service")

# BỔ SUNG ĐOẠN NÀY ĐỂ CHO PHÉP FRONTEND GỌI API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Trong thực tế nên để domain cụ thể, nhưng local test thì "*" là được
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/recover")
def recover(req: RecoverRequest):
    return run_recovery(
        req.fenHistory,
        start_fen=req.startFen,
        headers=req.headers,
        max_branches=req.maxBranches,
        n_retry=req.nRetry,
        deduplicate_positions=req.deduplicatePositions,
        max_repair_gaps=req.maxRepairGaps,
        max_total_padding=req.maxTotalPadding,
        final_only=bool(req.finalOnly),
    )
