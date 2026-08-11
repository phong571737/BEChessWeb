# 11. Components

## Frontend UI taxonomy

The frontend is organized around feature areas rather than a single monolithic page tree.

The components are grouped into:

- `home` – dashboard of current games
- `board` – board page and move visualization components
- `played` – history and review UI
- `layout` – app shell and navigation
- `providers` – context providers for socket and theme
- `import-game` – board or game import entry points
- `ui` – design-system primitives

## Core page-level components

### `app-shell`

The app shell is the global layout wrapper. It provides:

- navigation
- locale/theme switching
- shell-level context composition

### `game-grid`

The game grid shows current game cards. It is driven by `useActiveGames` and the Zustand `activeGames` collection. A physical board with an existing active, waiting, or initialization session opens that same game; it does not reopen the start-game dialog after an ESP restart.

### `board-view-slot`

This is the primary chessboard display slot component. It is responsible for rendering a board state connected to the live `fen` and `pgn` data from the store.

### `game-panel`

Provides the interaction and control panel for game activities such as restart, resign, and branch actions. Its vertical order is the first player/clock, wide move-navigation controls, PGN move list, second player/clock, then restart and resign actions. Player sections are deliberately separated so the two clocks are never adjacent; player names and clock values use enlarged, readable type. Flipping the board also swaps the player/clock sections, matching the board orientation; the PGN table uses a larger move font for readability. Restart, resign, and live setup controls are rendered for signed-in users, and the backend accepts these persistent mutations from either `user` or `admin` JWTs. The setup control edits both player names, the base time, increment, selected game number (round), and playing location.

Home-page mini boards intentionally do not highlight the last move, keeping the active-game overview visually neutral. Last-move highlighting is retained on the full board and move-review views.

### `pgn-table`

The move list follows the newest move while the live board is being viewed. It scrolls the ScrollArea viewport itself rather than the browser page, so the current move stays visible even when PGN arrives before its FEN timeline. Navigating to a historical move stops this follow-latest behavior and keeps the selected move centered instead.

Displays the move sequence in PGN form with branch awareness.

### `eval-bar`

Shows engine or evaluation metadata when present in the board state. Its responsive breakpoint matches the full board's two-column layout: from `sm` upward it stays vertically beside the board; only phone-width layouts render the horizontal bar below the board.

### `chess-board-view`

The shared board accepts an optional `moveAnnotation` containing a destination square, Stockfish classification, and localized accessible label. It supplies a custom square renderer to `react-chessboard`, keeps each square positioned relatively, and overlays the Lichess-style NAG mark in the destination square's top-right corner. Board marks use larger opaque semantic colors, a contrasting border, background ring, and shadow so they remain legible over either a chess piece or square color. Only Move Review passes this property, so live-board behavior is unchanged.

### `match-analysis`

Renders the review-page Stockfish summary directly from the persisted `analysis.moves` records. It counts Brilliant, Best, Excellent, Good, Inaccuracy, Mistake, and Blunder labels for White and Black from the saved ply number, then compares both sides in a grouped vertical bar chart. It does not reparse legacy PGN/FEN data or present rule-event counts as engine analysis. When no saved engine analysis exists, it renders a safe empty state.

### `move-analysis-panel`

Provides authenticated-user-triggered Stockfish analysis for a History review. It prioritizes persisted FEN snapshots, then rebuilds a legal prefix from UCI history and the initial FEN, and finally uses valid standard PGN. The panel stores one row per persisted ply. Saved classifications use Lichess-style standard NAG marks: `?!` for an inaccuracy, `?` for a mistake, and `??` for a blunder. Positive project-specific classifications use their standard chess annotations (`!!`, `!`, and `!?`). The colored mark is overlaid on the move's destination square; it is not repeated in the move list. That list instead shows the persisted thinking time for each ply. A malformed or custom-device move is rendered with the localized **Unavailable** / **Không khả dụng** label rather than preventing the rest of the history from being saved. Null engine scores are omitted from the advantage chart instead of being rendered as a false `0.0` evaluation.

### `paste-game`

Provides the UCI-to-PGN import workflow on `/paste`. It uses the shared page/card visual language: standard page header, token-driven surfaces and borders, compact controls, selected quick presets, and matched-height responsive input/preview panels without page-specific hero layout. Its icon language is contextual and consistent: file/clipboard for import, scroll/file output for PGN, git-fork for branches, and swords for move counts.

## Provider components

### `SocketProvider`

Creates the socket client and makes it available through React context.

This is the front door for all live browser-side updates.

### `ThemeProvider`

Wraps the app with theme settings used for dark/light styling.

## UI primitives

The `ui` folder contains reusable building blocks such as:

- `button`
- `card`
- `badge`
- `dialog`
- `input`
- `separator`
- `scroll-area`
- `skeleton`

These primitives are used to create consistent app-level styling and interaction behavior.

## Component responsibility boundaries

A useful mental model is:

- `hooks` fetch and subscribe,
- `store` caches and reconciles,
- `components` present state,
- `lib` contains parsing, URL resolution, and utility behavior.

This separation is visible in the board review flow where the data is loaded in hooks, transferred to the store, and rendered in components.

## Cross references

- [12-hooks.md](12-hooks.md) explains the hook layer that powers these components.
- [10-state-management.md](10-state-management.md) explains the store values consumed by board and home components.
- [13-pages.md](13-pages.md) explains the page-level entry points that host these components.
