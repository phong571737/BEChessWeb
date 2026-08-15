# 06. API REST

## REST surface

The backend exposes a small HTTP surface mounted from [backend/src/server.ts](../backend/src/server.ts):

- `/moves`
- `/games`
- `/boards`
- `/auth`

The root service also exposes a simple health endpoint.

### `POST /games/recover`

Converts a public FEN timeline into a PGN by forwarding it to the internal
`recover-service` sidecar. The endpoint is rate-limited and does not require
login because it powers the Paste page. The request contains `fenHistory`
(one FEN per position), with optional `startFen` and PGN headers. The response
contains `pgn`, `fullyRecovered`, `failedPlies`, and `longestRecoveredPly`.
The backend fixes the forwarded recovery attempt count at `nRetry: 5`; browser
callers do not select that service parameter.

### `GET /games/history/:id/recovered-pgn`

Rebuilds a saved review record through the Python `recover_service` using its
persisted ordered `fenHistory` and `initialFen`. The endpoint returns the
original FEN timeline together with recovery branches and their step metadata.
Move Review keeps the original board on that FEN timeline; each recovered
branch is independently rebuilt from its generated PGN. It returns `503` when
the sidecar is unavailable, `504` when recovery times out, and `422` with
`RECOVERY_BRANCH_LIMIT` when candidate generation exceeds the configured
branch limit. A missing FEN history also returns `422`.
Invalid input returns `400`. If the sidecar is unavailable, the backend uses
the local unchecked FEN renderer so the user still receives a PGN; unresolved
transitions are represented as `x` and listed in `failedPlies`.

## Route map

### MQTT game commands

The backend listens on `chess/<boardID>/command` for trusted device/app lifecycle commands. Restart is not accepted as a value on `chess/<boardID>/status`; that topic is reserved for `online` and `offline` connectivity:

- `{"command":"restart_game"}` resets the active game in place. `{"command":"restart_game_esp"}` evaluates a game with at least two plies using backend Stockfish; a clear advantage (at least ±150 cp) or mate score finalizes the old game and creates the next waiting game. If the result cannot be confirmed, the old session is still finalized with `Result: "*"`, `historyStatus: "finished"`, and `outcomeStatus: "unconfirmed"` (shown as “Winner unconfirmed” / “Không xác nhận được bên thắng”), then the next waiting game is created. The normal `historyStatus: "active"` / “In progress” state is reserved for games that have moves but have not been resigned, drawn, or restarted.
- `{"command":"resign","side":"white"}` or `{"command":"resign","side":"black"}` records the corresponding resignation.
- `{"command":"draw"}` records a draw.

Resign and draw are processed atomically and create the next waiting game for the board. An optional `requestId` is scoped to the board and suppresses duplicate delivery for 15 seconds in backend memory. The MongoDB resignation claim independently prevents concurrent writes to the same old game; callers should still generate a unique request ID for each intentional command.

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
- `user` — object with `id`, `username`, `email`, `role`, and `isAdmin`

### `POST /auth/login`

Authenticates an existing user.

Request body:

- `email` — registered email
- `password` — plain text password

Returns:

- `token` — JWT token valid for 7 days
- `user` — object with `id`, `username`, `email`, `role`, and `isAdmin`

## `/games`

### `GET /games/current`

Returns active games used by the homepage grid.

### `GET /games/history`

Returns active and finished PGN review snapshots that are not in the recycle bin.

### `GET /games/history/:id/fen-text`

Downloads the selected history record's FEN timeline as a plain-text attachment.
The response contains the record ID, starting FEN, and one numbered persisted FEN
position per line, for example:

```text
# id: game_0001
# start_fen: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1

1. rnbqkbnr/pppppppp/8/8/8/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1
```

The route accepts either a history document `_id` or a live `gameID` and returns
`404` when no matching record exists.

### `POST /games/history/:id/analysis`

Authenticated users can save the bounded, browser-generated Stockfish move analysis for one history record. The request requires an `Authorization: Bearer <JWT>` header and contains `{ moves, depth }`. It replaces the prior saved analysis for that record; it does not change the game PGN, board state, or result. A valid request may include `unavailable` rows with depth `0` and null evaluations when a persisted physical-board position cannot be reconstructed safely.

### `POST /games/history/:id/fens`

Administrator-only. Appends a validated six-field chess FEN to the end of the
history record. The JSON body is `{ "fen": "..." }`. Invalid positions return
`400` with code `INVALID_FEN`; concurrent history edits return `409`.

### `PUT /games/history/:id/fens/:index`

Administrator-only. Replaces the zero-based FEN snapshot at `index` with the
validated FEN in `{ "fen": "..." }`. PGN, UCI history, timing, and result are
not rewritten. Saved Stockfish analysis is cleared because it belongs to the
previous position sequence.

### `DELETE /games/history/:id/fens/:index`

Administrator-only. Removes the zero-based FEN snapshot at `index` from the
visible history record. The operation deliberately leaves PGN, UCI history,
move timing, and the result unchanged. It clears saved Stockfish analysis
because that analysis was calculated from the previous FEN sequence. The
update compares the complete stored array before writing, so two concurrent
administrator corrections cannot silently overwrite each other; a stale edit
returns `409 Conflict` and must be retried after reloading the record.

### `GET /games/history/trash`

Administrator-only. Returns soft-deleted history records that can still be restored.

### `DELETE /games/history/:id`

Administrator-only. Moves a history record to the recycle bin for 30 days instead of deleting it immediately.

### `POST /games/history/:id/restore`

Administrator-only. Restores a history record from the recycle bin before its TTL expiry.

### `DELETE /games/history/:id/permanent`

Administrator-only. Permanently deletes a history record, but only if it is already in the recycle bin. The action cannot be restored.

### `DELETE /games/history/trash/permanent`

Administrator-only. Permanently deletes every record currently in the recycle bin; it does not delete visible history rows.

### History timing

The first accepted move records `startedAt`. Each subsequent accepted move updates `lastMoveAt` and `durationSec`, and game finalization stores `endedAt` and the final duration in the same history document.

### `GET /games/:id`

Returns a single game snapshot.

### `POST /games/:id/pgn`

Administrator-only. Updates PGN content and restores engine state from the updated document.

### `POST /games/:id/restart`

Resets the existing game in place. The `gameID`, board association, player names, and persisted clock configuration are retained; FEN returns to the standard start position and PGN/moves/branches/results are cleared. The board returns to `checkinit` and must pass a fresh physical-board initialization check before play resumes. Connected clients receive a `game:reset` event with the retained clock configuration.

Requires a valid bearer JWT from either the `user` or `admin` role. When the MQTT broker is connected, the backend also publishes `{"command":"restart_game"}` to `chess/<boardID>/command` so the associated ESP32 resets its local board. The API still returns a successful game reset when MQTT is temporarily unavailable; `boardResetPublished` indicates whether the command was accepted by the broker client.

### `POST /games/:id/destroy`

Administrator-only. Removes a game from memory and DB.

### `POST /games/:id/resign`

Ends the game with a result tag and creates a new game for the same board. Requires a valid bearer JWT from either the `user` or `admin` role.

### `POST /games/:id/reset`

Administrator-only alias for the same in-place restart service.

### `POST /games/:id/rename`

Updates player names and emits the update to the socket room. This route requires an `Authorization: Bearer <user-or-admin JWT>` header, so both authenticated roles may edit player names, time control, increment, round, and location.

Request body:

- `color`: `"White"` or `"Black"`
- `name`: new player name
- optional `initialTimeMs`: initial clock time per side in milliseconds; greater than zero and no more than 24 hours
- optional `incrementMs`: increment per move in milliseconds; between zero and one hour

If clock fields are provided, they are persisted to the game document and included in the `game:renamed` room event. When the base time changes during an active game, connected clients preserve each side's elapsed time by applying the difference between the old and new base time; for example, a 10-minute clock with 4 minutes elapsed becomes 26 minutes when changed to 30 minutes. Missing/invalid credentials receive `401`.

`GET /games/history` enriches incomplete legacy snapshots from the matching live game document by `gameID`. This restores available names, PGN, UCI/FEN move history, and clock metadata without rewriting completed history. A record that retains only a move count has no move sequence and cannot be converted into an exact PGN.

Administrators can empty only the recycle bin permanently with `DELETE /games/history/trash/permanent`. This operation requires an administrator bearer token and is intentionally subject to the destructive-operation rate limit.

### `POST /games/:id/endgame`

Administrator-only. Completes the final PGN entry in `game_history`.

### `GET /games/:id/initcheck`

Returns the latest initialization-check state for the board.

### `PUT /games/:id/update`

Administrator-only. Finalizes PGN-backed data mutation for a game.

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
