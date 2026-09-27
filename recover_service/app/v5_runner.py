"""Bounded web adapter for the standalone V5 brute-force engine."""

import multiprocessing
import os
import queue
import signal
import sys
import threading
import time
from functools import lru_cache
from pathlib import Path

import chess
import chess.pgn

# V5 is also a standalone CLI/GUI project and uses sibling-module imports.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "recover_service_v5"))
from recover_service_v5.FEN_utils import compatible, infer_initial_move_sequence
from recover_service_v5.pipeline import run_pipeline


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
    for index, raw_fen in enumerate(history):
        fen = raw_fen.strip()
        chess.Board(fen)
        if fen.split()[0] == fens[-1].split()[0]:
            (groups[-1] if groups else leading).append(index)
        else:
            fens.append(fen)
            groups.append([index])
    return fens, groups, leading


def _segment(source, target, tokens):
    """Replay one observed transition, correcting only its recorded source turn."""
    if tokens == ["X"]:
        return [("X", target, "unresolved")]
    board = chess.Board(source)
    result = []
    for index, token in enumerate(tokens):
        try:
            move = chess.Move.from_uci(token)
        except ValueError:
            return None
        if index == 0:
            piece = board.piece_at(move.from_square)
            if piece is None:
                return None
            board.turn = piece.color
        if move not in board.legal_moves:
            return None
        san = board.san(move)
        board.push(move)
        result.append((san, board.fen(), "assumed" if len(tokens) > 1 else "observed"))
    if board.board_fen() != chess.Board(target).board_fen() and not compatible(board.fen(), target):
        return None
    return result


def _align(path, fens, max_missing):
    inferred = infer_initial_move_sequence(fens)

    @lru_cache(maxsize=None)
    def visit(transition, offset):
        if transition == len(inferred):
            return () if offset == len(path) else None
        known = inferred[transition]
        lengths = (1,) if known != "X" or path[offset:offset + 1] == ["X"] else range(1, max_missing + 2)
        for length in lengths:
            end = offset + length
            tokens = path[offset:end]
            if len(tokens) != length or (known != "X" and tokens != [known]):
                continue
            segment = _segment(fens[transition], fens[transition + 1], tokens)
            if segment is None:
                continue
            tail = visit(transition + 1, end)
            if tail is not None:
                return ((end, segment),) + tail
        return None

    return visit(0, 0)


def _make_pgn(start, headers, path):
    board = chess.Board(start)
    if path and path[0] != "X":
        first = chess.Move.from_uci(path[0])
        piece = board.piece_at(first.from_square)
        if piece is not None:
            board.turn = piece.color
    game = chess.pgn.Game()
    game.setup(board)
    for key, value in (headers or {}).items():
        if key in {"Event", "Site", "Date", "Round", "White", "Black", "Result"}:
            game.headers[key] = str(value).replace("\n", " ").replace("\r", " ")
    node = game
    count = 0
    for token in path:
        if token == "X":
            break
        move = chess.Move.from_uci(token)
        if move not in board.legal_moves:
            break
        node = node.add_variation(move)
        board.push(move)
        count += 1
    exporter = lambda with_headers: game.accept(chess.pgn.StringExporter(
        headers=with_headers, variations=False, comments=False))
    return exporter(True), exporter(False), count, game.board().fen()


def _build_response(path, fens, groups, leading, original_count, headers, missing):
    aligned = _align(path, fens, missing)
    if aligned is None:
        raise ValueError("V5 path cannot be aligned with observed FENs")
    san_moves, assumed_fens, sources, steps, unresolved = [], [], [], [], []
    padding = []
    offset = 0
    for transition, (end, segment) in enumerate(aligned):
        for local_index, (san, fen, source) in enumerate(segment):
            index = offset + local_index
            original_ply = groups[transition][0] + 1 if local_index == len(segment) - 1 else None
            san_moves.append(san)
            assumed_fens.append(fen)
            sources.append(source)
            steps.append({"effectivePly": index + 1, "originalPly": original_ply,
                          "synthetic": original_ply is None, "usedAssumption": source != "observed"})
            if source == "unresolved":
                unresolved.extend(input_index + 1 for input_index in groups[transition])
            elif source == "assumed":
                padding.append(index)
        offset = end
    pgn, movetext, pgn_count, initial = _make_pgn(fens[0], headers, path)
    full = not unresolved and pgn_count == len(path)
    first_failed = min(unresolved) if unresolved else original_count + 1
    covered = first_failed - 1 if unresolved else original_count
    line = {"uciMoves": path, "sanMoves": san_moves, "assumedFens": assumed_fens,
            "moveSources": sources, "steps": steps, "startFen": initial,
            "pgn": pgn, "movetext": movetext, "groupId": "v5", "rank": 1,
            "paddingIndices": padding, "paddingScores": [], "scoreSides": []}
    return {"schemaVersion": 5, "engineVersion": "recover_service_v5",
            "pgn": pgn, "bestPgn": pgn, "startFen": initial,
            "fullyRecovered": full, "failedPlies": unresolved,
            "longestRecoveredPly": covered, "bestMoveLists": [line],
            "finalMoveLists": [path], "steps": steps,
            "recoveryGroups": [{"id": "v5", "paddingIndices": padding, "lineIndices": [0]}],
            "preprocessing": {"originalFenCount": original_count,
                              "processedFenCount": len(groups),
                              "processedToInputIndexes": groups,
                              "leadingDuplicateIndexes": leading,
                              "removedDuplicateCount": original_count - len(groups)},
            "recovery": {"partialMode": "preserve_x", "pgnMode": "legal_prefix",
                         "stopReason": "complete" if full else "unresolved"}}


def _worker(output, history, start, headers, missing):
    if os.name == "posix":
        os.setsid()
    try:
        fens, groups, leading = prepare_history(history, start)
        result = run_pipeline(fens, max_missing_fens=missing)
        first = result["results"][0]["moves"] if result["results"] else None
        if first is None:
            output.put(("error", ("RECOVERY_REJECTED", 422, "V5 found no recovery path")))
        else:
            output.put(("result", _build_response(first, fens, groups, leading,
                                                   len(history), headers, missing)))
    except ValueError as exc:
        output.put(("error", ("INVALID_RECOVERY_INPUT", 400, str(exc))))
    except Exception:
        output.put(("error", ("RECOVERY_INTERNAL_ERROR", 500, "V5 recovery failed")))


def run_recovery(history, start=None, headers=None, missing=2, _depth=15, _limit=10000,
                 timeout_seconds=None):
    try:
        prepare_history(history, start)
    except (ValueError, TypeError, IndexError) as exc:
        raise RecoveryError("INVALID_RECOVERY_INPUT", 400, str(exc)) from exc
    if not _slots.acquire(blocking=False):
        raise RecoveryError("RECOVERY_UNAVAILABLE", 503, "Recovery service is busy")
    ctx = multiprocessing.get_context("spawn")
    output = ctx.Queue()
    process = ctx.Process(target=_worker, args=(output, history, start, headers, missing))
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
            if kind == "result":
                return value
            raise RecoveryError(*value)
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
