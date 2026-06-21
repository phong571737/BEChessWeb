import { Chess, Square } from "chess.js";

type Promotion = "q" | "r" | "b" | "n";
type TokenOutcome =| { kind: "applied"; chess: Chess; underpromotion: boolean } | { kind: "skipped" };
const PROMOTION_PIECES: Promotion[] = ["q", "r", "b", "n"];

export interface SkippedToken {
    token: string;
    ply: number;
}

export interface BranchResult {
    sanHistory: string[]; // SAN move list
    pgn: string; // Full exportable PGN string
    skipped: SkippedToken[];
    appliedCount: number;
    totalTokens: number; // Total number of tokens in the input
    underpromotions: number;
}

export interface ParseUciResult {
    branches: BranchResult[]; //  Sorted with the most complete branch (fewest skips) first
}

interface BranchState {
    chess: Chess;
    skipped: SkippedToken[];
    underpromotions: number;
}

const MAX_BRANCHES = 25;

// Tokenize the input and remove PGN move-number markers.
function tokenize(input: string): string[] {
    return input.trim().split(/\s+/).filter(Boolean).map((tok) => tok.replace(/^\d+\.\s*/, ""));
}

// Create a new clone chess
function cloneChess(chess: Chess): Chess {
    const clone = new Chess();
    clone.loadPgn(chess.pgn());
    return clone;
}

// Remove header from pgn 
function pgnMoveText(chess: Chess): string {
    return chess.pgn().split(/\r?\n/).filter((line) => !line.trim().startsWith("[")).join("\n").trim();
}

/** 
 * Explicit moves produce one branch
 * Ambigious captures may produce multiple branches
 * Promotions expand into one branch per promotion piece */
function applyToken(chess: Chess, token: string): TokenOutcome[] {
    const ambiguousCapture = /^([a-h][1-8])x$/i.exec(token); // match capture 
    const explicitMove = /^([a-h][1-8])([a-h][1-8])$/i.exec(token); // normal uci
 
    // Handle normal move, enpasant
    if (explicitMove) {
        const from = explicitMove[1].toLowerCase() as Square;
        const to = explicitMove[2].toLowerCase() as Square;
        const piece = chess.get(from);
        if (!piece) return [{ kind: "skipped" }]; // if square undefined, skip
        const needsPromo = piece.type === "p" && (to[1] === "8" || to[1] === "1"); // the pawn is finish, promotion
 
        // normal move, not promotion
        if (!needsPromo) {
            try {
                chess.move({ from, to });
                return [{ kind: "applied", chess, underpromotion: false }];
            } catch {
                return [{ kind: "skipped" }];
            }
        }
 
        const outcomes: TokenOutcome[] = [];
        for (const promotion of PROMOTION_PIECES) {
            const branch = cloneChess(chess);
            try {
                branch.move({ from, to, promotion });
                outcomes.push({ kind: "applied", chess: branch, underpromotion: promotion !== "q" });
            } catch {
                // illegal for this particular promotion piece — ignore just this option
            }
        }
        return outcomes.length > 0 ? outcomes : [{ kind: "skipped" }];
    }
 
    // Create branch from capture move and promotion
    if (ambiguousCapture) {
        const square = ambiguousCapture[1].toLowerCase() as Square;
        const legalCaptures = chess.moves({ square, verbose: true }).filter((m) => m.captured);
        if (legalCaptures.length === 0) return [{ kind: "skipped" }];
 
        // just create move capture
        const byDestination = new Map<string, (typeof legalCaptures)[number]>();
        for (const m of legalCaptures) {
            if (!byDestination.has(m.to)) byDestination.set(m.to, m);
        }
 
        const outcomes: TokenOutcome[] = [];
        for (const m of byDestination.values()) {
            const needsPromo = m.piece === "p" && (m.to[1] === "8" || m.to[1] === "1");
            if (!needsPromo) {
                const branch = cloneChess(chess);
                branch.move({ from: m.from, to: m.to });
                outcomes.push({ kind: "applied", chess: branch, underpromotion: false });
                continue;
            }
            for (const promotion of PROMOTION_PIECES) {
                const branch = cloneChess(chess);
                try {
                    branch.move({ from: m.from, to: m.to, promotion });
                    outcomes.push({ kind: "applied", chess: branch, underpromotion: promotion !== "q" });
                } catch {
                    // illegal for this particular promotion piece — ignore just this option
                }
            }
        }
        return outcomes.length > 0 ? outcomes : [{ kind: "skipped" }];
    }

    return [{ kind: "skipped" }];
}

export function parseUciBranches(input: string): ParseUciResult {
    const tokens = tokenize(input);
    let branches: BranchState[] = [{ chess: new Chess(), skipped: [], underpromotions: 0 }];
 
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const next: BranchState[] = [];
 
        for (const branch of branches) {
            const outcomes = applyToken(branch.chess, token);
            for (const outcome of outcomes) {
                if (outcome.kind === "applied") {
                    next.push({
                        chess: outcome.chess,
                        skipped: branch.skipped,
                        underpromotions: branch.underpromotions + (outcome.underpromotion ? 1 : 0),
                    });
                } else {
                    next.push({
                        chess: branch.chess,
                        skipped: [...branch.skipped, { token, ply: i + 1 }],
                        underpromotions: branch.underpromotions,
                    });
                }
            }
        }
 
        // if branch > 25, Delete the branch with less move flow.
        if (next.length > MAX_BRANCHES) {
            next.sort((a, b) => b.chess.history().length - a.chess.history().length);
            next.length = MAX_BRANCHES;
        }
 
        branches = next;
    }
 
    const results: BranchResult[] = branches.map((b) => ({
        sanHistory: b.chess.history(),
        pgn: pgnMoveText(b.chess),
        skipped: b.skipped,
        appliedCount: b.chess.history().length,
        totalTokens: tokens.length,
        underpromotions: b.underpromotions,
    }));
 
    const seen = new Set<string>();
    const deduped = results.filter((r) => {
        if (seen.has(r.pgn)) return false;
        seen.add(r.pgn);
        return true;
    });
 

    deduped.sort((a, b) => b.appliedCount - a.appliedCount || a.underpromotions - b.underpromotions);
    return { branches: deduped };
}