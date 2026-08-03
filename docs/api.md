# Backend API Reference

## Base server

The backend server starts in `src/js/server.ts` and mounts the following route groups:

- `/moves` – move submission API
- `/games` – game lifecycle, history, and board initialization endpoints
- `/boards` – board creation and initial board verification

The root path `/` returns a simple health-style JSON payload, and `/health` returns `OK`.

## Route groups

### Move route

Path: `/moves`

- `POST /moves` – submits a move payload for processing by `MoveController.handleMove`
- `GET /moves` – lightweight read endpoint returning a descriptive message

Process flow:

- The controller delegates to `MoveService.processMove`
- The service resolves the active game by `boardID`
- The move is normalized for either HALL or NFC board mode
- The server updates the in-memory chess game, saves state, and emits a socket event

### Board route

Path: `/boards`

- `POST /boards` – create a new board/game pair
- `GET /boards` – retrieve current board-related data
- `POST /boards/:id/initcheck` – verify the current physical board layout against the expected initial setup

Key responsibilities:

- board scan creation
- board readiness validation
- initialization status state tracking for the frontend

### Game route

Path: `/games`

- `GET /games/current` – fetch active game snapshot data
- `GET /games/history` – fetch finished or historical game records
- `DELETE /games/history/:id` – remove a game history record
- `GET /games/:id` – fetch a single game document
- `POST /games/:id/pgn` – update PGN content and restore the in-memory state
- `POST /games/:id/restart` – restart a game
- `POST /games/:id/destroy` – destroy a game session
- `POST /games/:id/resign` – resign or end a game with a result tag
- `POST /games/:id/reset` – reset the board/game state
- `POST /games/:id/rename` – rename players
- `POST /games/:id/endgame` – finalize a game record in the PGN history collection
- `GET /games/:id/initcheck` – retrieve the current initialization-check status
- `PUT /games/:id/update` – update finished-game metadata

## Controller roles

### `BoardController`

Handles:

- game creation from board scan input
- board lookup
- board initialization verification using HALL or NFC board formats

### `GameController`

Handles:

- current game retrieval
- history retrieval
- deletion of game history rows
- init-check state lookup

### `MoveController`

Handles:

- move submission
- HTTP error wrapping for move processing failures

## Persistence model

The MongoDB layer uses:

- `games` collection for active game state and current snapshots
- `game_history` collection for finished PGN-based records

The `saveGame` helper updates the current game document using `$set` and `$push` patterns, with `createdAt` and `updateAt` metadata.

## WebSocket events

The backend Socket.IO service is initialized in `src/js/sockets/index.ts` and extended by `game.socket.ts`.

Main socket events:

- `join` – client joins a room scoped to a `gameID`
- `request_current_game` – client asks the server to restore a game state
- `resign` – someone resigns, and the room receives a game update
- `restart` – a client requests restart and the room is notified
- `disconnect` – clean disconnect handling

## MQTT role

MQTT is configured through `mqtt.service.ts` and listens on `chess/+/status`.

Observed board statuses include:

- `online`
- `offline`
- `restart`

The service cleans up stale physical-board sessions and emits live socket notifications to the frontend.
