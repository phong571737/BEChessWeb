# Frontend Application Guide

## Application entry points

The frontend is a Next.js 16 App Router project.

### Primary routes

- `/` – home page showing the active game grid
- `/board` – multi-slot board review interface
- `/paste` – PGN paste/import workflow
- `/played` – game history and review interface
- `/login` – user login page
- `/register` – user registration page

## UI structure

### App-level layout

The app shell and top-level navigation are built in the `components/layout` area.

### Board experience

Board-specific components live in `components/board` and handle:

- layout switcher
- board slot selection
- board view rendering
- evaluation bar
- game action controls
- PGN table display

### Home experience

The home page uses `components/home` and presents:

- active game cards
- empty-state messaging
- dialog-based game start flow
- physical board cards

### Imported-game experience

The `components/import-game` area supports PGN parsing and paste workflows.

### Played-game experience

The `components/played` area supports game review, history, match analysis, and PGN modal display.

## State management

The frontend uses Zustand with `useGameStore` in `frontend/lib/store.ts`.

State domains include:

- `activeGames` for home page game summaries
- `physicalBoards` for board presence and board status
- `boards` for per-game board state on the board page

## Main hooks

### `useActiveGames`

Fetches the current active game list and listens to socket events to refresh the list when games are created, destroyed, or moved.

### `useGame`

Loads a single game into view state, manages branch selection, handles board initialization polling, processes socket move events, and exposes restart/resign actions.

### `useStockfish`

Used for evaluation and engine-related game analysis.

## Runtime connection strategy

The frontend connects to the backend through:

- REST fetches for active games, history, and game documents
- socket.io-client for real-time movement and room join events
- `getApiUrl()` to infer the backend host, especially in LAN/local/VPN environments

## Data flow on the board page

1. A `gameID` is selected from the URL query.
2. The board page resolves the slot layout and active game set.
3. `useGame` loads or restores the FEN/PGN of that game.
4. Socket events update board live state.
5. Branch selection and `selectedBranchId` determine which PGN is shown in the current view.

## Design notes

- The interface is strongly real-time and optimistic on updates.
- Branch-aware review is a first-class part of the UX for ambiguous moves.
- The state store is normalized per `gameID`, which keeps board pages efficient and isolated.
