# 05. Database

## Persistence goal

The repository uses MongoDB as its durable storage layer, but the application intentionally separates active game runtime state from persisted state.

The design choice is:

- keep active game state in memory for fast chess operations,
- persist snapshots and history for recoverability and review,
- avoid making every move a slow database round-trip.

## Database connection

The connection bootstrap logic lives in [src/js/config/database.ts](../src/js/config/database.ts).

Responsibilities:

- create a `MongoClient`,
- set the server API version,
- perform a `ping` to confirm database reachability,
- open the `chess` database handle and expose it through `getDB()`.

## Collections

### `games`

The main active/current game collection. It stores current chess documents, including:

- `gameID`
- `boardID`
- `fen`
- `pgn`
- `lastMove`
- `lastSeq`
- `WhiteName`
- `BlackName`
- `result`
- `status`
- `round`
- `uciHistory`
- `fenHistory`
- timestamps

This collection backs the active game retrieval path and supports game restore from DB.

### `game_history`

The finished-history collection. It records completed or resigned games as PGN history entries with headers and move counts.

This collection is used by the history review UI.

## Why two collections exist

A single collection would be possible, but this codebase separates:

- active state (`games`) from
- archival review state (`game_history`).

That separation supports faster active-session operations while keeping historical review queries relatively clean.

## Persistence rules

### `saveGame`

Implemented in [src/js/models/game.model.ts](../src/js/models/game.model.ts).

It performs an upsert using:

- `$set` for standard state fields
- `$setOnInsert` for `createdAt`
- `$push` for move trace history when requested

This means the game document stays current without replacing the whole doc on every chess event.

### `removeGameByBoardID`

This method is used when the system needs to discard all game records associated with a board ID. It is part of the cleanup path after board scans, restart, or MQTT offline transitions.

## Business invariants

The data model assumes:

- `gameID` is the canonical identifier for a game session.
- `boardID` links a physical board to a game.
- `lastSeq` tracks sequence position to avoid out-of-order move application.
- `uciHistory` and `fenHistory` are kept as trace structures for replay and branch reconstruction.
- `game_history` is a finalization product, not the execution source of truth.

## Cross references

- [06-api-rest.md](06-api-rest.md) explains which REST routes read and write these collections.
- [08-domain-model.md](08-domain-model.md) describes the game document shape in domain terms.
- [09-services.md](09-services.md) explains how the service layer uses the DB wrappers.
