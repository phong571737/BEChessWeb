import { useSocket } from "@/components/providers/socket-provider";
import { fetchJSONCached, FetchNotFoundError, invalidateFetchCache } from "@/lib/fetch-cache";
import { useGameStore } from "@/lib/store";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Chess } from "chess.js"
import { CLIENT_EVENT, SERVER_EVENT, SOCKET_CONSTANTS } from "@/lib/constants/socket";
import { GAME_STATUS } from "@/lib/constants/game";
import { Branch } from "@/types/game.types";
import { extractSanMoves } from "@/lib/custom-chess";

export interface boardAlert {
    code: string;
    detail: string;
}

export function useGame(gameID: string) {
    const { patchBoard, boards } = useGameStore();
    const socket = useSocket();
    const chessRef = useRef<Chess>(new Chess());
    const initialMoveCountRef = useRef<number>(0);
    const sessionTs = useRef<number[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [moveTimesMap, setMoveTimesMap] = useState<Record<number, number>>({});
    const [loadError, setLoadError] = useState<"not-found" | "error" | null>(null);

    const cachedBoard = boards[gameID];

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
        const join = () => socket.emit("join", { gameID });
        join();
        socket.on("connect", join);
        return () => { socket.off("connect", join) };
    }, [socket, gameID]);

    // ------ Load initial game from REST API -------------------------------
    useEffect(() => {
        if (!gameID) return;
        if (cachedBoard?.fen) {
            try {
                if (cachedBoard.pgn) chessRef.current.loadPgn(cachedBoard.pgn);
            } catch { }

            initialMoveCountRef.current = chessRef.current.history().length;
            sessionTs.current = [];
            setIsLoaded(true);
            return;
        }

        setIsLoaded(false);
        setLoadError(null);
        let cancelled = false;

        fetchJSONCached<any>(`/games/${gameID}`, 1_500)
            .then((game) => {
                console.log("current chessref", chessRef.current);
                try {
                    if (game.pgn) chessRef.current.loadPgn(game.pgn);

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
                    WhiteName: game.WhiteName || "White",
                    BlackName: game.BlackName || "Black",
                    pgn: game.pgn || "",
                    status: boardStatus,
                    lastMove: game.lastMove || null,
                    result: game.result ?? undefined,
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

        return () => { cancelled = true; }
    }, [gameID, cachedBoard?.fen, cachedBoard?.pgn]);

    // ---------------Polling initial check state ----------------------------
    useEffect(() => {
        if (!gameID || !isLoaded) return;

        let stopped = false;

        const fetchInitCheck = async () => {
            try {
                const res = await fetch(`/games/${gameID}/initcheck`);

                if (!res.ok) return;
                const data = await res.json();

                patchBoard(gameID, {
                    initStatus: data.status,
                    missingSquares: data.missingSquares || [],
                    extraSquares: data.extraSquares || [],
                    wrongPieceSquares: data.wrongPieceSquares || [],
                })
                console.log("game status: ", data.status);
                // stop polling when board is ready
                if (data.status === GAME_STATUS.READY) {
                    stopped = true;
                    clearInterval(interval);
                }
            } catch (e) {
                console.log("Init check error", e);
            }
        };

        fetchInitCheck();
        const interval = setInterval(() => {
            if (!stopped) {
                fetchInitCheck();
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [gameID, isLoaded]);

    // ---- Game socket listeners (after load) -------------------------------
    useEffect(() => {
        if (!socket || !gameID || !isLoaded) return;

        // onMove event 
        const onMove = (data: any) => {
            if (data.gameID !== gameID) return;
            console.log("Receive move", data);

            if (data.isError) {
                try {
                    chessRef.current.load(data.fen);
                } catch { }

                patchBoard(gameID, {
                    fen: data.fen,
                    pgn: chessRef.current.pgn(),
                    lastMove: null,
                    errorSquares: data.departures
                        ? data.departures.split(",").map((s: string) => s.trim())
                        : [],
                });

                return
            }

            const incomingBranches: Branch[] = data.branches ?? [];
            const newPgn = data.pgn || chessRef.current.pgn();

            try {
                if (data.pgn) chessRef.current.loadPgn(data.pgn);
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

        // Restore game 
        const onRestore = (data: any) => {
            if (data.game != gameID) return;

            try {
                if (data.pgn) chessRef.current.loadPgn(data.pgn);
            } catch { }

            initialMoveCountRef.current = chessRef.current.history().length;
            patchBoard(gameID, {
                fen: data.fen || chessRef.current.fen(),
                pgn: data.pgn || "",
                WhiteName: data.WhiteName || "White",
                BlackName: data.BlackName || "Black",
                lastMove: data.lastMove || null,
            })
        }

        // Renamed
        const onRenamed = (data: any) => {
            if (data.gameID !== gameID) return;
            const patch: Partial<{ WhiteName: string, BlackName: string }> = {};
            if (data.WhiteName !== undefined) patch.WhiteName = data.WhiteName;
            if (data.BlackName !== undefined) patch.BlackName = data.BlackName;
            if (Object.keys(patch).length) patchBoard(gameID, patch);
        }

        socket.on(SERVER_EVENT.ESP_MOVE, onMove);
        socket.on(CLIENT_EVENT.RESTORED, onRestore);
        socket.on(SOCKET_CONSTANTS.GAME_RENAME, onRenamed);

        return () => {
            socket.off(SERVER_EVENT.ESP_MOVE, onMove);
            socket.off(CLIENT_EVENT.RESTORED, onRestore);
            socket.off(SOCKET_CONSTANTS.GAME_RENAME, onRenamed);
        }
    }, [socket, gameID, isLoaded, boards]);

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
        await fetch(`/games/${gameID}/restart`, { method: "POST" });
        invalidateFetchCache(`/games/${gameID}`);
        invalidateFetchCache("/games/current");
        invalidateFetchCache("/games/history");
    }

    // Resign
    const resign = async (resignSide: "white" | "black" | "draw" = "white", branchId?: string | null) => {
        console.log("RESIGN CLICKED", resignSide);
        await fetch(`/games/${gameID}/resign`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resignSide, branchId: branchId ?? null }),
        });
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
        pgn: selectedBranch?.pgn ?? board?.pgn ?? "",
        cp: board?.cp ?? null,
        WhiteName: board?.WhiteName ?? "White",
        BlackName: board?.BlackName ?? "Black",
        lastMove: computedLastMove ?? board?.lastMove ?? null,
        boardConnected: board?.boardConnected ?? false,
        moves,
        result: board?.result ?? null,
        restart,
        resign,
        status: board?.status,
        isLoaded,
        lastMoveAt,
        moveTimesMap,
        chess: chessRef.current,

        // initcheck
        initStatus: board?.initStatus ?? GAME_STATUS.WAITING,
        missingSquares: board?.missingSquares ?? [],
        extraSquares: board?.extraSquares ?? [],
        wrongPieceSquares: board?.wrongPieceSquares ?? [],

        // branches
        branches: board?.branches ?? [],
        selectedBranchId: board?.selectedBranchId ?? null,
        mainPgnBeforeBranch: mainPgnAtBranchRef.current,
        hasBranches: (board?.branches ?? []).length > 0,
        selectBranch,
    }
}