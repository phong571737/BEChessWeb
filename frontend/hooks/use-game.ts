import { useSocket } from "@/components/providers/socket-provider";
import { fetchJSONCached, FetchNotFoundError, invalidateFetchCache } from "@/lib/fetch-cache";
import { useGameStore } from "@/lib/store";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Chess } from "chess.js"
import { CLIENT_EVENT, SERVER_EVENT, SOCKET_CONSTANTS } from "@/lib/constants/socket";
import { GAME_STATUS } from "@/lib/constants/game";
import { Branch } from "@/types/game.types";
import { extractSanMoves } from "@/lib/custom-chess";
import { apiFetch } from "@/lib/api-fetch";

export interface boardAlert {
    code: string;
    detail: string;
}

export function useGame(gameID: string) {
    const { patchBoard, boards, patchPhysicalBoard } = useGameStore();
    const socket = useSocket();
    const chessRef = useRef<Chess>(new Chess());
    const initialMoveCountRef = useRef<number>(0);
    const sessionTs = useRef<number[]>([]);
    const resignRequestRef = useRef(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [moveTimesMap, setMoveTimesMap] = useState<Record<number, number>>({});
    const [loadError, setLoadError] = useState<"not-found" | "error" | null>(null);

    const cachedBoard = boards[gameID];
    const resetRevision = cachedBoard?.resetRevision;

    // ------- Branch state ----------------------------------------
    const mainPgnAtBranchRef = useRef<string>("");
    const selectedBranchIdRef = useRef<string | null>(null);

    const applyBranches = useCallback((incomingBranches: Branch[], currentPgn: string) => {
        if (!incomingBranches.length) {
            patchBoard(gameID, { branches: [], selectedBranchId: null });
            return;
        }
        try {
            const main = new Chess();
            main.loadPgn(currentPgn);
            const mainHist = main.history();

            const b = new Chess();
            b.loadPgn(incomingBranches[0].pgn);
            const bHist = b.history();

            let splitAt = mainHist.length;
            for (let i = 0; i < Math.min(mainHist.length, bHist.length); i++) {
                if (mainHist[i] !== bHist[i]) { splitAt = i; break; }
            }

            const tmp = new Chess();
            for (let i = 0; i < splitAt; i++) tmp.move(mainHist[i]);
            mainPgnAtBranchRef.current = tmp.pgn();
        } catch {
            mainPgnAtBranchRef.current = currentPgn;
        }

        patchBoard(gameID, { branches: incomingBranches });
    }, [gameID, patchBoard]);

    // ------- Move timing -----------------------------
    const storageKey = `chess:moveAt:${gameID}`;
    const [lastMoveAt, setLastMoveAt] = useState<number>(() => {
        try {
            const stored = sessionStorage.getItem(storageKey);
            if (stored) return Number(stored);
        } catch { }
        return Date.now();
    });

    useEffect(() => {
        if (!socket || !gameID) return;
        const join = () => {
            socket.emit("join", { gameID });
            socket.emit("request_clock_state", { gameID });
        };
        join();
        socket.on("connect", join);
        // Periodically replace the local interpolation with a fresh server
        // snapshot. This keeps long-running and newly opened clients aligned
        // without continuously writing the clock to MongoDB.
        const clockSyncInterval = window.setInterval(() => {
            if (socket.connected) socket.emit("request_clock_state", { gameID });
        }, 15_000);

        return () => {
            window.clearInterval(clockSyncInterval);
            socket.off("connect", join);
        };
    }, [socket, gameID]);

    // ------ Load initial game from REST API -------------------------------
    useEffect(() => {
        if (!gameID) return;
        setIsLoaded(false);
        setLoadError(null);
        let cancelled = false;
        const controller = new AbortController();

        fetchJSONCached<any>(`/games/${gameID}`, 1_500, { signal: controller.signal })
            .then((game) => {
                try {
                    // if (game.pgn) chessRef.current.loadPgn(game.pgn);
                    if (game.fen) {
                        try {
                            chessRef.current.load(game.fen);
                        } catch {
                            if (game.pgn) chessRef.current.loadPgn(game.pgn);
                        }
                    } else if (game.pgn) {
                        chessRef.current.loadPgn(game.pgn);
                    }
                } catch { }
                initialMoveCountRef.current = chessRef.current.history().length;

                const storedTs = (() => {
                    try {
                        return Number(sessionStorage.getItem(storageKey) || 0)
                    } catch {
                        return 0;
                    }
                });

                sessionTs.current = [];

                if (Array.isArray(game.branches) && game.branches.length > 0) {
                    applyBranches(game.branches, game.pgn || "");

                    try {
                        const savedBranchId = sessionStorage.getItem(`chess:branch:${gameID}`);
                        if (savedBranchId && game.branches.some((b: Branch) => b.id === savedBranchId)) {
                            patchBoard(gameID, { selectedBranchId: savedBranchId });
                        }
                    } catch { }
                }

                let boardStatus;
                if (game.status === GAME_STATUS.FINISHED) boardStatus = GAME_STATUS.ENDED;

                patchBoard(gameID, {
                    fen: game.fen || chessRef.current.fen(),
                    initialFen: game.initialFen,
                    fenHistory: Array.isArray(game.fenHistory) ? game.fenHistory : [],
                    whiteName: game.whiteName || "White",
                    blackName: game.blackName || "Black",
                    pgn: game.pgn || "",
                    status: boardStatus,
                    lastMove: game.lastMove || null,
                    result: game.result ?? undefined,
                    // Older documents stored clock values in seconds. Convert them once
                    // at the API boundary; all live clock state is milliseconds.
                    initialTimeMs: game.initialTimeMs ?? (Number.isFinite(game.clockSeconds) ? game.clockSeconds * 1_000 : undefined),
                    incrementMs: game.incrementMs ?? (Number.isFinite(game.clockIncrement) ? game.clockIncrement * 1_000 : undefined),
                    round: game.round ?? 1,
                    boardNumber: game.boardNumber ?? "",
                    location: game.location ?? "",
                    whiteRemainingMs: game.whiteRemainingMs,
                    blackRemainingMs: game.blackRemainingMs,
                    activeClockSide: game.activeClockSide,
                    clockStartedAt: game.clockStartedAt ?? null,
                    serverNow: game.serverNow,
                })
                setIsLoaded(true);
            })
            .catch((err) => {
                if (cancelled) return;
                if (err instanceof FetchNotFoundError) {
                    setLoadError("not-found");
                } else {
                    setLoadError("error");
                }
                setIsLoaded(false);
            });

        return () => {
            cancelled = true;
            controller.abort();
        }
    }, [applyBranches, gameID, patchBoard, storageKey]);

    // ---------------Polling initial check state ----------------------------
    useEffect(() => {
        if (!gameID || !isLoaded) return;

        let stopped = false;
        let inFlight = false;
        const controller = new AbortController();
        let interval: ReturnType<typeof setInterval> | undefined;

        const fetchInitCheck = async () => {
            if (stopped || inFlight) return;
            inFlight = true;
            try {
                const res = await fetch(`/games/${gameID}/initcheck`, { signal: controller.signal });

                if (!res.ok) return;
                const data = await res.json();

                const initStatus = data.status === "checkinit" ? GAME_STATUS.CHECK_INIT : data.status;
                patchBoard(gameID, {
                    initStatus,
                    buttonReady: data.buttonReady === true,
                    missingSquares: data.missingSquares || [],
                    extraSquares: data.extraSquares || [],
                    wrongPieceSquares: data.wrongPieceSquares || [],
                })
                // stop polling when board is ready
                if (data.status === GAME_STATUS.READY) {
                    stopped = true;
                    if (interval) clearInterval(interval);
                }
            } catch {
                // Polling failures are transient and will be retried on the next interval.
            } finally {
                inFlight = false;
            }
        };

        void fetchInitCheck();
        interval = setInterval(() => {
            if (!stopped) {
                void fetchInitCheck();
            }
        }, 1000);
        return () => {
            stopped = true;
            controller.abort();
            if (interval) clearInterval(interval);
        };
    }, [gameID, isLoaded, resetRevision]);

    const applyGameReset = useCallback((data: { resetAt?: number; boardID?: string; initialTimeMs?: number; incrementMs?: number; whiteRemainingMs?: number; blackRemainingMs?: number } = {}) => {
        const resetAt = data.resetAt ?? Date.now();
        chessRef.current.reset();
        initialMoveCountRef.current = 0;
        sessionTs.current = [];
        mainPgnAtBranchRef.current = "";
        selectedBranchIdRef.current = null;
        setMoveTimesMap({});
        setLastMoveAt(resetAt);
        try {
            sessionStorage.removeItem(storageKey);
            sessionStorage.removeItem(`chess:clock:${gameID}`);
            sessionStorage.removeItem(`chess:branch:${gameID}`);
        } catch {
            // Browser storage can be unavailable; the in-memory reset is still authoritative.
        }
        patchBoard(gameID, {
            fen: chessRef.current.fen(),
            initialFen: chessRef.current.fen(),
            fenHistory: [],
            pgn: "",
            lastMove: null,
            result: undefined,
            status: GAME_STATUS.WAITING,
            branches: [],
            selectedBranchId: null,
            initStatus: GAME_STATUS.CHECK_INIT,
            buttonReady: false,
            missingSquares: [],
            extraSquares: [],
            wrongPieceSquares: [],
            ...(data.initialTimeMs !== undefined ? { initialTimeMs: data.initialTimeMs } : {}),
            ...(data.incrementMs !== undefined ? { incrementMs: data.incrementMs } : {}),
            ...(data.whiteRemainingMs !== undefined ? { whiteRemainingMs: data.whiteRemainingMs } : { whiteRemainingMs: data.initialTimeMs ?? cachedBoard?.initialTimeMs }),
            ...(data.blackRemainingMs !== undefined ? { blackRemainingMs: data.blackRemainingMs } : { blackRemainingMs: data.initialTimeMs ?? cachedBoard?.initialTimeMs }),
            activeClockSide: "white",
            clockStartedAt: null,
            serverNow: resetAt,
            resetRevision: resetAt,
        });
        if (data.boardID) {
            patchPhysicalBoard({ boardID: data.boardID, gameID, gameStatus: "waiting", online: true });
        }
    }, [cachedBoard?.initialTimeMs, gameID, patchBoard, patchPhysicalBoard, storageKey]);

    // ---- Game socket listeners (after load) -------------------------------
    useEffect(() => {
        if (!socket || !gameID || !isLoaded) return;

        // onMove event 
        const onMove = (data: any) => {
            if (data.gameID !== gameID) return;

            // if (data.isError) {
            //     try {
            //         chessRef.current.load(data.fen);
            //     } catch { }

            //     patchBoard(gameID, {
            //         fen: data.fen,
            //         pgn: chessRef.current.pgn(),
            //         lastMove: null,
            //         errorSquares: data.departures
            //             ? data.departures.split(",").map((s: string) => s.trim())
            //             : [],
            //     });

            //     return
            // }

            const incomingBranches: Branch[] = data.branches ?? [];
            const newPgn = data.pgn || chessRef.current.pgn();

            try {
                // if (data.pgn) chessRef.current.loadPgn(data.pgn);
                if (data.fen) chessRef.current.load(data.fen);
            } catch { }

            if (incomingBranches.length > 0) {
                try {
                    const main = new Chess();
                    main.loadPgn(newPgn);
                    const mainHist = main.history();
                    const b = new Chess();
                    b.loadPgn(incomingBranches[0].pgn);
                    const bHist = b.history();
                    let splitAt = mainHist.length;
                    for (let i = 0; i < Math.min(mainHist.length, bHist.length); i++) {
                        if (mainHist[i] !== bHist[i]) { splitAt = i; break; }
                    }
                    const tmp = new Chess();
                    for (let i = 0; i < splitAt; i++) tmp.move(mainHist[i]);
                    mainPgnAtBranchRef.current = tmp.pgn();
                } catch {
                    mainPgnAtBranchRef.current = newPgn;
                }
            } else {
                mainPgnAtBranchRef.current = "";
                // patchBoard(gameID, { branches: [], selectedBranchId: null });
            }

            const currentSelectedId = selectedBranchIdRef.current;
            const preserveSelection = currentSelectedId && incomingBranches.some(b => b.id === currentSelectedId);

            patchBoard(gameID, {
                fen: data.fen || chessRef.current.fen(),
                fenHistory: Array.isArray(data.fenHistory)
                    ? data.fenHistory
                    : (() => {
                        const current = useGameStore.getState().boards[gameID]?.fenHistory ?? [];
                        const nextFen = typeof data.fen === "string" ? data.fen.trim() : "";
                        return nextFen && current.at(-1) !== nextFen ? [...current, nextFen] : current;
                    })(),
                pgn: data.pgn || chessRef.current.pgn(),
                lastMove: data.lastMove || null,
                // branches: incomingBranches ?? board?.branches ?? [],
                branches: incomingBranches,
                selectedBranchId: preserveSelection ? currentSelectedId : null,
            });
        }

        const onEval = (data: any) => {
            if (data.gameID !== gameID) return;
            patchBoard(gameID, { cp: data.cp });
        };

        const onClockState = (data: any) => {
            if (!data || data.gameID !== gameID) return;
            const clockPatch: Record<string, unknown> = {
                whiteRemainingMs: Number(data.whiteRemainingMs),
                blackRemainingMs: Number(data.blackRemainingMs),
                activeClockSide: data.activeClockSide === "black" ? "black" : "white",
                clockStartedAt: data.clockStartedAt ?? null,
                serverNow: Number.isFinite(data.serverNow) ? data.serverNow : Date.now(),
            };

            // The ESP32 FEN is authoritative for the side to move.  A clock
            // event can arrive without an esp_move event (for example after a
            // reconnect), so hydrate the board and Stockfish from the FEN
            // carried by the server clock snapshot when it is available.
            if (typeof data.fen === "string" && data.fen.trim()) {
                clockPatch.fen = data.fen.trim();
            }

            patchBoard(gameID, clockPatch);
        };

        // Restore game 
        const onRestore = (data: any) => {
            if (data.game != gameID) return;
            const currentBoard = useGameStore.getState().boards[gameID];

            try {
                // if (data.pgn) chessRef.current.loadPgn(data.pgn);
                if (data.fen) {
                    chessRef.current.load(data.fen);
                } else if (data.pgn) {
                    chessRef.current.loadPgn(data.pgn);
                }
            } catch { }

            initialMoveCountRef.current = chessRef.current.history().length;
            patchBoard(gameID, {
                fen: data.fen || chessRef.current.fen(),
                initialFen: data.initialFen ?? currentBoard?.initialFen,
                fenHistory: Array.isArray(data.fenHistory)
                    ? data.fenHistory
                    : (currentBoard?.fenHistory ?? []),
                pgn: data.pgn || "",
                whiteName: data.whiteName || "White",
                blackName: data.blackName || "Black",
                lastMove: data.lastMove || null,
            })
        }

        // Renamed
        const onRenamed = (data: any) => {
            if (data.gameID !== gameID) return;
            const patch: Partial<{ whiteName: string, blackName: string, initialTimeMs: number, incrementMs: number, round: number, boardNumber: string, location: string }> = {};
            if (data.whiteName !== undefined) patch.whiteName = data.whiteName;
            if (data.blackName !== undefined) patch.blackName = data.blackName;
            if (data.initialTimeMs !== undefined) patch.initialTimeMs = data.initialTimeMs;
            if (data.incrementMs !== undefined) patch.incrementMs = data.incrementMs;
            if (data.round !== undefined) patch.round = data.round;
            if (data.boardNumber !== undefined) patch.boardNumber = data.boardNumber;
            if (data.location !== undefined) patch.location = data.location;
            if (Object.keys(patch).length) patchBoard(gameID, patch);
        }

        socket.on(SERVER_EVENT.ESP_MOVE, onMove);
        socket.on(CLIENT_EVENT.RESTORED, onRestore);
        socket.on(SOCKET_CONSTANTS.GAME_RENAME, onRenamed);
        socket.on("clock_state", onClockState);

        const onUpdateAllGame = (data: any) => {
            // Never apply a broadcast without an explicit game identity. A
            // missing ID must not terminate every open board slot at once.
            if (!data?.gameID || data.gameID !== gameID) return;
            patchBoard(gameID, {
                status: GAME_STATUS.ENDED,
                ...(typeof data?.result === "string" ? { result: data.result } : {}),
            });
            invalidateFetchCache(`/games/${gameID}`);
            invalidateFetchCache("/games/current");
            invalidateFetchCache("/games/history");
        };

        const onGameRestart = (data: any) => {
            if (!data?.gameID || data.gameID !== gameID) return;
            if (data?.oldGameID === gameID) {
                applyGameReset(data);
                return;
            }
        };

        // MQTT lifecycle commands emit a board-scoped status event after the
        // resignation is persisted. Handle it as a second source of truth so
        // an ESP32 resignation updates the currently open board immediately.
        const onGameStatusUpdate = (data: any) => {
            if (!data || data.gameID !== gameID) return;
            const status = data.status === GAME_STATUS.FINISHED
                ? GAME_STATUS.ENDED
                : data.status;
            if (status !== GAME_STATUS.ENDED && typeof data.result !== "string") return;
            patchBoard(gameID, {
                ...(status === GAME_STATUS.ENDED ? { status: GAME_STATUS.ENDED } : {}),
                ...(typeof data.result === "string" ? { result: data.result } : {}),
            });
            invalidateFetchCache(`/games/${gameID}`);
            invalidateFetchCache("/games/current");
            invalidateFetchCache("/games/history");
        };

        const onGameReset = (data: any) => {
            if (data?.gameID !== gameID) return;
            applyGameReset(data);
            invalidateFetchCache(`/games/${gameID}`);
            invalidateFetchCache("/games/current");
            invalidateFetchCache("/games/history");
        };

        socket.on("update_all_game", onUpdateAllGame);
        socket.on("game_status_update", onGameStatusUpdate);
        socket.on("game_restart", onGameRestart);
        socket.on("game:reset", onGameReset);

        return () => {
            socket.off(SERVER_EVENT.ESP_MOVE, onMove);
            socket.off(CLIENT_EVENT.RESTORED, onRestore);
            socket.off(SOCKET_CONSTANTS.GAME_RENAME, onRenamed);
            socket.off("update_all_game", onUpdateAllGame);
            socket.off("game_status_update", onGameStatusUpdate);
            socket.off("game_restart", onGameRestart);
            socket.off("game:reset", onGameReset);
            socket.off("clock_state", onClockState);
        }
    }, [socket, gameID, isLoaded, applyGameReset]);

    

    // --- PGN history -----------------------------------------
    const board = boards[gameID];

    const branches = board?.branches ?? [];
    const selectedBranchId = board?.selectedBranchId ?? null;

    const selectedBranch = branches.find(b => b.id === selectedBranchId) ?? null;
    const displayPgn = selectedBranch?.pgn ?? board?.pgn ?? "";

    useEffect(() => {
        selectedBranchIdRef.current = board?.selectedBranchId ?? null;
    }, [board?.selectedBranchId]);

    // const moves = useMemo(() => {
    //     const pgn = board?.pgn ?? "";
    //     if (!pgn.trim()) return [];
    //     try {
    //         const c = new Chess();
    //         c.loadPgn(displayPgn);
    //         return c.history();
    //     } catch {
    //         return [];
    //     }
    // }, [displayPgn]);

    const moves = useMemo(() => extractSanMoves(displayPgn), [displayPgn]);

    // ----- Game actions ---------------------------------------
    const restart = async () => {
        try {
            const response = await apiFetch(`/games/${gameID}/restart`, {
                method: "POST",
            });
            if (!response.ok) throw new Error(`Restart failed with ${response.status}`);
            const data = await response.json().catch(() => ({}));
            applyGameReset(data);
        } catch (e) {
            console.error("Restart error:", e);
        }
        invalidateFetchCache(`/games/${gameID}`);
        invalidateFetchCache("/games/current");
        invalidateFetchCache("/games/history");
    }

    // Resign
    const resign = async (resignSide: "white" | "black" | "draw" = "white", branchId?: string | null) => {
        if (resignRequestRef.current) return;
        resignRequestRef.current = true;
        const resultTag = resignSide === "draw" ? "1/2-1/2" : resignSide === "white" ? "0-1" : "1-0";
        try {
            const res = await apiFetch(`/games/${gameID}/resign`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ resignSide, branchId: branchId ?? null }),
            });
            if (res.ok) {
                patchBoard(gameID, {
                    status: GAME_STATUS.ENDED,
                    result: resultTag,
                });
            }
        } catch {
            // Keep the current board state when the request did not reach the server.
        } finally {
            resignRequestRef.current = false;
        }
        invalidateFetchCache(`/games/${gameID}`);
        invalidateFetchCache("/games/current");
        invalidateFetchCache("/games/history");
    };

    const selectBranch = useCallback((branchId: string | null) => {
        patchBoard(gameID, { selectedBranchId: branchId });
        try {
            if (branchId) sessionStorage.setItem(`chess:branch:${gameID}`, branchId);
            else sessionStorage.removeItem(`chess:branch:${gameID}`);
        } catch { }
    }, [gameID, patchBoard]);

    const computedLastMove = useMemo(() => {
        if (!displayPgn.trim()) return null;
        try {
            const c = new Chess();
            c.loadPgn(displayPgn);
            const hist = c.history({ verbose: true });
            if (hist.length === 0) return null;
            const lastMoveObj = hist[hist.length - 1];
            return {
                from: lastMoveObj.from,
                to: lastMoveObj.to,
                promotion: lastMoveObj.promotion || null,
            };
        } catch {
            return null;
        }
    }, [displayPgn]);

    return {
        fen: board?.fen ?? "start",
        initialFen: board?.initialFen,
        fenHistory: board?.fenHistory ?? [],
        pgn: selectedBranch?.pgn ?? board?.pgn ?? "",
        cp: board?.cp ?? null,
        whiteName: board?.whiteName ?? "White",
        blackName: board?.blackName ?? "Black",
        lastMove: computedLastMove ?? board?.lastMove ?? null,
        boardConnected: board?.boardConnected ?? false,
        moves,
        result: board?.result ?? null,
        restart,
        resign,
        status: board?.status,
        isLoaded,
        loadError,
        lastMoveAt,
        moveTimesMap,
        chess: chessRef.current,

        // initcheck
        initStatus: board?.initStatus ?? GAME_STATUS.WAITING,
        buttonReady: board?.buttonReady ?? false,
        missingSquares: board?.missingSquares ?? [],
        extraSquares: board?.extraSquares ?? [],
        wrongPieceSquares: board?.wrongPieceSquares ?? [],

        // branches
        branches: board?.branches ?? [],
        selectedBranchId: board?.selectedBranchId ?? null,
        mainPgnBeforeBranch: mainPgnAtBranchRef.current,
        hasBranches: (board?.branches ?? []).length > 0,
        selectBranch,

        // chess clock
        initialTimeMs: board?.initialTimeMs,
        incrementMs: board?.incrementMs,
        whiteRemainingMs: board?.whiteRemainingMs,
        blackRemainingMs: board?.blackRemainingMs,
        activeClockSide: board?.activeClockSide,
        clockStartedAt: board?.clockStartedAt,
        serverNow: board?.serverNow,
        round: board?.round ?? 1,
        location: board?.location ?? "",
        boardNumber: board?.boardNumber ?? "",
        resetRevision: board?.resetRevision,
    }
}
