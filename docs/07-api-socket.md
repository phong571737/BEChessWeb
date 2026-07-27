# 07. API Socket

## Purpose

Socket.IO is the real-time transport layer for this project. It is responsible for fast, room-scoped game updates that keep the browser UI aligned with the current chess state without requiring a complete page refresh.

> In short: the REST API handles request/response commands, while Socket.IO handles live synchronization.

## Bootstrap

The server-side socket initialization lives in [src/js/sockets/index.ts](../src/js/sockets/index.ts), and the game-specific listener wiring lives in [src/js/sockets/game.socket.ts](../src/js/sockets/game.socket.ts).

The socket layer registers the following lifecycle handlers:

- `join` for room membership
- `request_current_game` for restore-on-reconnect
- `resign`, `restart`, and `disconnect` events for gameplay lifecycle control

## Room model

Every live game is broadcast within a room keyed by `gameID`.

This room-based structure gives the system three important properties:

- a board page and the browser client can share the same live game state,
- multiple clients can observe a single game at the same time,
- updates remain scoped to the relevant game instead of being broadcast globally.

## Event catalog

| Event | Direction | Meaning |
| --- | --- | --- |
| `join` | Client → Server | Adds the client socket to the game room |
| `request_current_game` | Client → Server | Requests a restore payload for a reconnect or hydration flow |
| `restore_game` | Server → Client | Returns the current FEN and last move payload |
| `esp_move` | Server → Room | Broadcasts the authoritative move outcome |
| `initcheck` | Server → Room | Broadcasts board initialization readiness information |
| `board_connected` | Server → Room | Marks a board or client session as connected |
| `update_all_game` | Server → Room | Forces clients to invalidate caches and refresh the game view |
| `game:reset` | Server → Room | Resets the current game in place while retaining its `gameID` |
| `game:renamed` | Server → Room | Propagates administrator-authorized player-name and clock-configuration changes |

## Event details

### `join`

Client behavior:

- sends `{ gameID }`
- becomes a member of that game room

Use case:

- ensures future move and state broadcasts reach the correct board view.

### `request_current_game`

Client behavior:

- asks the backend to restore the latest known game snapshot for `gameID`
- receives a `restore_game` payload in response

Payload shape:

- `gameID`
- `fen`
- `lastMove`

### `restore_game`

This event is the reconnect hydration path. It is used when the browser has to rebuild or recover the current board state after a refresh or socket reconnect.

### `esp_move`

This is the main live-move event.

It carries the authoritative post-move state, including:

- `gameID`
- `fen`
- `pgn`
- `lastMove`
- `branches`

This event is the primary feed used by the board review interface.

### `initcheck`

This event keeps the board initialization status synchronized with the physical board lifecycle. It is the socket analogue of the board verification request/response flow.

### `update_all_game`

This is a refresh-oriented event that tells connected clients to invalidate cached game data and reload the latest view after lifecycle transitions.

### `game:reset`

This room-scoped event carries `gameID`, `boardID`, the standard starting `fen`, and `resetAt`. The browser clears local move, branch, and clock state and returns to the starting position without changing the URL or game identity.

### `game:renamed`

This event is emitted only after the administrator-protected rename endpoint has persisted the update. Its payload may include `WhiteName`, `BlackName`, `initialTimeMs`, and `incrementMs`, allowing connected board pages to refresh displayed names and clock configuration without a manual reload.

## Frontend consumers

The socket provider is created in [frontend/components/providers/socket-provider.tsx](../frontend/components/providers/socket-provider.tsx).

The main consumers are:

- [frontend/hooks/use-game.ts](../frontend/hooks/use-game.ts) for the board page
- [frontend/hooks/use-active-games.ts](../frontend/hooks/use-active-games.ts) for the home dashboard
- [frontend/hooks/use-physical-boards.ts](../frontend/hooks/use-physical-boards.ts) for board-status coordination

## Frontend interpretation

From the browser side, the socket layer is used to do three things:

1. restore the board state after reconnect,
2. push live move changes into the chessboard view,
3. refresh the home dashboard or board card once a lifecycle transition happens.

## Reliability model

The socket implementation is intentionally lightweight and room-based. It does not attempt to store every event as a durable event log.

Instead, the system relies on:

- the current in-memory runtime session for authoritative live state,
- the latest REST response or persisted snapshot for recovery.

This keeps the architecture simple while still delivering responsive live gameplay.

## Cross references

- [06-api-rest.md](06-api-rest.md) explains the request/response routes that complement these socket events.
- [10-state-management.md](10-state-management.md) shows how the socket payloads are merged into the Zustand store.
- [14-business-flow.md](14-business-flow.md) describes how these events fit into the end-to-end game lifecycle.
