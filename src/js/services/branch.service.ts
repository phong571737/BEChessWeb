import { activeBranches, gameSeq, games } from "../game/game.repository.js";
import { ChessService } from "./chess.service.js";
import { executeMove } from "../utils/chess.utils.js";
import { printBranches } from "../utils/debug.branch.js";
import { MOVE_TYPE } from "../constant.js";
import { Chess, Move, PieceSymbol, Square } from "chess.js";
import { serializeBranches } from "../utils/branch.utils.js";
import { MOVE_STATUS } from "../constant.js";
import { Branch, BranchResponse, MoveLike } from "../types/chess.types.js";

const PROMOTION_PIECES: PieceSymbol[] = ["q", "r", "b", "n"];

export type Candidate = string;
export type MoveType = (typeof MOVE_TYPE)[keyof typeof MOVE_TYPE];

/** Capture */
function buildCaptureBranches(game: Chess, fromSq: Square): Move[] {
    return game
        .moves({ square: fromSq, verbose: true })
        .filter(m => m.flags.includes("c") || m.flags.includes("e"));
}

function buildCapturePromotionBranches(game: Chess, fromSq: Square): Move[] {
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

export function createBranches(baseGame: Chess, moves: MoveLike[], parentBranch: Branch | null = null): Branch[] {
    const seen = new Set();
    const branches: Branch[] = [];

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
            move: mv,
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
function getLongestBranch(branches: Branch[] | null | undefined): Branch | null {
    if (!branches || branches.length === 0) return null;

    return branches.reduce((longest, b) =>
        b.step > longest.step ? b : longest
        , branches[0]!);
}

function setBranches(gameID: string, branches: Branch[] | null | undefined): void {
    if (!branches || branches.length === 0) {
        activeBranches.delete(gameID);  // remove
    } else {
        activeBranches.set(gameID, branches);
    }
}

// Sync main game according to the longest branch
function syncMainToLongest(gameID: string, mainGame: Chess, branches: Branch[]): Branch | null{
    const longest = getLongestBranch(branches);
    if (!longest) return null;

    mainGame.loadPgn(longest.pgn);
    games.set(gameID, mainGame);
    return longest;
}

function isPromotionMove(game: Chess, fromSq: Square, toSq: Square | null) {
    const piece = game.get(fromSq);
    if (!piece || piece.type !== "p") return false;
    const toRank = toSq?.[1];
    return (piece.color === "w" && toRank === "8") || (piece.color === "b" && toRank === "1");
}

export function handleBranchMove(
    gameID: string, 
    mainGame: Chess, 
    candidates: Candidate[], 
    seq: number, 
    moveType: string 
): BranchResponse {
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

function applyMoveToBranches(
    gameID: string, 
    mainGame: Chess, 
    currentBranches: Branch[], 
    candidates: Candidate[], 
    seq: number
): BranchResponse {
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
            const move = validMoves[0]!;
            executeMove(clone, move);

            advanced.push({
                ...branch,
                pgn: clone.pgn(),
                fen: clone.fen(),
                lastApplied: move,
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

    const nextBranches = [...advanced, ...held];
    console.log(`[MOVE] advanced=${advanced.length} held=${held.length} total=${nextBranches.length}`);

    if (advanced.length === 0) {
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
function resolveCaptureMovesFromGame(game: Chess, candidates: Candidate[]): MoveLike[] {
    const fromSq = candidates[0]?.slice(0, 2) as Square | undefined;
    const toSq = (candidates[0]?.slice(2, 4) || null) as Square | null;

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

function buildBranchResponse(
    gameID: string, 
    mainGame: Chess, 
    seq: number, 
    branches: Branch[], 
    extra = {}
): BranchResponse {
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
function applyCaptureToBranches(
    gameID: string, 
    mainGame: Chess, 
    currentBranches: Branch[],
    candidates: Candidate[],
    seq: number
): BranchResponse {
    const expanded: Branch[] = [];
    const held: Branch[] = [];
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

    const nextBranches = [...expanded, ...held];
    console.log(`[CAPTURE] expanded=${expanded.length} held=${held.length} total=${nextBranches.length}`);

    if (expanded.length === 0) {
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