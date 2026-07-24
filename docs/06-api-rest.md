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

Returns completed or archived PGN records.

### `GET /games/log`

Returns saved log data.

### `DELETE /games/history/:id`

Deletes a history record by document ID.

### `GET /games/:id`

Returns a single game snapshot.

### `POST /games/:id/pgn`

Updates PGN content and restores engine state from the updated document.

### `POST /games/:id/restart`

Creates a brand-new game alongside the same board identity.

### `POST /games/:id/destroy`

Removes a game from memory and DB.

### `POST /games/:id/resign`

Ends the game with a result tag and creates a new game for the same board.

### `POST /games/:id/reset`

Resets a game to the initial board state.

### `POST /games/:id/rename`

Updates player names and emits the update to the socket room.

Request body:

- `color`: `"White"` or `"Black"`
- `name`: new player name
- optional `clockSeconds`: initial clock time per side in seconds
- optional `clockIncrement`: increment per move in seconds

If `clockSeconds` or `clockIncrement` are provided, they are persisted to the game document.

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
- A game can be restarted only if the old game still has a valid board association.
- A resignation requests a result tag and may create a new game session after persisting the old result.

## Cross references

- [07-api-socket.md](07-api-socket.md) covers real-time event contracts.
- [08-domain-model.md](08-domain-model.md) defines the business concepts used by these endpoints.
- [09-services.md](09-services.md) explains what each route ultimately delegates to.
