from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.evaluator import (
    AnalysisTimeoutError,
    EngineUnavailableError,
    Evaluation,
    QueueFullError,
    QueueWaitTimeoutError,
    StockfishService,
)
from app.schemas import ErrorResponse, EvaluateRequest, EvaluateResponse, RankedMove
from app.settings import Settings


logger = logging.getLogger(__name__)
engine_service: StockfishService | None = None


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message


def error_body(code: str, message: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code, "message": message}}


@asynccontextmanager
async def lifespan(_: FastAPI):
    global engine_service

    settings = Settings.from_env()
    engine_service = StockfishService(settings)
    await engine_service.start()
    try:
        yield
    finally:
        await engine_service.stop()
        engine_service = None


app = FastAPI(
    title="Stockfish Candidate Scoring API",
    version="2.0.0",
    lifespan=lifespan,
)


@app.exception_handler(ApiError)
async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(exc.code, exc.message),
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    _: Request, exc: RequestValidationError
) -> JSONResponse:
    first_error = exc.errors()[0] if exc.errors() else {}
    message = str(first_error.get("msg", "Invalid request"))
    return JSONResponse(
        status_code=422,
        content=error_body("INVALID_REQUEST", message),
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unexpected API error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content=error_body("INTERNAL_ERROR", "An unexpected error occurred"),
    )


@app.middleware("http")
async def limit_request_body(request: Request, call_next):
    limit = (
        engine_service.settings.max_request_body_bytes
        if engine_service is not None
        else 2048
    )
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > limit:
                return JSONResponse(
                    status_code=413,
                    content=error_body(
                        "REQUEST_TOO_LARGE",
                        f"Request body must not exceed {limit} bytes",
                    ),
                )
        except ValueError:
            return JSONResponse(
                status_code=400,
                content=error_body("INVALID_REQUEST", "Invalid Content-Length header"),
            )

    body = await request.body()
    if len(body) > limit:
        return JSONResponse(
            status_code=413,
            content=error_body(
                "REQUEST_TOO_LARGE",
                f"Request body must not exceed {limit} bytes",
            ),
        )
    return await call_next(request)


@app.get("/live")
async def live() -> dict[str, str]:
    return {"status": "live"}


@app.get("/ready")
async def ready() -> JSONResponse:
    if engine_service is not None and await engine_service.ready():
        return JSONResponse(status_code=200, content={"status": "ready"})
    return JSONResponse(
        status_code=503,
        content=error_body("ENGINE_NOT_READY", "Stockfish is not ready"),
    )


async def run_evaluation(request: EvaluateRequest) -> Evaluation:
    if engine_service is None:
        raise ApiError(503, "ENGINE_NOT_READY", "Stockfish is not ready")

    try:
        return await engine_service.evaluate(request.fen, request.depth)
    except ValueError as exc:
        raise ApiError(422, "INVALID_POSITION", str(exc)) from exc
    except QueueFullError as exc:
        raise ApiError(429, "QUEUE_FULL", "The analysis queue is full") from exc
    except QueueWaitTimeoutError as exc:
        raise ApiError(
            503,
            "QUEUE_WAIT_TIMEOUT",
            "Timed out waiting for the analysis engine",
        ) from exc
    except AnalysisTimeoutError as exc:
        raise ApiError(
            504,
            "ENGINE_TIMEOUT",
            "Stockfish analysis exceeded the allowed time",
        ) from exc
    except EngineUnavailableError as exc:
        raise ApiError(503, "ENGINE_NOT_READY", "Stockfish is not ready") from exc


ERROR_RESPONSES = {
    413: {"model": ErrorResponse, "description": "Request body is too large"},
    422: {"model": ErrorResponse, "description": "Invalid FEN, depth, or body"},
    429: {"model": ErrorResponse, "description": "Analysis queue is full"},
    503: {"model": ErrorResponse, "description": "Engine is unavailable"},
    504: {"model": ErrorResponse, "description": "Analysis timed out"},
}


@app.post(
    "/v2/evaluate",
    response_model=EvaluateResponse,
    responses=ERROR_RESPONSES,
)
async def evaluate_v2(request: EvaluateRequest) -> EvaluateResponse:
    evaluation = await run_evaluation(request)
    return EvaluateResponse(
        moves=[
            RankedMove(
                rank=rank,
                move=item.move,
                scoreCp=item.score_cp,
                mateIn=item.mate_in,
            )
            for rank, item in enumerate(evaluation.moves, start=1)
        ],
        depth=evaluation.depth,
        sideToMove=evaluation.side_to_move,
    )


@app.post(
    "/v1/evaluate",
    response_model=dict[str, int],
    responses=ERROR_RESPONSES,
    deprecated=True,
)
async def evaluate_v1(request: EvaluateRequest) -> dict[str, int]:
    """Compatibility endpoint. New clients should use /v2/evaluate."""
    evaluation = await run_evaluation(request)
    return {item.move: item.sort_score for item in evaluation.moves}
