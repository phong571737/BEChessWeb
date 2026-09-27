from __future__ import annotations

import os
import platform
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _env_int(name: str, default: int) -> int:
    raw_value = os.getenv(name, str(default))
    try:
        return int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer; received {raw_value!r}") from exc


def _env_float(name: str, default: float) -> float:
    raw_value = os.getenv(name, str(default))
    try:
        return float(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number; received {raw_value!r}") from exc


def _default_stockfish_path() -> Path:
    binary = (
        "stockfish-windows-x86-64-avx2.exe"
        if platform.system() == "Windows"
        else "stockfish-ubuntu-x86-64-sse41-popcnt"
    )
    return PROJECT_ROOT / "stockfish" / binary


@dataclass(frozen=True)
class Settings:
    stockfish_path: Path
    stockfish_threads: int
    stockfish_hash_mb: int
    analysis_timeout_seconds: float
    engine_stop_grace_seconds: float
    startup_timeout_seconds: float
    readiness_timeout_seconds: float
    queue_wait_timeout_seconds: float
    max_depth: int
    queue_size: int
    max_request_body_bytes: int

    @classmethod
    def from_env(cls) -> "Settings":
        configured_path = os.getenv("STOCKFISH_PATH")
        stockfish_path = (
            Path(configured_path).expanduser().resolve()
            if configured_path
            else _default_stockfish_path()
        )
        settings = cls(
            stockfish_path=stockfish_path,
            stockfish_threads=_env_int("STOCKFISH_THREADS", 2),
            stockfish_hash_mb=_env_int("STOCKFISH_HASH_MB", 128),
            analysis_timeout_seconds=_env_float("ANALYSIS_TIMEOUT_SECONDS", 3.0),
            engine_stop_grace_seconds=_env_float("ENGINE_STOP_GRACE_SECONDS", 1.0),
            startup_timeout_seconds=_env_float("STARTUP_TIMEOUT_SECONDS", 10.0),
            readiness_timeout_seconds=_env_float("READINESS_TIMEOUT_SECONDS", 1.0),
            queue_wait_timeout_seconds=_env_float("QUEUE_WAIT_TIMEOUT_SECONDS", 5.0),
            max_depth=_env_int("MAX_DEPTH", 20),
            queue_size=_env_int("QUEUE_SIZE", 8),
            max_request_body_bytes=_env_int("MAX_REQUEST_BODY_BYTES", 2048),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        cpu_count = os.cpu_count() or 1
        if not 1 <= self.stockfish_threads <= cpu_count:
            raise ValueError(
                f"STOCKFISH_THREADS must be between 1 and available CPUs ({cpu_count})"
            )
        if not 16 <= self.stockfish_hash_mb <= 512:
            raise ValueError("STOCKFISH_HASH_MB must be between 16 and 512")
        if not 1 <= self.max_depth <= 22:
            raise ValueError("MAX_DEPTH must be between 1 and 22")
        if not 0 <= self.queue_size <= 10:
            raise ValueError("QUEUE_SIZE must be between 0 and 10")
        if not 512 <= self.max_request_body_bytes <= 16_384:
            raise ValueError("MAX_REQUEST_BODY_BYTES must be between 512 and 16384")

        positive_values = {
            "ANALYSIS_TIMEOUT_SECONDS": self.analysis_timeout_seconds,
            "ENGINE_STOP_GRACE_SECONDS": self.engine_stop_grace_seconds,
            "STARTUP_TIMEOUT_SECONDS": self.startup_timeout_seconds,
            "READINESS_TIMEOUT_SECONDS": self.readiness_timeout_seconds,
            "QUEUE_WAIT_TIMEOUT_SECONDS": self.queue_wait_timeout_seconds,
        }
        for name, value in positive_values.items():
            if value <= 0:
                raise ValueError(f"{name} must be greater than 0")

        if not self.stockfish_path.is_file():
            raise ValueError(
                f"STOCKFISH_PATH does not point to a file: {self.stockfish_path}"
            )
        if platform.system() != "Windows" and not os.access(self.stockfish_path, os.X_OK):
            raise ValueError(
                f"STOCKFISH_PATH is not executable: {self.stockfish_path}"
            )
