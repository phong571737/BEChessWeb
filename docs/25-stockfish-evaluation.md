# 25. Stockfish Evaluation

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

- Live board analysis is optional and controlled independently for each displayed board.
- Live evaluation uses one browser worker at depth 16 so interactive navigation remains responsive.
- Historical Move Review uses a separate browser worker at depth 14, a one-second search budget per position, and a five-second safety timeout.
- Engine output is advisory UI data, not chess-state truth. A later engine version, different depth, or different time budget can legitimately produce another score.
- Historical analysis does not have to be written to MongoDB before the statistics, accuracy cards, chart, details, annotations, or evaluation bar can render.

## Historical move analysis

Move Review analyzes the source selected by that browser tab automatically. It does not require authentication, an Analyze button, or a successful database write.

The source priority is:

1. For the original source, use `fenHistoryEdited` when an administrator has created it; otherwise use the immutable electronic-board `fenHistory`.
2. For a recovered branch, use that branch's own recovered FEN sequence.
3. Do not substitute `uciHistory` or PGN for the selected FEN source during Stockfish analysis.

The runtime data flow is:

```text
selected review source
  -> PGNReviewContent builds analysisGame
  -> MoveAnalysisPanel calls analyzeHistoryMoves
  -> each completed result is lifted to the review page
  -> review page stores analysisMoves for this browser tab
  -> MatchAnalysis, accuracy cards, chart, details, evaluation bar,
     arrows, and board annotations consume the same analysisMoves
```

The callback is still named `onAnalysisSaved` for compatibility with existing component wiring. Its name does not imply that the result was persisted. `game.analysis.moves` is only an initial fallback/cache when a record already contains analysis; live results from the selected source take precedence.

Switching source immediately clears the previous source's analysis before the new run begins. This prevents a recovered branch from temporarily displaying the original source's statistics or annotations.

The analyzer compares adjacent FEN snapshots. It deliberately does not trust legacy PGN or UCI tokens when deciding which move was played. A transition that cannot be represented as one legal chess move is retained as **Unavailable**, while later transitions continue to be analyzed. One damaged snapshot therefore does not zero the whole report.

Each completed record contains the ply number, SAN and UCI move inferred from the two FEN positions, Stockfish best move, principal variation of up to eight UCI moves, scores before and after from White's perspective, centipawn loss, classification, and search depth.

Post-game analysis uses depth 14 with a one-second move-time budget and a five-second safety timeout for each position. If a worker fails or times out, it is replaced and the same valid position is retried once with depth capped at 10. Results are cached only for the lifetime of the mounted review component, so separate visitors may select and analyze different branches without overwriting one another.

When analysis is available, Move Review renders an interactive advantage chart from the after-move evaluation. Selecting a chart point or a labeled move synchronizes the board, move list, and detail panel at that ply. The detail panel shows the played move, Stockfish best move, evaluation, and principal variation. Evaluation display is capped visually at +/-12 pawns so a mate does not flatten every non-mate point; engine scores remain unchanged in the analysis records.

Labels are informative rather than official engine proof: matching the engine move is **Best**; a best move that satisfies the project's sacrifice heuristic can be marked **Brilliant**. Other moves use centipawn-loss bands: Excellent (`<=20`), Good (`<=50`), Inaccuracy (`<=100`), Mistake (`<=250`), and Blunder (`>250`).

## Accuracy formula

The accuracy cards use the project's previous Lichess-style win-percentage
formula. They do not use ACPL as the aggregate score, and captures, checks,
or move labels do not directly affect accuracy.

First, Stockfish's centipawn score is bounded to `[-1000, 1000]` and converted
to White's expected winning percentage:

```text
boundedCp = clamp(cp, -1000, 1000)
winPercent(cp) = 50 + 50 × (2 / (1 + exp(-0.00368208 × boundedCp)) - 1)
```

For every analyzed move, the before/after evaluations are converted to the
mover's perspective. Black's values are mirrored (`100 - whitePercent`). The
loss and move accuracy are then:

```text
loss = max(0, moverBefore - moverAfter)
moveAccuracy = clamp(
  103.1668 × exp(-0.04354 × loss) - 3.1669,
  0,
  100
)
```

The game-level score is calculated separately for White and Black. A local
window of `clamp(floor(moveCount / 10), 2, 8)` positions is used for each
move. Its weight is the local win-percentage standard deviation, clamped to
`[0.5, 12]`. For each side, the final accuracy is the average of:

1. the weighted arithmetic mean of that side's move accuracies; and
2. the harmonic mean of those move accuracies.

Moves without both before and after evaluations are excluded. If a side has
no analyzable moves, the UI displays an unavailable value rather than `0%`.
This is a transparent project approximation of Lichess-style accuracy; it is
not claimed to reproduce Chess.com's private formula.

## Backend result adjudication

The backend Stockfish instance used for the side-less physical-board `resign` request uses a fixed depth of 16 (`go depth 16`) so the winner decision is reproducible across machines. It has an eight-second safety timeout; a timeout or invalid position is treated as **Unconfirmed** rather than inventing a winner. This adjudication is separate from browser Move Review and does not alter the FEN/PGN trace.
