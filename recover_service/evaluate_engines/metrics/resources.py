from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class _Samples:
    cpu: list[float]
    rss_mb: list[float]
    gpu: list[float]
    vram_mb: list[float]


class ResourceSampler:
    def __init__(self, interval_seconds: float = 0.2) -> None:
        self.interval_seconds = interval_seconds
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._samples = _Samples([], [], [], [])
        self._psutil: Any = None
        self._process: Any = None
        self._children: dict[int, Any] = {}
        self._nvml: Any = None
        self._devices: list[Any] = []

    def start(self) -> None:
        try:
            import psutil

            self._psutil = psutil
            self._process = psutil.Process(os.getpid())
            self._process.cpu_percent(None)
            for child in self._process.children(recursive=True):
                child.cpu_percent(None)
                self._children[child.pid] = child
        except ImportError:
            pass
        try:
            import pynvml

            pynvml.nvmlInit()
            self._nvml = pynvml
            self._devices = [
                pynvml.nvmlDeviceGetHandleByIndex(index)
                for index in range(pynvml.nvmlDeviceGetCount())
            ]
        except Exception:
            self._nvml = None
            self._devices = []
        self._thread = threading.Thread(target=self._sample_loop, daemon=True)
        self._thread.start()

    def stop(self) -> dict[str, float | None]:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=max(1.0, self.interval_seconds * 2))
        if self._nvml is not None:
            try:
                self._nvml.nvmlShutdown()
            except Exception:
                pass
        return {
            "meanCpuPercent": _mean(self._samples.cpu),
            "peakRssMb": max(self._samples.rss_mb, default=None),
            "meanGpuPercent": _mean(self._samples.gpu),
            "peakVramMb": max(self._samples.vram_mb, default=None),
        }

    def _sample_loop(self) -> None:
        while not self._stop.is_set():
            if self._process is not None:
                try:
                    children = self._process.children(recursive=True)
                    for child in children:
                        if child.pid not in self._children:
                            child.cpu_percent(None)
                            self._children[child.pid] = child
                    cpu = self._process.cpu_percent(None)
                    rss = self._process.memory_info().rss / (1024 * 1024)
                    for child in children:
                        try:
                            cpu += child.cpu_percent(None)
                            rss += child.memory_info().rss / (1024 * 1024)
                        except Exception:
                            continue
                    self._samples.cpu.append(cpu)
                    self._samples.rss_mb.append(rss)
                except Exception:
                    pass
            for device in self._devices:
                try:
                    utilization = self._nvml.nvmlDeviceGetUtilizationRates(device)
                    memory = self._nvml.nvmlDeviceGetMemoryInfo(device)
                    self._samples.gpu.append(float(utilization.gpu))
                    self._samples.vram_mb.append(memory.used / (1024 * 1024))
                except Exception:
                    continue
            self._stop.wait(self.interval_seconds)


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None
