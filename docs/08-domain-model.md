# 08. Domain Model

## Core domain concepts

The codebase models a small chess workflow domain rather than a general-purpose multi-game engine.

The essential concepts are:

- `boardID` – the physical board identifier or board-scanner identity
- `gameID` – the logical chess session identifier
- `fen` – current chess position encoded in Forsythe–Edwards Notation
- `pgn` – portable game notation used for history and review
- `branch` – an alternate sequence of moves derived from the main line
- `board status` – scan and readiness status from the physical board
- `result` – game outcome such as white win, black win, or draw

## Entity truth model

### Game record

The persisted game object is a MongoDB document with fields such as:

- `gameID`
- `boardID`
- `fen`
- `pgn`
- `WhiteName`
- `BlackName`
- `result`
- `lastMove`
- `lastSeq`
- `status`
- `branches`
- `createdAt`, `updatedAt`

This is the durable projection of the current game state.

### Game state in memory

The active runtime maps keep the latest board-to-game relationships and live chess objects. These should be considered the runtime source of truth for move handling during an active session.

### Physical board state

The board state is a separate concern from the chess state. It captures:

- whether the board is online,
- whether it has been scanned successfully,
- whether its initial layout is ready,
- whether pieces are missing or extra.

## Relationship between game and board

A physical board can be mapped to one active game at a time.

The relationship is expressed as:

- `boardID -> gameID` in the in-memory board registry
- `gameID -> boardID` in the persisted game document

This binding is important because the system can create a new game session for the same physical board after a restart or resignation.

## Branch model

The branch concept is used to represent an alternative continuation of the same game.

In practice, the frontend receives a list of `Branch` entries with PGNs, then uses them to:

- render a line of alternative continuation,
- preserve a selected branch in session storage,
- rebuild the main line before the branch point for comparison.

The branch mechanism is UI-centric rather than a full tree-database model. It is best understood as a lightweight review and navigation feature.

## Game lifecycle states

The project uses a small set of domain states, including:

- `waiting`
- `ready`
- `active`
- `ended`
- `finished`

The board initialization state also uses result categories such as:

- `READY`
- `MISSING_PIECE`
- `WRONG_PIECE`

## Outcome semantics

The game result tag is not only a display label. It is used for:

- history retrieval,
- “who won?” card display,
- end-of-game cleanup and restart behavior.

A resign action can produce outcomes such as:

- `1-0`
- `0-1`
- `1/2-1/2`

## Cross references

- [09-services.md](09-services.md) explains how the domain model is manipulated by services.
- [10-state-management.md](10-state-management.md) shows how the frontend stores the same model in Zustand.
- [14-business-flow.md](14-business-flow.md) describes how a game progresses through this model over time.
