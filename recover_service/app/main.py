import logging

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from .runner import RecoveryError, run_recovery
from .schemas import RecoverRequest

app = FastAPI(title="FEN Recovery Service V4")
logger = logging.getLogger(__name__)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request, _exc):
    return JSONResponse(status_code=400, content={
        "detail": "Invalid recovery request", "code": "INVALID_RECOVERY_INPUT"})


@app.post("/recover")
def recover(req: RecoverRequest):
    try:
        return run_recovery(req.fenHistory, req.startFen, req.headers, req.maxMissingFens,
                            req.stockfishDepth, req.maxBranches)
    except RecoveryError as exc:
        return JSONResponse(status_code=exc.status, content={"detail": str(exc), "code": exc.code})
    except Exception:
        logger.exception("Recover Service V4 failed")
        return JSONResponse(status_code=500, content={
            "detail": "Recovery service failed", "code": "RECOVERY_INTERNAL_ERROR"})


@app.get("/health")
def health():
    return {"status": "ok", "engineVersion": "recover_service_v4"}
