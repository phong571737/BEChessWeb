import { useSocket } from "@/components/providers/socket-provider";
import { fetchJSONCached, invalidateFetchCache } from "@/lib/fetch-cache";
import { useGameStore } from "@/lib/store";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js"
import { CLIENT_EVENT, SERVER_EVENT, SOCKET_CONSTANTS } from "@/lib/constants/socket";
import { GAME_STATUS } from "@/lib/constants/game";

export interface boardAlert {
    code: string;
    detail: string;
}

export function useGame(gameID: string) {
    const {patchBoard, boards} = useGameStore();
    const socket = useSocket();
    const chessRef = useRef<Chess>(new Chess());
    const initialMoveCountRef = useRef<number>(0);
    const sessionTs = useRef<number[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [moveTimesMap, setMoveTimesMap] = useState<Record<number, number>>({});
    const cachedBoard = boards[gameID];

    // ------- Move timing -----------------------------
    const storageKey = `chess:moveAt:${gameID}`;
    const [lastMoveAt, setLastMoveAt] = useState<number>(() => {
        try {
            const stored = sessionStorage.getItem(storageKey);
            if (stored) return Number(stored);
        } catch {}
        return Date.now();
    });

    useEffect(() => {
        if (!socket || !gameID) return;
        const join = () => socket.emit("join", {gameID});
        join();
        socket.on("connect", join);
        return () => {socket.off("connect", join)};
    }, [socket, gameID]);

    // ------ Load initial game from REST API -------------------------------
    useEffect(() => {
        if (!gameID) return;
        if (cachedBoard?.fen) {
            try {
                if(cachedBoard.pgn) chessRef.current.loadPgn(cachedBoard.pgn);
            } catch {}

            initialMoveCountRef.current = chessRef.current.history().length;
            sessionTs.current = [];
            setIsLoaded(true);
            return;
        }

        setIsLoaded(false);

        fetchJSONCached<any>(`/games/${gameID}`, 1_500)
            .then((game) => {
                console.log("current chessref", chessRef.current);
                try {
                    if (game.pgn) chessRef.current.loadPgn(game.pgn);

                } catch {}
                initialMoveCountRef.current = chessRef.current.history().length;

                const storedTs = (() => {
                    try {
                        return Number(sessionStorage.getItem(storageKey) || 0)
                    } catch{
                        return 0;
                    }
                });

                sessionTs.current = [];

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
            });
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

                // stop polling when board is ready
                if (data.status === GAME_STATUS.READY) {
                    stopped = true;
                    clearInterval(interval);
                }
            } catch (e){
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
            console.log("Receive move");

            try {
                if (data.pgn) chessRef.current.loadPgn(data.pgn);
            } catch {}

            patchBoard(gameID, {
                fen: data.fen || chessRef.current.fen(), 
                pgn: data.pgn || chessRef.current.pgn(),
                lastMove: data.lastMove || null,
            });
        }

        // Restore game 
        const onRestore = (data: any) => {
            if (data.game != gameID) return;

            try {
                if (data.pgn) chessRef.current.loadPgn(data.pgn);
            } catch {}

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
            const patch: Partial<{ WhiteName: string, BlackName: string}> = {};
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
    const moves = useMemo(() => {
        const pgn = board?.pgn ?? "";
        if (!pgn.trim()) return [];
        try {
            const c = new Chess();
            c.loadPgn(pgn);
            return c.history();
        } catch {
            return [];
        }
    }, [board?.pgn]);

    // ----- Game actions ---------------------------------------
    const restart = async () => {
        await fetch(`/games/${gameID}/restart`, { method: "POST"});
        invalidateFetchCache(`/games/${gameID}`);
        invalidateFetchCache("/games/current");
        invalidateFetchCache("/games/history");
    }

    // Resign
    const resign = async (resignSide: "white" | "black" | "draw" = "white") => {
        console.log("RESIGN CLICKED", resignSide);
        await fetch(`/games/${gameID}/resign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resignSide }),
        });
        invalidateFetchCache(`/games/${gameID}`);
        invalidateFetchCache("/games/current");
        invalidateFetchCache("/games/history");
    };

    return {
        fen: board?.fen ?? "start",
        pgn: board?.pgn ?? "",
        WhiteName: board?.WhiteName ?? "White",
        BlackName: board?.BlackName ?? "Black",
        lastMove: board?.lastMove ?? null,
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
    }
}