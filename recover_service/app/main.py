from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .runner import InvalidRecoveryInputError, RecoveryLimitError, run_recovery
from .schemas import RecoverRequest


app = FastAPI(title="FEN Recovery Service V3")
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request, _exc: RequestValidationError):
    return JSONResponse(
        status_code=400,
        content={
            "detail": "fenHistory must contain between 1 and 500 FEN positions",
            "code": "INVALID_RECOVERY_INPUT",
        },
    )


@app.post("/recover")
def recover(req: RecoverRequest):
    try:
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
            clean_extra_piece_noise=req.cleanExtraPieceNoise,
            max_new_noise_per_transition=req.maxNewNoisePerTransition,
            max_total_masked_squares=req.maxTotalMaskedSquares,
        )
    except InvalidRecoveryInputError as exc:
        return JSONResponse(
            status_code=400,
            content={"detail": str(exc), "code": "INVALID_RECOVERY_INPUT"},
        )
    except RecoveryLimitError as exc:
        return JSONResponse(
            status_code=422,
            content={"detail": str(exc), "code": "RECOVERY_BRANCH_LIMIT"},
        )
    except Exception:
        logger.exception("Recover Service V3 failed")
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Recovery service failed",
                "code": "RECOVERY_INTERNAL_ERROR",
            },
        )


@app.get("/health")
def health():
    return {"status": "ok", "engineVersion": "recover_service_v3"}
