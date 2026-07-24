# 24. Board Visuals

## Board rendering strategy

The main board component is [frontend/components/board/chess-board-view.tsx](../frontend/components/board/chess-board-view.tsx). It renders `react-chessboard` using a controlled `fen` string and custom square styles.

## Board color contract

The board uses explicit square colors:

- light square: `#e8e8e8`
- dark square: `#7b6040`

The same pair also appears as CSS theme tokens in [frontend/app/globals.css](../frontend/app/globals.css): `--board-light` and `--board-dark`.

## Move highlighting

The board can overlay highlighted squares for:

- last move
- missing pieces
- extra pieces
- wrong piece placement

The square overlays are defined via inline styles and use low-opacity colored backgrounds to visually distinguish board-state mismatches.

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
