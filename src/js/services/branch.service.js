import { activeBranches, gameSeq, games } from "../game/game.repository.js";
import { ChessService } from "./chess.service.js";
import { buildResponse } from "../utils/chess.utils.js";
import { printBranches } from "../utils/debug.branch.js";
import { MOVE_TYPE } from "../constant.js";
import { Chess } from "chess.js";

// Get longest branch 
function getLongestBranch(branches) {
    if (!branches || branches.length === 0) return null;
    return branches.reduce((longest, b) => 
        b.step > longest.step ? b : longest
    , branches[0]);
}

// Sync main game according to the longest branch
function syncMainToLongest(gameID, mainGame, branches) {
    const longest = getLongestBranch(branches);
    mainGame.loadPgn(longest.pgn);
    games.set(gameID, mainGame);
    return longest;
}

export function handleBranchMove(gameID, mainGame, candidates, seq, moveType) {
    console.log(`Resolving branches for game ${gameID}`);

    const currentBranches = activeBranches.get(gameID); // get branch that current
    // find all moves llegal for current candidate
    let validMoves = ChessService.findValidMove(mainGame, candidates);
    console.log(`valid move from: ${validMoves}`);

    // passive resolve
    if (moveType !== MOVE_TYPE.CAPTURE) {
        resolvePassiveBranches(gameID, mainGame, currentBranches, candidates, seq);
    }

    // expand branch
    if (validMoves.length != 1) {
        expandBranchMoves(gameID, mainGame, currentBranches, candidates, seq, moveType, validMoves);
    }

    // resolve when just 1 branch 
    return finalizeBranchResolve(gameID, mainGame, candidates, seq);
}

function finalizeBranchResolve(gameID, mainGame, candidates, seq) {
    // validMoves === 1, resolve
    const result = resolveBranches(gameID, mainGame, candidates);
    //branch move cosumed successfully
    gameSeq.set(gameID, seq);

    // resolve
    if (result.resolved) {
        const resolvedGame = new Chess();
        resolvedGame.loadPgn(result.pgn);
        games.set(gameID, resolvedGame);
        activeBranches.delete(gameID);

        return buildResponse(gameID, resolvedGame, seq, {
            lastMove: result.lastMove,
            resolvedMove: result.resolvedMove,
        });
    }

    return buildResponse(gameID, mainGame, seq, {
        ambiguity: result.ambiguity,
        branches: result.branches,
        lastMove: result.lastMove
    });
}

// Expand branch on a branch
function expandBranchMoves(gameID, mainGame, currentBranches, candidates, seq, moveType, validMoves) {
    const expandBranches = [];
    const fromSq = candidates[0]?.slice(0, 2);
    const isIllegal = validMoves.length === 0;

    // loop for all current branch
    for (const branch of currentBranches) {
        const tempGame = new Chess();
        tempGame.loadPgn(branch.pgn);

        let validCandidates = candidates;

        if (isIllegal && fromSq) {
            if (moveType === MOVE_TYPE.CAPTURE) {
                validCandidates = tempGame.moves({ square: fromSq, verbose: true })
                    .filter(m => m.flags.includes('c') || m.flags.includes('e'))
                    .map(m => m.from + m.to);
            } else {
                // validCandidates = candidates;
                validCandidates = tempGame
                    .moves({ square: fromSq, verbose: true })
                    .map(m => m.from + m.to);
            }
        }

        // find all the validated moves from new move
        const branchvalidMoves = ChessService.findValidMove(tempGame, validCandidates);

        if (branchvalidMoves.length === 1) {
            // just have 1 valid move
            const clone = new Chess();
            clone.loadPgn(branch.pgn);
            executeMove(clone, branchvalidMoves[0]);

            expandBranches.push({
                ...branch,
                pgn: clone.pgn(),
                fen: clone.fen(),
                lastApplied: branchvalidMoves[0],
                step: branch.step + 1,
            });
        }
        else if (branchvalidMoves.length > 1) { // There are many valid moves
            for (const mv of branchvalidMoves) {
                const clone = new Chess();
                clone.loadPgn(branch.pgn);
                executeMove(clone, mv);

                expandBranches.push({
                    ...branch,
                    id: `${branch.id}_${mv.from}${mv.to}`,
                    pgn: clone.pgn(),
                    fen: clone.fen(),
                    lastApplied: mv,
                    step: branch.step + 1,
                });
            }
        }
        else {
            //validMoves = 0, create from dep square
            // const fromSq = candidates[0]?.slice(0, 2);
            // const movesFromSq = fromSq
            //   ? tempGame.moves({square: fromSq, verbose: true})
            //   : [];

            // for (const mv of movesFromSq) {
            //   const clone = new Chess();
            //   clone.loadPgn(branch.pgn);
            //   executeMove(clone, mv);

            //   expandBranches.push({
            //     ...branch,
            //     id: `${branch.id}_ill_${mv.from}${mv.to}`,
            //     pgn: clone.pgn(),
            //     fen: clone.fen(),
            //     lastApplied: mv,
            //     fromIllegal: true,
            //     step: branch.step + 1,
            //   });
            // }
            // Hold root branch, don't remove
            console.log(`Branch ${branch.id} invalid for this move, holding...`);
            expandBranches.push(branch);
        }
    }

    const seen = new Set();
    const dedupedBranches = expandBranches.filter(b => {
        if (seen.has(b.fen)) return false;
        seen.add(b.fen);
        return true;
    });

    // Check move for all branch
    const anyUpdated = dedupedBranches.some(b => 
        currentBranches.find(old => old.id === b.id && old.fen !== b.fen)
    );

    // move wrong for all branch
    if (!anyUpdated) {  
        console.log(`All branches invalid for this move, skipping`);
        activeBranches.set(gameID, currentBranches);
        gameSeq.set(gameID, seq);

        const longest = syncMainToLongest(gameID, mainGame, currentBranches); 

        return buildResponse(gameID, mainGame, seq, {
            ambiguity: true,
            branches: currentBranches.length,
            lastMove: longest[0].lastApplied ?? null,
            invalidMove: true,
        });
    }

    // 1 branch => resolve 
    const updatedBranches = dedupedBranches.filter(b =>
        currentBranches.find(old => old.id === b.id && old.fen !== b.fen)
    );

    if (updatedBranches.length === 1) {
        const finalBranch = dedupedBranches[0];
        mainGame.loadPgn(finalBranch.pgn);
        activeBranches.delete(gameID);
        gameSeq.set(gameID, seq);
        return buildResponse(gameID, mainGame, seq, {
            lastMove: finalBranch.lastApplied,
        });
    }

    // Many branch => hold all
    activeBranches.set(gameID, dedupedBranches);
    printBranches(gameID);
    // gameSeq.set(gameID, seq);
    const longest = syncMainToLongest(gameID, mainGame, dedupedBranches);

    return buildResponse(gameID, mainGame, seq, {
        ambiguity: true,
        branches: dedupedBranches.length,
        lastMove: longest.lastApplied ?? null,
    });
}

// Resolve all branch 
function resolvePassiveBranches(gameID, mainGame, currentBranches, candidates, seq) {
    const nextBranches = [];

    for (const branch of currentBranches) {
        const tempGame = new Chess();
        tempGame.loadPgn(branch.pgn);

        const branchValidMoves = ChessService.findValidMove(tempGame, candidates);

        if (branchValidMoves.length === 1) {
            const clone = new Chess();
            clone.loadPgn(branch.pgn);
            executeMove(clone, branchValidMoves[0]);

            nextBranches.push({
                ...branch,
                pgn: clone.pgn(),
                fen: clone.fen(),
                lastApplied: branchValidMoves[0],
                step: branch.step + 1,
            });
        } else {
            // hold branch
            nextBranches.push(branch);
        }
    }

    // Dedup theo fen
    const seen = new Set();
    const dedupedBranches = nextBranches.filter(b => {
        if (seen.has(b.fen)) return false;
        seen.add(b.fen);
        return true;
    });

    gameSeq.set(gameID, seq);

    // Resolve if has just 1 branch
    if (dedupedBranches.length === 1) {
        const finalBranch = dedupedBranches[0];
        mainGame.loadPgn(finalBranch.pgn);
        activeBranches.delete(gameID);
        games.set(gameID, mainGame);

        return buildResponse(gameID, mainGame, seq, {
            lastMove: finalBranch.lastApplied,
        });
    }

    activeBranches.set(gameID, dedupedBranches);
    printBranches(gameID);

    const longest = syncMainToLongest(gameID, mainGame, dedupedBranches);

    return buildResponse(gameID, mainGame, seq, {
        ambiguity: true,
        branches: dedupedBranches.length,
        lastMove: longest.lastApplied ?? null,
    });
}

// This function is resolve ambiguous branches with the lastest move
export function resolveBranches(gameID, mainGame, candidates) {
    const branches = activeBranches.get(gameID) || [];
    const nextBranches = []; // loop all branch

    // Loop through all of branches
    for (const branch of branches) {
        let match = false; // flag to check wheather branch valid or not

        // Loop through all of candidates
        for (const uci of candidates) {
            const move = parseUCI(uci)

            try {
                const temp = new Chess();
                temp.loadPgn(branch.pgn);

                // if branch match, continue
                if (temp.move(move)) {
                    nextBranches.push({
                        ...branch,
                        pgn: temp.pgn(),
                        fen: temp.fen(),
                        branchMove: branch.lastApplied,
                        lastApplied: {
                            ...move,
                            uci: formatUCI(move.from, move.to, move.promotion)
                        },
                        step: branch.step + 1
                    });
                    match = true;
                    break;
                }
            } catch { }
        }

        // branch illegal (hold, not remove)
        if (!match) {
            nextBranches.push(branch);
        }
    }

    // update branch 
    activeBranches.set(gameID, nextBranches);
    printBranches(gameID);

    // Commit when just one branch valid
    if (nextBranches.length === 1) {
        const finalBranch = nextBranches[0];

        mainGame.loadPgn(finalBranch.pgn);
        activeBranches.delete(gameID);

        return {
            status: MOVE_STATUS.OK,
            resolved: true,
            fen: mainGame.fen(),
            pgn: mainGame.pgn(),
            lastMove: finalBranch.lastApplied,
            resolvedMove: finalBranch.branchMove,
        };
    }

    // ambigous
    return {
        ambiguity: true,
        branches: nextBranches.length,
        lastMove: nextBranches.find(b => b.lastApplied)?.lastApplied ?? null
    };
}