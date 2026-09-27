from __future__ import annotations

import asyncio
from dataclasses import dataclass

import chess
import chess.engine

from app.settings import Settings


class QueueFullError(Exception):
    pass


class QueueWaitTimeoutError(Exception):
    pass


class AnalysisTimeoutError(Exception):
    pass


class EngineUnavailableError(Exception):
    pass


@dataclass(frozen=True)
class ScoredMove:
    move: str
    score_cp: int | None
    mate_in: int | None
    sort_score: int


@dataclass(frozen=True)
class Evaluation:
    moves: list[ScoredMove]
    depth: int
    side_to_move: str


class StockfishService:
    """Serializes access to one engine and bounds the number of waiting calls."""

    MATE_SORT_SCORE = 100_000

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._transport: asyncio.SubprocessTransport | None = None
        self._engine: chess.engine.UciProtocol | None = None
        self._engine_lock = asyncio.Lock()
        self._pending_lock = asyncio.Lock()
        self._pending = 0
        self._ready = False

    async def start(self) -> None:
        async with self._engine_lock:
            await self._start_locked()

    async def stop(self) -> None:
        async with self._engine_lock:
            await self._stop_locked()

    async def _start_locked(self) -> None:
        self._ready = False
        try:
            transport, engine = await asyncio.wait_for(
                chess.engine.popen_uci(str(self.settings.stockfish_path)),
                timeout=self.settings.startup_timeout_seconds,
            )
            await engine.configure(
                {
                    "Threads": self.settings.stockfish_threads,
                    "Hash": self.settings.stockfish_hash_mb,
                }
            )
            await asyncio.wait_for(
                engine.ping(),
                timeout=self.settings.readiness_timeout_seconds,
            )
        except Exception:
            if "transport" in locals():
                transport.close()
            self._transport = None
            self._engine = None
            raise

        self._transport = transport
        self._engine = engine
        self._ready = True

    async def _stop_locked(self) -> None:
        self._ready = False
        engine = self._engine
        transport = self._transport
        self._engine = None
        self._transport = None

        if engine is not None:
            try:
                await asyncio.wait_for(
                    engine.quit(),
                    timeout=self.settings.engine_stop_grace_seconds,
                )
            except Exception:
                if transport is not None:
                    transport.close()
        elif transport is not None:
            transport.close()

    async def _restart_locked(self) -> None:
        await self._stop_locked()
        await self._start_locked()

    async def _reserve_capacity(self) -> None:
        async with self._pending_lock:
            # One active analysis plus a bounded number waiting for the engine.
            if self._pending >= self.settings.queue_size + 1:
                raise QueueFullError
            self._pending += 1

    async def _release_capacity(self) -> None:
        async with self._pending_lock:
            self._pending -= 1

    async def ready(self) -> bool:
        # Sending ping while analysing would interrupt the active UCI command.
        if self._engine_lock.locked():
            return self._ready and self._engine is not None

        try:
            await asyncio.wait_for(
                self._engine_lock.acquire(),
                timeout=self.settings.readiness_timeout_seconds,
            )
        except TimeoutError:
            return False

        try:
            if not self._ready or self._engine is None:
                try:
                    await self._restart_locked()
                    return True
                except Exception:
                    return False
            await asyncio.wait_for(
                self._engine.ping(),
                timeout=self.settings.readiness_timeout_seconds,
            )
            self._ready = True
            return True
        except Exception:
            self._ready = False
            try:
                await self._restart_locked()
                return True
            except Exception:
                return False
        finally:
            self._engine_lock.release()

    async def evaluate(self, fen: str, requested_depth: int) -> Evaluation:
        try:
            board = chess.Board(fen)
        except ValueError as exc:
            raise ValueError(f"Invalid FEN: {exc}") from exc

        if not board.is_valid():
            raise ValueError("FEN describes an invalid chess position")
        if requested_depth > self.settings.max_depth:
            raise ValueError(
                f"depth must be at most {self.settings.max_depth} for this service"
            )

        candidates = list(board.legal_moves)
        side_to_move = "white" if board.turn == chess.WHITE else "black"
        if not candidates:
            return Evaluation([], 0, side_to_move)

        await self._reserve_capacity()
        acquired = False
        try:
            try:
                await asyncio.wait_for(
                    self._engine_lock.acquire(),
                    timeout=self.settings.queue_wait_timeout_seconds,
                )
                acquired = True
            except TimeoutError as exc:
                raise QueueWaitTimeoutError from exc

            if not self._ready or self._engine is None:
                try:
                    await self._restart_locked()
                except Exception as exc:
                    raise EngineUnavailableError from exc

            try:
                analysis_task = asyncio.create_task(
                    self._engine.analyse(
                        board,
                        chess.engine.Limit(
                            depth=requested_depth,
                            time=self.settings.analysis_timeout_seconds,
                        ),
                        root_moves=candidates,
                        multipv=len(candidates),
                        info=chess.engine.INFO_SCORE | chess.engine.INFO_PV,
                    )
                )
                done, _ = await asyncio.wait(
                    {analysis_task},
                    timeout=(
                        self.settings.analysis_timeout_seconds
                        + self.settings.engine_stop_grace_seconds
                    ),
                )
                if not done:
                    self._ready = False
                    analysis_task.cancel()
                    if self._transport is not None:
                        # Forcefully terminate a UCI process that ignored stop.
                        self._transport.close()
                    try:
                        await asyncio.wait_for(
                            asyncio.gather(analysis_task, return_exceptions=True),
                            timeout=self.settings.engine_stop_grace_seconds,
                        )
                    except TimeoutError:
                        pass
                    try:
                        await self._restart_locked()
                    except Exception:
                        pass
                    raise AnalysisTimeoutError
                analyses = analysis_task.result()
            except (chess.engine.EngineError, chess.engine.EngineTerminatedError) as exc:
                self._ready = False
                try:
                    await self._restart_locked()
                except Exception:
                    pass
                raise EngineUnavailableError from exc

            scored_moves: list[ScoredMove] = []
            reached_depths: list[int] = []
            for analysis in analyses:
                pv = analysis.get("pv")
                pov_score = analysis.get("score")
                if not pv or pov_score is None:
                    continue

                score = pov_score.pov(board.turn)
                sort_score = score.score(mate_score=self.MATE_SORT_SCORE)
                if sort_score is None:
                    continue

                scored_moves.append(
                    ScoredMove(
                        move=pv[0].uci(),
                        score_cp=score.score(),
                        mate_in=score.mate(),
                        sort_score=sort_score,
                    )
                )
                if isinstance(analysis.get("depth"), int):
                    reached_depths.append(analysis["depth"])

            scored_moves.sort(key=lambda item: (-item.sort_score, item.move))
            reached_depth = min(reached_depths) if reached_depths else 0
            return Evaluation(scored_moves, reached_depth, side_to_move)
        finally:
            if acquired:
                self._engine_lock.release()
            await self._release_capacity()
