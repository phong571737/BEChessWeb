# 28. Stockfish Evaluation

## Scope

The main single-board page runs Stockfish 18 Lite entirely in the browser. The backend remains responsible for legal moves, durable game state, Socket.IO, and MQTT; it does not provide the live evaluation shown beside the board. Multi-board layouts deliberately disable engine analysis to avoid running several WebAssembly workers at once.

## Worker lifecycle

[use-stockfish.ts](../frontend/hooks/use-stockfish.ts) creates one worker from the public Stockfish asset only while evaluation is enabled. It sends `uci`, `ucinewgame`, and `isready`, exposes readiness to the board component, and always sends `quit` and terminates the worker during cleanup. A worker startup or message failure retries twice with a short backoff. Until Stockfish returns a score, the evaluation bar is neutral rather than showing a misleading 50/50 split; it displays an ellipsis while searching and an error indicator when the worker remains unavailable.

The board owns the search lifecycle:

1. A displayed FEN becomes the latest queued position.
2. If an older search is active, the board sends `stop` once.
3. The board waits for Stockfish's `bestmove`, which marks the prior UCI search complete.
4. It starts exactly one search for the latest queued FEN with `go depth 16`.
5. It accepts only `info` lines for `multipv 1`, and only when their depth is at least the best depth already shown for that FEN.

This prevents an `info score` line from a stopped, older position being rendered as the score of a newly selected move. Rapid move navigation therefore keeps only the newest requested FEN; intermediate positions are intentionally discarded.

## Score convention

Stockfish returns UCI scores from the perspective of the side to move. The board converts every score to White's perspective before rendering:

- White to move: keep the engine score.
- Black to move: invert the score.

Centipawn values are displayed as pawn values (`+0.6`, `−1.2`). Mate values use `#3` for White mating in three and `#−2` for Black mating in two. While a fresh position is calculating, the bar displays a neutral split and an ellipsis instead of incorrectly showing `0.0`.

## Evaluation bar behavior

[eval-bar.tsx](../frontend/components/board/eval-bar.tsx) converts a centipawn score into White's expected share with the Lichess-style logistic curve rather than a linear percentage. This gives useful visual range near equality while keeping large advantages near the end of the bar.

Forced mates are rendered as decisive 99%/1% shares instead of synthetic centipawn scores. This avoids making a forced mate look uncertain merely because the mate distance is long.

With normal orientation, vertical mode places Black at the top and White at the bottom; horizontal mode places Black at the left and White at the right. Flip board mirrors both segments and moves the score label onto the side represented by the score, matching the rendered board orientation.

## Operational limits

- Browser analysis is optional and controlled by the Evaluation bar setting.
- One worker and depth 16 favour stable interactive feedback over server cost or deep correspondence analysis.
- The UI does not persist engine scores as game truth. A later engine version or deeper search can legitimately produce a different evaluation.
- If analysis is needed for every historical move, run a separate backend job and store its version, depth, FEN, and score explicitly rather than sharing the live UI worker.

## Saved move analysis

The Move Review page and each administrator History row provide an **Analyze game** action. It uses the durable `fenHistory` and `uciHistory` snapshots first, falling back to legal PGN only when FEN history is absent. A separate browser Stockfish worker evaluates the initial position and each position after a ply at depth 14, then stores one compact analysis record on the matching `game_history` document. This allows older records with incomplete PGN notation to be analyzed directly from their saved board history. Other visitors can view a stored result but cannot overwrite it.

Each record contains the ply number, SAN and UCI move, engine best move, principal variation (up to eight UCI moves), scores before/after from White's perspective, centipawn loss, classification, and search depth. The backend validates the bounded payload and requires an admin bearer token before saving it through `POST /games/history/:id/analysis`.

Post-game analysis runs Stockfish at the requested depth ceiling with a one-second time budget per position and a five-second safety timeout. The first limit reached ends that individual search. If a worker fails or times out, it is replaced and the same valid position is retried once at a lower depth. This prevents a transient engine failure from discarding the remaining moves.

Physical-board snapshots are accepted only when they are valid standard FEN positions. A malformed or device-specific snapshot is saved with the **Unavailable** classification, no evaluation, and depth `0`; it is never fabricated as `0.0` or labeled as a good move. Analysis continues with later valid snapshots, so one incompatible stored position does not cancel the whole game.

When an analysis is available, Move Review renders an interactive advantage chart from the after-move evaluation. Selecting a chart point or a labeled move synchronizes the board, move list, and detail panel at that ply. The detail panel shows the played move, Stockfish best move, evaluation, and saved principal variation. Evaluation display is capped visually at ±12 pawns so a mate does not flatten every non-mate point; stored engine scores remain unchanged.

Labels are informative rather than official engine proof: matching the engine move is **Best**; a best move that is a capturable major-piece sacrifice with a clear advantage is marked **Brilliant**. Other moves use centipawn-loss bands: Excellent (<=20), Good (<=50), Inaccuracy (<=100), Mistake (<=250), and Blunder (>250). A re-analysis intentionally replaces the old result, so its engine version and depth remain explicit.
