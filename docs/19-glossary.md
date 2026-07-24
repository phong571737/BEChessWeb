# 19. Glossary

## Terms

### Board ID

The identifier of a physical board or board scan source. This value is used to bind a specific hardware session to a game instance.

### Game ID

The logical identifier for a chess session. This is the main route key used in the frontend and backend for working with a single game.

### FEN

Forsythe–Edwards Notation. It is the compact chess position string used to express the current board configuration.

### PGN

Portable Game Notation. It is the human-readable move log used for replay, review, and history display.

### Branch

An alternate move continuation derived from a main line. In this repository, branches are used to support review and comparison without changing the primary game object.

### Init Check

The board readiness validation step that confirms whether the physical board matches the expected initial piece layout.

### NFC board

A board format using square-to-piece mapping from a physical board scan source.

### HALL board

A board format using an array-based occupancy matrix representing the physical board.

### Socket room

A broadcast group in Socket.IO, identified by `gameID`. Rooms allow the server to push game-specific events to the correct connected clients.

### Move candidate

A raw move proposal or UCI-like string that eventually gets validated by the chess service before being accepted into the game.

### Active game

A currently available game session shown on the home dashboard. It is not necessarily “currently being played” in the strict sense; it is the current session entry in the game list.

### Result tag

A final game outcome string such as `1-0`, `0-1`, or `1/2-1/2`.

### Game history

A durable collection of finished or archival game records used by the `played` review experience.

### Board status

A high-level identifier describing whether the board is ready, active, offline, or ended.

## Domain vocabulary summary

The repo uses a narrow, practical vocabulary focused on game lifecycle and board readiness rather than a broader enterprise domain model. This keeps the implementation easier to understand for an AI agent working inside a rapid chess workflow.

## Cross references

- [08-domain-model.md](08-domain-model.md) defines the most important model relationships.
- [14-business-flow.md](14-business-flow.md) uses these terms in the runtime lifecycle explanation.
- [06-api-rest.md](06-api-rest.md) and [07-api-socket.md](07-api-socket.md) define the operational vocabulary used by the interfaces.
