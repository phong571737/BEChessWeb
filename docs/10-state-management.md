# 10. State Management

## Overview

The repository uses two distinct state models:

1. backend runtime state, which is mutable and in-memory, and
2. frontend client state, which is cached in a Zustand store.

This split reflects the product's need for a fast live session while preserving a simple browser-side state model.

## Backend in-memory state

The backend's runtime maps are managed in the `game` layer. The most important concepts are:

- `boardID -> gameID`
- `gameID -> runtime board state`
- `gameID -> board check state`

This is required because the chess engine is stateful and must be mutated by move processing without round-tripping through MongoDB on every event.

### Game manager responsibilities

The `game.manager` module is the center of the runtime state model. It is responsible for:

- creating game sessions,
- restoring game state from database snapshots,
- obtaining the current game object for an active board ID,
- keeping the active game map up to date.

### Game state object

The game state object holds a minimal, runtime-friendly view of the board and current game session, including:

- `gameID`
- `boardID`
- `fen`
- `pgn`
- `lastMove`
- `status`
- `branches`
- `result`

The active board check results are tracked separately in the `gameState` map.

## Frontend state

The frontend uses Zustand in [frontend/lib/store.ts](../frontend/lib/store.ts).

It keeps three main collections:

- `activeGames` for home-page cards
- `physicalBoards` for board status cards and heartbeat state
- `boards` for per-game board page state

## Authentication state

Authentication state is managed via React Context in [frontend/lib/auth-context.tsx](../frontend/lib/auth-context.tsx).

It provides:

- `user` — current user object with `id`, `username`, `email`
- `token` — JWT token stored in localStorage
- `login(token, user)` — persist and set auth state
- `logout()` — clear auth state
- `isAuthenticated` — boolean flag

The token is stored in localStorage and automatically restored on page load.

## Why Zustand is a good fit here

The app is a hybrid of:

- local UI-derived state,
- fetched API state,
- socket-infused state,
- ephemeral branch selection state.

Zustand provides a simple and predictable interface for pushing patches without introducing a heavy store architecture.

## `boards` structure

Each board entry stores:

- `fen`
- `pgn`
- `WhiteName`
- `BlackName`
- `lastMove`
- `result`
- `status`
- `initStatus`
- `missingSquares`
- `extraSquares`
- `wrongPieceSquares`
- `branches`
- `selectedBranchId`
- `clockSeconds` — initial clock time per side in seconds (optional)
- `clockIncrement` — increment per move in seconds (optional)

This structure allows the board page to avoid repeatedly fetching everything from the API after a socket update. It is not a full normalized state graph; it is a per-game cached projection.

## State synchronization pattern

The frontend state sync pattern is:

1. fetch initial game state from REST,
2. load a local `Chess` engine instance from FEN or PGN,
3. subscribe to socket events,
4. patch the Zustand board entry on every move or status update.

This is why the game page feels live while still being resilient to network or page refresh events.

## Cross references

- [07-api-socket.md](07-api-socket.md) documents the events that patch the store.
- [12-hooks.md](12-hooks.md) explains the hook layer that consumes the store.
- [14-business-flow.md](14-business-flow.md) shows the same state moving through the app from scan to completion.