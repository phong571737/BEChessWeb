# 06. API REST

## REST surface

The backend exposes a small HTTP surface mounted from [src/js/server.ts](../src/js/server.ts):

- `/moves`
- `/games`
- `/boards`

The root service also exposes a simple health endpoint.

## Route map

### `/moves`

#### `POST /moves`

Purpose: submit a move for processing.

Request shape:

- `boardID`
- `boardType`
- `uci` or move candidate information
- optional `fen`, `seq`, `moveType`, `departures`, `arrivals`

Responsibility:

- resolve the active game from `boardID`
- validate and normalize the move input
- execute move logic against the in-memory chess engine
- save result and emit the move event to connected clients

#### `GET /moves`

Purpose: lightweight check endpoint; returns descriptive message for browser or operator verification.

### `/boards`

#### `POST /boards`

Purpose: create a new board/game association.

Behavior:

- validates that a `boardID` exists,
- creates a new `gameID`,
- stores a new game document and board mapping,
- emits `board_scan_ok` over Socket.IO.

#### `GET /boards`

Purpose: return active board-related state for the UI.

#### `POST /boards/:id/initcheck`

Purpose: verify the physical board’s initial setup against expected layout.

This route supports two board modes:

- `NFC` board, using an object-based square map
- `HALL` board, using a 2D binary array derived from board scan data

## `/auth`

### `POST /auth/register`

Creates a new user account.

Request body:

- `username` — unique username
- `email` — unique email address
- `password` — plain text password (will be hashed)

Returns:

- `token` — JWT token valid for 7 days
- `user` — object with `id`, `username`, `email`

### `POST /auth/login`

Authenticates an existing user.

Request body:

- `email` — registered email
- `password` — plain text password

Returns:

- `token` — JWT token valid for 7 days
- `user` — object with `id`, `username`, `email`

## `/games`

### `GET /games/current`

Returns active games used by the homepage grid.

### `GET /games/history`

Returns active and finished PGN review snapshots that are not in the recycle bin.

### `POST /games/history/:id/analysis`

Administrator-only. Saves the bounded, browser-generated Stockfish move analysis for one history record. The request requires an `Authorization: Bearer <admin JWT>` header and contains `{ moves, depth }`. It replaces the prior saved analysis for that record; it does not change the game PGN, board state, or result. A valid request may include `unavailable` rows with depth `0` and null evaluations when a persisted physical-board position cannot be reconstructed safely.

### `GET /games/history/trash`

Administrator-only. Returns soft-deleted history records that can still be restored.

### `DELETE /games/history/:id`

Administrator-only. Moves a history record to the recycle bin for 30 days instead of deleting it immediately.

### `POST /games/history/:id/restore`

Administrator-only. Restores a history record from the recycle bin before its TTL expiry.

### `DELETE /games/history/:id/permanent`

Administrator-only. Permanently deletes a history record, but only if it is already in the recycle bin. The action cannot be restored.

### History timing

The first accepted move records `startedAt`. Each subsequent accepted move updates `lastMoveAt` and `durationSec`, and game finalization stores `endedAt` and the final duration in the same history document.

### `GET /games/:id`

Returns a single game snapshot.

### `POST /games/:id/pgn`

Updates PGN content and restores engine state from the updated document.

### `POST /games/:id/restart`

Resets the existing game in place. The `gameID`, board association, player names, and persisted clock configuration are retained; FEN returns to the standard start position and PGN/moves/branches/results are cleared. The board returns to `checkinit` and must pass a fresh physical-board initialization check before play resumes. Connected clients receive a `game:reset` event with the retained clock configuration.

### `POST /games/:id/destroy`

Removes a game from memory and DB.

### `POST /games/:id/resign`

Ends the game with a result tag and creates a new game for the same board.

### `POST /games/:id/reset`

Resets a game to the initial board state.

### `POST /games/:id/rename`

Updates player names and emits the update to the socket room. This route requires an `Authorization: Bearer <admin JWT>` header.

Request body:

- `color`: `"White"` or `"Black"`
- `name`: new player name
- optional `initialTimeMs`: initial clock time per side in milliseconds; greater than zero and no more than 24 hours
- optional `incrementMs`: increment per move in milliseconds; between zero and one hour

If clock fields are provided, they are persisted to the game document and included in the `game:renamed` room event. When the base time changes during an active game, connected clients preserve each side's elapsed time by applying the difference between the old and new base time; for example, a 10-minute clock with 4 minutes elapsed becomes 26 minutes when changed to 30 minutes. Missing/invalid credentials receive `401`; non-admin credentials receive `403`.

`GET /games/history` enriches incomplete legacy snapshots from the matching live game document by `gameID`. This restores available names, PGN, UCI/FEN move history, and clock metadata without rewriting completed history. A record that retains only a move count has no move sequence and cannot be converted into an exact PGN.

Administrators can empty only the recycle bin permanently with `DELETE /games/history/trash/permanent`. This operation requires an administrator bearer token and is intentionally subject to the destructive-operation rate limit.

### `POST /games/:id/endgame`

Completes the final PGN entry in `game_history`.

### `GET /games/:id/initcheck`

Returns the latest initialization-check state for the board.

### `PUT /games/:id/update`

Finalizes PGN-backed data mutation for a game.

## API design rationale

The backend favors a compact route surface rather than deeply nested resource APIs. The project is optimized for:

- a single physical board representing a live game session,
- minimal frontend complexity,
- stateful in-memory orchestration behind a thin HTTP facade.

## API contracts and business rules

The REST routes rely on several domain rules:

- `boardID` is required to create a game.
- `boardType` determines whether the move validator processes NFC or HALL input.
- `gameID` is the canonical route identifier for game-specific actions.
- A game can be restarted only if it still has a valid board association; restart never creates a replacement `gameID`.
- A resignation requests a result tag and may create a new game session after persisting the old result.

## Cross references

- [07-api-socket.md](07-api-socket.md) covers real-time event contracts.
- [08-domain-model.md](08-domain-model.md) defines the business concepts used by these endpoints.
- [09-services.md](09-services.md) explains what each route ultimately delegates to.
