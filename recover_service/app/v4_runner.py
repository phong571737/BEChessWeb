"""V4 transport and presentation adapter; the engine's algorithm is unchanged."""
import multiprocessing
import os
import queue
import signal
import threading
import time
from functools import lru_cache

import chess
import chess.engine
import chess.pgn

from recover_service_v4.api import _resolve_stockfish_path
from recover_service_v4.FEN_utils import infer_initial_move_sequence
from recover_service_v4.pipeline import run_pipeline
from recover_service_v4.stockfish_service import StockfishEvaluationError


class RecoveryError(RuntimeError):
    def __init__(self, code, status, detail):
        super().__init__(detail)
        self.code, self.status = code, status


_slots = threading.BoundedSemaphore(max(1, int(os.getenv("RECOVERY_CONCURRENCY", "2"))))


def prepare_history(history, start):
    if not 1 <= len(history) <= 500:
        raise ValueError("fenHistory must contain between 1 and 500 positions")
    start = (start or chess.STARTING_FEN).strip()
    chess.Board(start)
    fens, groups, leading = [start], [], []
    for index, fen in enumerate(history):
        chess.Board(fen)
        fen = fen.strip()
        if fen.split()[0] == fens[-1].split()[0]:
            (groups[-1] if groups else leading).append(index)
        else:
            fens.append(fen)
            groups.append([index])
    return fens, groups, leading


def build_line(path, padding, scores, fens, input_groups, headers, max_missing):
    board = chess.Board(fens[0])
    if path:
        piece = board.piece_at(chess.Move.from_uci(path[0]).from_square)
        if piece is None:
            raise ValueError("V4 path starts on an empty square")
        board.turn = piece.color  # Match V4's initial-turn normalization.
    initial = board.fen()
    game = chess.pgn.Game()
    game.setup(board)
    for key, value in (headers or {}).items():
        if key in {"Event", "Site", "Date", "Round", "White", "Black", "Result"}:
            game.headers[key] = str(value).replace("\n", " ").replace("\r", " ")
    node = game
    sans, replayed, movers = [], [], []
    for uci in path:
        move = chess.Move.from_uci(uci)
        if move not in board.legal_moves:
            raise ValueError("V4 returned an illegal path")
        movers.append("w" if board.turn else "b")
        sans.append(board.san(move))
        node = node.add_variation(move)
        board.push(move)
        replayed.append(board.fen())
    inferred = infer_initial_move_sequence(fens)
    padding_set = set(padding)

    @lru_cache(maxsize=None)
    def align(transition, offset):
        if transition == len(inferred):
            return () if offset == len(path) else None
        known = inferred[transition]
        for length in (range(1, max_missing + 2) if known == "X" else (1,)):
            end = offset + length
            if end > len(path):
                continue
            if known == "X":
                if not all(i in padding_set for i in range(offset, end)):
                    continue
                if replayed[end - 1].split()[0] != fens[transition + 1].split()[0]:
                    continue
            elif path[offset] != known or offset in padding_set:
                continue
            rest = align(transition + 1, end)
            if rest is not None:
                return (end - 1,) + rest
        return None

    endpoints = align(0, 0)
    if endpoints is None:
        raise ValueError("Cannot map V4 path to observations")
    endpoint_map = {ply: i for i, ply in enumerate(endpoints)}
    steps, sources = [], []
    for index, uci in enumerate(path):
        observation = endpoint_map.get(index)
        source = "padded" if observation is None else "assumed" if index in padding_set else "observed"
        sources.append(source)
        steps.append({"effectivePly": index + 1,
                      "originalPly": input_groups[observation][0] + 1 if observation is not None else None,
                      "synthetic": observation is None, "usedAssumption": source != "observed"})
    return {"uciMoves": path, "sanMoves": sans, "assumedFens": replayed,
            "moveSources": sources, "steps": steps, "startFen": initial,
            "pgn": game.accept(chess.pgn.StringExporter(headers=True, variations=False, comments=False)),
            "movetext": game.accept(chess.pgn.StringExporter(headers=False, variations=False, comments=False)),
            "paddingIndices": list(padding), "paddingScores": scores,
            "scoreSides": [movers[i] for i in padding]}


def build_response(ranked, fens, input_groups, leading, original_count, count, headers, max_missing, depth, limit):
    if sum(len(paths) for paths in ranked.values()) > limit:
        raise RecoveryError("RECOVERY_BRANCH_LIMIT", 422, "Recovery branch limit exceeded")
    lines, groups = [], []
    # Stable ties preserve engine order. Score vectors are compared only within a group.
    for number, (padding, paths) in enumerate(sorted(ranked.items(), key=lambda item: len(item[0]))):
        indices = []
        for rank, (path, scores) in enumerate(paths):
            line = build_line(path, padding, scores, fens[:count + 1], input_groups[:count], headers, max_missing)
            line.update(groupId=f"g{number}", rank=rank + 1)
            indices.append(len(lines))
            lines.append(line)
        groups.append({"id": f"g{number}", "paddingIndices": list(padding), "lineIndices": indices})
    covered = input_groups[count - 1][-1] + 1 if count else (leading[-1] + 1 if leading else 0)
    full = count == len(input_groups)
    best = lines[0]
    return {"schemaVersion": 4, "engineVersion": "recover_service_v4",
            "pgn": best["pgn"], "bestPgn": best["pgn"], "startFen": best["startFen"],
            "fullyRecovered": full, "failedPlies": list(range(covered + 1, original_count + 1)),
            "longestRecoveredPly": covered, "bestMoveLists": lines,
            "finalMoveLists": [line["uciMoves"] for line in lines],
            "steps": best["steps"], "recoveryGroups": groups,
            "preprocessing": {"originalFenCount": original_count, "processedFenCount": len(input_groups),
                              "processedToInputIndexes": input_groups, "leadingDuplicateIndexes": leading,
                              "removedDuplicateCount": original_count - len(input_groups)},
            "recovery": {"stockfishDepth": depth, "scorePerspective": "mover", "partialMode": "prefix",
                         "stopReason": "complete" if full else "no_complete_path"}}


def _worker(output, history, start, headers, missing, depth, limit):
    if os.name == "posix":
        os.setsid()
    try:
        fens, groups, leading = prepare_history(history, start)
        engine = _resolve_stockfish_path()
        def attempt(count):
            ranked = run_pipeline(fens[:count + 1], engine, missing, depth)
            if ranked:
                output.put(("candidate", build_response(ranked, fens, groups, leading, len(history),
                                                        count, headers, missing, depth, limit)))
                return True
            return False
        inferred = infer_initial_move_sequence(fens)
        prefix = next((i for i, move in enumerate(inferred) if move == "X"), len(groups))
        if 0 < prefix < len(groups):
            attempt(prefix)  # Keep a V4-validated prefix if the full attempt reaches its deadline.
        for count in range(len(groups), -1, -1):
            if attempt(count):
                break
        output.put(("done", None))
    except RecoveryError as exc:
        output.put(("error", (exc.code, exc.status, str(exc))))
    except (OSError, chess.engine.EngineError, StockfishEvaluationError):
        output.put(("error", ("RECOVERY_UNAVAILABLE", 503, "Stockfish is unavailable")))
    except ValueError as exc:
        output.put(("error", ("INVALID_RECOVERY_INPUT", 400, str(exc))))
    except Exception:
        output.put(("error", ("RECOVERY_INTERNAL_ERROR", 500, "V4 recovery failed")))


def run_recovery(history, start=None, headers=None, missing=2, depth=15, limit=10000, timeout_seconds=None):
    try:
        prepare_history(history, start)
    except (ValueError, TypeError, IndexError) as exc:
        raise RecoveryError("INVALID_RECOVERY_INPUT", 400, str(exc)) from exc
    if not _slots.acquire(blocking=False):
        raise RecoveryError("RECOVERY_UNAVAILABLE", 503, "Recovery service is busy")
    ctx = multiprocessing.get_context("spawn")
    output = ctx.Queue()
    process = ctx.Process(target=_worker, args=(output, history, start, headers, missing, depth, limit))
    candidate = None
    try:
        process.start()
        deadline = time.monotonic() + (timeout_seconds or float(os.getenv("RECOVERY_WORKER_TIMEOUT_SECONDS", "50")))
        while time.monotonic() < deadline:
            try:
                kind, value = output.get(timeout=min(0.25, max(0.001, deadline - time.monotonic())))
            except queue.Empty:
                if not process.is_alive():
                    raise RecoveryError("RECOVERY_UNAVAILABLE", 503, "Recovery worker exited unexpectedly")
                continue
            if kind == "candidate":
                if candidate is None or value["longestRecoveredPly"] >= candidate["longestRecoveredPly"]:
                    candidate = value
            elif kind == "done":
                return candidate
            else:
                raise RecoveryError(*value)
        if candidate is not None:
            candidate["recovery"]["stopReason"] = "timeout"
            return candidate
        raise RecoveryError("RECOVERY_TIMEOUT", 504, "Recovery exceeded its time budget")
    finally:
        if process.pid:
            if os.name == "posix":
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            elif process.is_alive():
                import subprocess
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True)
            process.join(timeout=2)
            if process.is_alive():
                process.kill()
                process.join(timeout=2)
        output.close()
        _slots.release()
