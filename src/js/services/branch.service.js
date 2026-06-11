import { activeBranches, gameSeq, games } from "../game/game.repository.js";
import { ChessService } from "./chess.service.js";
import { buildResponse, executeMove } from "../utils/chess.utils.js";
import { printBranches } from "../utils/debug.branch.js";
import { MOVE_TYPE } from "../constant.js";
import { Chess } from "chess.js";
import { serializeBranches } from "../utils/branch.utils.js";
import { MOVE_STATUS } from "../constant.js";

const PROMOTION_PIECES = ["q", "r", "b", "n"];

/** Capture */
function buildCaptureBranches(game, fromSq) {
    return game
        .moves({ square: fromSq, verbose: true })
        .filter(m => m.flags.includes("c") || m.flags.includes("e"));
}

function buildPromotionBranches(game, fromSq, toSq) {
    return PROMOTION_PIECES.map((piece) => {
        const mv = game.move({ from: fromSq, to: toSq, promotion: piece });
        if (!mv) return null;
        game.undo();
        return mv;
    }).filter(Boolean);
}

function buildCapturePromotionBranches(game, fromSq) {
    const uniqueTargets = [
        ...new Set(
            game
                .moves({ square: fromSq, verbose: true })
                .filter((m) => m.flags.includes("c") || m.flags.includes("e"))
                .map((m) => m.to)
        ),
    ];

    const result = [];
    for (const toSq of uniqueTargets) {
        for (const piece of PROMOTION_PIECES) {
            const mv = game.move({ from: fromSq, to: toSq, promotion: piece });
            if (!mv) continue;
            game.undo();
            result.push(mv);
        }
    }
    return result;
}


export function createBranches(baseGame, moves, parentBranch = null) {
    const seen = new Set();
    const branches = [];

    for (const mv of moves) {
        const clone = new Chess();
        clone.loadPgn(baseGame.pgn());
        executeMove(clone, mv);

        const fen = clone.fen();
        if (seen.has(fen)) continue;
        seen.add(fen);

        const moveId = `${mv.from}${mv.to}${mv.promotion ?? ""}`;
        branches.push({
            id: parentBranch ? `${parentBranch.id}_${moveId}` : moveId,
            pgn: clone.pgn(),
            fen,
            lastApplied: mv,
            step: (parentBranch?.step ?? 0) + 1,
            parentId: parentBranch?.id ?? null,
        });
    }

    return branches;
}

// Get longest branch 
function getLongestBranch(branches) {
    if (!branches || branches.length === 0) return null;
    return branches.reduce((longest, b) =>
        b.step > longest.step ? b : longest
        , branches[0]);
}

function setBranches(gameID, branches) {
    if (!branches || branches.length === 0) {
        activeBranches.delete(gameID);  // remove
    } else {
        activeBranches.set(gameID, branches);
    }
}

// Sync main game according to the longest branch
function syncMainToLongest(gameID, mainGame, branches) {
    const longest = getLongestBranch(branches);
    if (!longest) return null;

    mainGame.loadPgn(longest.pgn);
    games.set(gameID, mainGame);
    return longest;
}

function isPromotionMove(game, fromSq, toSq) {
    const piece = game.get(fromSq);
    if (!piece || piece.type !== "p") return false;
    const toRank = toSq?.[1];
    return (piece.color === "w" && toRank === "8") || (piece.color === "b" && toRank === "1");
}

export function handleBranchMove(gameID, mainGame, candidates, seq, moveType) {
    const currentBranches = activeBranches.get(gameID) ?? [];
    console.log(`[handleBranchMove] gameID=${gameID} moveType=${moveType} count=${currentBranches.length}`);

    // find all moves llegal for current candidate
    let validMoves = ChessService.findValidMove(mainGame, candidates);
    console.log(`valid move from: ${validMoves}`);

    // capture
    if (moveType === MOVE_TYPE.CAPTURE) {
        return applyCaptureToBranches(gameID, mainGame, currentBranches, candidates, seq);
    }

    return applyMoveToBranches(gameID, mainGame, currentBranches, candidates, seq);
}

function applyMoveToBranches(gameID, mainGame, currentBranches, candidates, seq) {
    const advanced = [];
    const held = [];

    for (const branch of currentBranches) {
        const tempGame = new Chess();
        tempGame.loadPgn(branch.pgn);

        const validMoves = ChessService.findValidMove(tempGame, candidates);

        if (validMoves.length === 1) {
            // Advance branch
            const clone = new Chess();
            clone.loadPgn(branch.pgn);
            executeMove(clone, validMoves[0]);

            advanced.push({
                ...branch,
                pgn: clone.pgn(),
                fen: clone.fen(),
                lastApplied: validMoves[0],
                step: branch.step + 1,
            });
        } else if (validMoves.length > 1) {
            // Ambiguous expand sub-branches
            const subBranches = createBranches(tempGame, validMoves, branch);
            advanced.push(...subBranches);
        } else {
            // invalid -> hold
            held.push(branch);
        }
    }

    // Dedup advanced according to FEN
    const seen = new Set();
    const dedupedAdvanced = advanced.filter((b) => {
        if (seen.has(b.fen)) return false;
        seen.add(b.fen);
        return true;
    });

    const nextBranches = [...dedupedAdvanced, ...held];
    console.log(`[MOVE] advanced=${dedupedAdvanced.length} held=${held.length} total=${nextBranches.length}`);

    if (dedupedAdvanced.length === 0) {
        console.log("[MOVE] No branches advanced, holding all");
        setBranches(gameID, currentBranches);
        syncMainToLongest(gameID, mainGame, currentBranches);
        printBranches(gameID);
        return buildBranchResponse(gameID, mainGame, seq, currentBranches, { invalidMove: true });
    }

    gameSeq.set(gameID, seq);

    // Save and send to UI
    setBranches(gameID, nextBranches);
    syncMainToLongest(gameID, mainGame, nextBranches);
    printBranches(gameID);
    return buildBranchResponse(gameID, mainGame, seq, nextBranches);
}

// ---------Handle capture moves from game ------------------------
function resolveCaptureMovesFromGame(game, candidates) {
    const fromSq = candidates[0]?.slice(0, 2);
    const toSq = candidates[0]?.slice(2, 4) || null;

    if (!fromSq) return [];

    if (toSq && isPromotionMove(game, fromSq, toSq)) {
        return buildCapturePromotionBranches(game, fromSq);
    }

    if (!toSq && isPromotionMove(game, fromSq, null)) {
        return buildCapturePromotionBranches(game, fromSq);
    }

    if (toSq) {
        const direct = ChessService.findValidMove(game, candidates).filter(
            (m) => m.flags?.includes("c") || m.flags?.includes("e")
        );
        if (direct.length > 0) return direct;
    }

    return buildCaptureBranches(game, fromSq);
}

function buildBranchResponse(gameID, mainGame, seq, branches, extra = {}) {
    return {
        status: MOVE_STATUS.OK,
        gameID,
        fen: mainGame.fen(),
        pgn: mainGame.pgn(),
        lastSeq: seq,
        branches: serializeBranches(branches),
        branchCount: branches.length,
        ...extra,
    };
}

// ----------------- Apply Capture to All Branches --------------------------------
function applyCaptureToBranches(gameID, mainGame, currentBranches, candidates, seq) {
    const expanded = [];
    const held = [];
    // loop for all current branch
    for (const branch of currentBranches) {
        const tempGame = new Chess();
        tempGame.loadPgn(branch.pgn);

        const captureMoves = resolveCaptureMovesFromGame(tempGame, candidates);

        if (captureMoves.length === 0) {
            held.push(branch);
            continue;
        }
        const subBranches = createBranches(tempGame, captureMoves, branch);
        expanded.push(...subBranches);
    }

    const seen = new Set();
    const dedupedExpanded = expanded.filter((b) => {
        if (seen.has(b.fen)) return false;
        seen.add(b.fen);
        return true;
    });

    const nextBranches = [...dedupedExpanded, ...held];
    console.log(`[CAPTURE] expanded=${dedupedExpanded.length} held=${held.length} total=${nextBranches.length}`);

    if (dedupedExpanded.length === 0) {
        console.log("[CAPTURE] No branches expanded, holding all");
        setBranches(gameID, currentBranches);
        syncMainToLongest(gameID, mainGame, currentBranches);
        printBranches(gameID);
        return buildBranchResponse(gameID, mainGame, seq, currentBranches, { invalidMove: true });
    }

    gameSeq.set(gameID, seq);

    setBranches(gameID, nextBranches);
    syncMainToLongest(gameID, mainGame, nextBranches);
    printBranches(gameID);
    return buildBranchResponse(gameID, mainGame, seq, nextBranches);
}