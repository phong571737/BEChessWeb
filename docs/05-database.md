# 05. Database

## Persistence goal

The repository uses MongoDB as its durable storage layer, but the application intentionally separates active game runtime state from persisted state.

The design choice is:

- keep active game state in memory for fast chess operations,
- persist the accepted move and its active history snapshot for recoverability and review,
- restore the in-memory chess session from MongoDB after a process/container restart.

## Database connection

The connection bootstrap logic lives in [src/js/config/database.ts](../src/js/config/database.ts).

Responsibilities:

- create a `MongoClient`,
- set the server API version,
- perform a `ping` to confirm database reachability,
- open the `chess` database handle and expose it through `getDB()`.

## Collections

## ERD overview

MongoDB does not enforce foreign keys. The diagram therefore shows **logical** relationships: `gameID` is the durable join key across game-related collections, while `boardID` identifies the physical board that owns an active game.

```mermaid
erDiagram
    USERS {
        ObjectId _id PK
        string username
        string email UK
        string passwordHash
        string role
        date createdAt
    }

    GAMES {
        string gameID PK
        string boardID
        string whiteName
        string blackName
        string location
        string status
        number version
        string fen
        string pgn
        string_array uciHistory
        string_array fenHistory
        date startedAt
        date lastMoveAt
        number initialTimeMs
        number incrementMs
        string timeControlType
    }

    GAME_HISTORY {
        string _id PK
        string gameID
        string boardID
        string whiteName
        string blackName
        string location
        string result
        string historyStatus
        string pgn
        string_array uciHistory
        string_array fenHistory
        object analysis
        date createdAt
        date endedAt
        number initialTimeMs
        number incrementMs
        string timeControlType
        date deletedAt
        date deleteAfter
    }

    BOARD_GAME_LOCKS {
        string boardID PK
        string owner
        date leaseUntil
        date updatedAt
    }

    MOVES {
        ObjectId _id PK
        string gameID
        string boardID
        string uci
        string fen
        date createdAt
    }

    GAMES ||--|| GAME_HISTORY : "snapshot/final history by gameID"
    GAMES ||--o{ MOVES : "optional move records by gameID"
    GAMES }o--|| BOARD_GAME_LOCKS : "board creation lease by boardID"
```

### Relationship reading guide

| Relationship | Join field | Meaning |
| --- | --- | --- |
| `games` → `game_history` | `gameID` | One live game has one upserted review snapshot. The snapshot is updated after every accepted move and becomes final when the game ends. |
| `games` → `moves` | `gameID` | Optional lower-level move documents. The canonical review sequence remains `uciHistory` and `fenHistory` in the game/history records. |
| `games` ↔ `board_game_locks` | `boardID` | A short lease prevents two concurrent create-game requests from assigning the same physical board. |

`game_history._id` is normally the same string as `gameID` for new snapshots. Legacy records may use a MongoDB `ObjectId`; history read, restore, and deletion code accepts either representation.

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

The review-history collection. It receives an upserted snapshot after every accepted move, so an in-progress game is reviewable even before resignation. Changes to player names, clock settings, round, or playing location during an active game also synchronize the same snapshot immediately. Resignation finalizes that same record rather than creating a duplicate.

Both the live document and the snapshot retain PGN metadata: player names, round, location (`Site`), start date, board ID, UCI history, and FEN history. The review PGN exporter prefers these durable fields over placeholder headers such as `?` and `????.??.??` from older raw PGN text.

Clock metadata is persisted on both collections: `initialTimeMs` is the configured time per side, `incrementMs` is the per-move increment, and `timeControlType` is the derived classification (`blitz`, `rapid`, or `classical`). History readers must not infer an elapsed duration from `createdAt` to the current time when `endedAt` is missing; legacy records without a persisted `durationSec` remain unknown rather than displaying an inflated duration.

This collection is used by the history review UI.

Its optional `analysis` object stores administrator-requested Stockfish output: engine identity, depth, save timestamp, and a per-ply list of played move, best move, principal variation, evaluation, centipawn loss, and classification. A row with `classification: "unavailable"` has no engine score and uses depth `0`; it records a device move that cannot be reconstructed or evaluated without fabricating a score. Analysis never changes the authoritative PGN/FEN/UCI trace.

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

This method is used when delayed MQTT offline cleanup discards game records associated with a disconnected board ID. An in-place restart does not call this cleanup and retains the current `gameID`.

## Business invariants

The data model assumes:

- `gameID` is the canonical identifier for a game session.
- `boardID` links a physical board to a game.
- `lastSeq` tracks sequence position to avoid out-of-order move application.
- `uciHistory` and `fenHistory` are kept as trace structures for replay and branch reconstruction.
- `game_history` is a review snapshot, not the execution source of truth.
- Live and finished history snapshots preserve their original `createdAt`; MongoDB upserts apply that field only on insertion, while later updates change `updatedAt`.
- History deletion is a soft delete: records move to the recycle bin with `deletedAt` and `deleteAfter` fields.
- A MongoDB TTL index permanently removes trashed records after 30 days; administrators can restore them before expiry.
- `board_game_locks` uses `boardID` as `_id` and a short `leaseUntil` timestamp; it is a concurrency control collection, not game history.
- `users.password` is a bcrypt hash; never return it from an API response or include it in exports.
- Bootstrap account synchronization updates username, role, and a changed bcrypt password hash by configured email; a standard bootstrap account cannot reuse an administrator email.

## Cross references

- [06-api-rest.md](06-api-rest.md) explains which REST routes read and write these collections.
- [08-domain-model.md](08-domain-model.md) describes the game document shape in domain terms.
- [09-services.md](09-services.md) explains how the service layer uses the DB wrappers.
## Game duration fields

Live game documents store `startedAt` when the first accepted move is processed, `lastMoveAt` after every accepted move, and `durationSec` as the elapsed number of seconds. Restart clears these values. Completed-history documents retain `startedAt`, `endedAt`, and `durationSec` so the Played and Move Review pages can display the actual game duration.
