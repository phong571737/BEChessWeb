# 22. Board Visuals

## Board rendering strategy

The main board component is [frontend/components/board/chess-board-view.tsx](../frontend/components/board/chess-board-view.tsx). It renders `react-chessboard` using a controlled `fen` string and custom square styles.

## Board color contract

The default Classic palette uses light square `#e8e8e8` and dark square `#7b6040`. The runtime palette is supplied by the shared board-display provider so every rendered board uses the same user preference. Six curated palettes are available, and the color picker also supports arbitrary light/dark color pairs. The active selection is persisted in browser storage.

## Move highlighting

The board can overlay highlighted squares for:

- last move
- missing pieces
- extra pieces
- wrong piece placement

The square overlays are defined via inline styles and use low-opacity colored backgrounds to visually distinguish board-state mismatches.

## Check and checkmate highlighting

`ChessBoardView` derives king threats from the piece placement rather than relying only on the active-color field in FEN. This is important for physical-board and recovered history snapshots, where the active color can be stale or the non-moving king can be absent.

- an attacked king receives the semantic `--state-check` background, inset border, glow, and pulse
- a king with no legal escape receives the stronger `--state-checkmate` treatment
- both colors are inspected, with the recorded active color taking priority when both kings appear attacked in malformed legacy data
- `chess.js` loads the snapshot with validation skipped only for display recovery; live move legality is not changed
- when no engine score is available, both desktop and mobile bars use the same `|` placeholder; an engine score replaces it with a centipawn or mate value

The UI does not trust a `+` or `#` character in recovered notation as the source of truth. The displayed board position determines whether the king is visually marked.

## Loading state

When the board has not yet measured its own width, the board view falls back to a placeholder:

- `w-full aspect-square`
- `bg-muted`
- `animate-pulse`
- `rounded-sm`
- `border border-border`

## Evaluation bar integration

The evaluation display in [frontend/components/board/eval-bar.tsx](../frontend/components/board/eval-bar.tsx) uses a chessboard-style visual pattern:

- horizontal mode: a left black bar, a right white bar, and a centered evaluation label
- vertical mode: black on top, white on bottom, with a midline separator

The bar uses `transition-[width] duration-500 ease-out` or `transition-[height] duration-500` depending on orientation.

When Flip board is enabled, both vertical and horizontal evaluation bars mirror their black/white segments and label placement to match the board orientation.

The evaluation lifecycle, UCI score perspective, mate behavior, stale-result protection, and search depth are documented in [25-stockfish-evaluation.md](25-stockfish-evaluation.md).

## Game card mini-board

The home dashboard card in [frontend/components/home/game-card.tsx](../frontend/components/home/game-card.tsx) renders a responsive mini-board that resizes using a `ResizeObserver`.

This card layout also applies:

- `rounded-lg`
- `border border-border`
- `overflow-hidden`
- `transition-all duration-150`
- hover lift and shadow behavior

## Visual takeaway

The board visuals are intentionally composed from a few shared concerns:

- explicit board square palette
- overlay highlight colors for move or validation status
- a lightweight loading skeleton
- a reusable evaluation bar with board-like proportions
