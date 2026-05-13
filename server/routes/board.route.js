import express from "express";
import { getIO } from "../sockets/index.js";
import { getGameCollections, saveGame } from "../models/game.model.js";
import { invalidateCached } from "../utils/response.cache.js";

export const boardRouter = express.Router();

// boardID → { gameID, lastSeen, ip }
const registry = new Map();

// gameID → command string ("START" etc.) — cleared on delivery via heartbeat
const pendingCommands = new Map();

export function getBoardRegistry() { return registry; }

/** Queue a command to be delivered to the board holding this game on next heartbeat. */
export function setGamePendingCommand(gameID, command) {
    pendingCommands.set(gameID, command);
}

// ── TTL offline detection ────────────────────────────────────────────────────
// Check every 10 s; boards silent for > 90 s are considered offline.
setInterval(() => {
    const now = Date.now();
    for (const [boardID, info] of registry) {
        if (now - info.lastSeen > 90_000) {
            const gameID = info.gameID;
            registry.delete(boardID);
            try {
                const io = getIO();
                io.emit("board_offline", { boardID, gameID });
                if (gameID) io.to(gameID).emit("board_offline", { boardID, gameID });
            } catch {}
            console.log(`[BOARD] ${boardID} went offline (TTL), game=${gameID ?? "none"}`);
        }
    }
}, 10_000);

/**
 * POST /boards/heartbeat
 * Body: { boardID, gameID?, ip? }
 * Response: { ok, gameID?, command? }
 */
boardRouter.post("/heartbeat", (req, res) => {
    const { boardID, gameID: currentGameID = null, ip = null, btn = 0 } = req.body;
    if (!boardID) return res.status(400).json({ error: "Missing boardID" });

    const existing = registry.get(boardID);

    // Trust the board's own gameID (from NVS) as the source of truth for the
    // game it is currently playing. The server registry is ephemeral and resets
    // on restart, so overriding the board's stored game mid-session caused
    // moves to be routed to the wrong game.
    //
    // A new gameID is delivered ONLY when game creation explicitly queued one
    // via pendingGameID. It is consumed once and then cleared.
    const pendingGameID = existing?.pendingGameID ?? null;
    const resolvedGameID = currentGameID ?? existing?.gameID ?? null;

    const now = Date.now();
    registry.set(boardID, {
        gameID:        resolvedGameID,
        pendingGameID: null,           // clear after reading
        lastSeen:      now,
        ip,
        btn:           btn === 1 || btn === "1",
    });
    getIO().emit("board_heartbeat", { boardID, gameID: resolvedGameID, online: true, lastSeen: now, ip, btn: btn === 1 || btn === "1" });

    const resp = { ok: true };

    // Deliver a pending gameID assignment (set by game creation) exactly once.
    if (pendingGameID && pendingGameID !== currentGameID) {
        resp.gameID = pendingGameID;
        // Update registry immediately so subsequent heartbeats reflect the new game.
        registry.get(boardID).gameID = pendingGameID;
        console.log(`[BOARD] delivering new gameID=${pendingGameID} to ${boardID} (was ${currentGameID})`);
    }

    const activeGameID = resp.gameID ?? resolvedGameID;
    if (activeGameID) {
        const cmd = pendingCommands.get(activeGameID);
        if (cmd) {
            resp.command = cmd;
            pendingCommands.delete(activeGameID);
            console.log(`[BOARD] delivering command="${cmd}" to ${boardID} for game=${activeGameID}`);
        }
    }

    res.json(resp);
});

/**
 * POST /boards/scan-result
 * Body: { boardID, gameID, result: "STARTED"|"MISSING"|"DUPLICATE", detail: "" | "a1,b2,..." }
 */
boardRouter.post("/scan-result", async (req, res) => {
    const { boardID, gameID, result, detail = "" } = req.body;
    if (!boardID || !gameID || !result) {
        return res.status(400).json({ error: "Missing boardID, gameID, or result" });
    }

    const missing = detail ? detail.split(",").map(s => s.trim()).filter(Boolean) : [];

    console.log(`[BOARD] scan-result board=${boardID} game=${gameID} result=${result} missing=[${missing.join(",")}]`);

    try {
        if (result === "STARTED") {
            await saveGame(gameID, { status: "active" });
            invalidateCached("games:");
            invalidateCached(`games:item:${gameID}`);
            // Emit to game room (board page) AND globally (home page, not in room)
            getIO().to(gameID).emit("board_scan_ok",      { gameID, boardID });
            getIO().to(gameID).emit("game_status_update", { gameID, status: "active" });
            getIO().emit("board_scan_ok",      { gameID, boardID });
            getIO().emit("game_status_update", { gameID, status: "active" });
        } else {
            await saveGame(gameID, { status: "scan_failed", scanMissing: missing, scanReason: result });
            invalidateCached("games:");
            invalidateCached(`games:item:${gameID}`);
            getIO().to(gameID).emit("board_scan_failed",  { gameID, boardID, reason: result, missing });
            getIO().to(gameID).emit("game_status_update", { gameID, status: "scan_failed" });
            // Also broadcast globally so home-page cards update
            getIO().emit("game_status_update", { gameID, status: "scan_failed" });
        }
    } catch (e) {
        console.error("[POST /boards/scan-result]", e);
        return res.status(500).json({ error: "Server error" });
    }

    res.json({ ok: true });
});

/**
 * POST /boards/alert
 * ESP32 reports in-game errors (WRONG_TURN, PIECE_LOST, etc.)
 * Body: { boardID, gameID, code: string, detail?: string }
 */
boardRouter.post("/alert", (req, res) => {
    const { boardID, gameID, code, detail = "" } = req.body;
    if (!boardID || !gameID || !code) {
        return res.status(400).json({ error: "Missing boardID, gameID, or code" });
    }

    console.log(`[BOARD] alert board=${boardID} game=${gameID} code=${code} detail=${detail}`);
    getIO().to(gameID).emit("board_alert", { gameID, boardID, code, detail });
    res.json({ ok: true });
});

/**
 * DELETE /boards/:boardID/disconnect
 * Called by ESP32 on graceful shutdown.
 */
boardRouter.delete("/:boardID/disconnect", (req, res) => {
    const { boardID } = req.params;
    const info = registry.get(boardID);
    const gameID = info?.gameID ?? null;
    registry.delete(boardID);
    const io = getIO();
    io.emit("board_heartbeat", { boardID, gameID, online: false });
    io.emit("board_offline",   { boardID, gameID });
    if (gameID) io.to(gameID).emit("board_offline", { boardID, gameID });
    res.json({ ok: true });
});

/**
 * GET /boards
 * Returns all boards active in the last 90 s, with their linked game status.
 */
boardRouter.get("/", async (req, res) => {
    const now = Date.now();
    const active = [];
    for (const [boardID, info] of registry) {
        if (now - info.lastSeen < 90_000) {
            active.push([boardID, info]);
        }
    }

    if (active.length === 0) return res.json([]);

    const gameIDs = active.map(([, info]) => info.gameID).filter(Boolean);
    const gameStatuses = {};
    if (gameIDs.length > 0) {
        try {
            const games = await getGameCollections()
                .find({ _id: { $in: gameIDs } }, { projection: { _id: 1, status: 1 } })
                .toArray();
            games.forEach(g => { gameStatuses[g._id] = g.status ?? "active"; });
        } catch (e) {
            console.error("[GET /boards] DB lookup error", e);
        }
    }

    // Clear stale gameIDs from the registry — if the game no longer exists in DB,
    // the registry entry is a leftover from a previous session and should be reset.
    for (const [, info] of active) {
        if (info.gameID && !(info.gameID in gameStatuses)) {
            info.gameID = null;
        }
    }

    res.json(active.map(([boardID, info]) => ({
        boardID,
        gameID: info.gameID,
        gameStatus: info.gameID ? (gameStatuses[info.gameID] ?? null) : null,
        online: true,
        lastSeen: info.lastSeen,
        ip: info.ip ?? null,
        btn: info.btn ?? false,
    })));
});
