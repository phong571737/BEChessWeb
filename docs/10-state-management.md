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

At backend startup it rebuilds the board-to-game map and each non-terminal chess session from MongoDB. The move endpoint also performs this recovery lazily if a board's runtime mapping is absent, so a Docker restart cannot make an ESP32 move lose its existing `gameID`.

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

### Runtime retention and cleanup

Runtime state is intentionally limited to active board sessions. Resignation, board destruction, and MQTT offline cleanup remove the corresponding chess, sequence, branch, and raw-history entries. Socket snapshot reads for a game that is not already active use a temporary `Chess` instance and do not add that game to the runtime maps.

Board states marked offline also have a 10-minute safety TTL. MQTT normally removes them after its delayed offline cleanup, while the TTL prevents stale state from remaining in memory if that cleanup is interrupted.

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
- `isAdmin` — role-derived flag used to expose administrator-only controls

The token is stored in localStorage and automatically restored on page load.

Administrator-only mutations also send this JWT in the `Authorization: Bearer <token>` header. The backend verifies the token and its `admin` role; hiding a control in the browser is therefore not the only access control.

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
- `initialTimeMs` — initial clock time per side in milliseconds (optional)
- `incrementMs` — increment per move in milliseconds (optional)

This structure allows the board page to avoid repeatedly fetching everything from the API after a socket update. It is not a full normalized state graph; it is a per-game cached projection.

The small REST cache is bounded to 100 entries and removes expired entries before reads and writes. This keeps navigation across many historical games from growing browser memory indefinitely.

## State synchronization pattern

The frontend state sync pattern is:

1. fetch initial game state from REST,
2. load a local `Chess` engine instance from FEN or PGN,
3. subscribe to socket events,
4. patch the Zustand board entry on every move or status update.

### Chess clock lifecycle

`use-chess-clock.ts` initializes both clocks from the persisted game configuration only after the game data is loaded. The clocks remain displayed but paused at their configured initial values until the first valid move is present. From that first move onward, only the active side decreases and the configured increment is applied to the side that completed a move. If an administrator changes the base time mid-game, the hook applies only the base-time difference to each remaining clock, preserving elapsed play time instead of resetting either clock.

Older game documents with second-based clock fields are converted at the frontend API boundary. Games without any clock fields use the documented 10-minute compatibility fallback.

This is why the game page feels live while still being resilient to network or page refresh events.

## Cross references

- [07-api-socket.md](07-api-socket.md) documents the events that patch the store.
- [12-hooks.md](12-hooks.md) explains the hook layer that consumes the store.
- [14-business-flow.md](14-business-flow.md) shows the same state moving through the app from scan to completion.
