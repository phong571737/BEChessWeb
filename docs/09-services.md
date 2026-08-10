# 09. Services

## Service-layer role

### FEN recovery sidecar

`recover_service` is an optional Python/FastAPI Docker sidecar. It exposes `POST /recover` on the internal Compose network at `http://recover-service:8000`. The backend sends ordered `fenHistory`, the starting FEN, and PGN headers when finalizing a game. The sidecar compares consecutive piece-placement snapshots, detects legal candidates with `python-chess`, explores compatible branches, and returns `originalPgn` plus recovery metadata. The history review endpoint (`GET /games/history/:id/recovered-pgn`) calls the same sidecar so the Move Review list and PGN notation use one consistent recovery algorithm. If the sidecar is unavailable, finalization still falls back to the local `customPGN()` renderer; the review UI keeps its compatibility fallback for legacy records but prefers the sidecar response whenever FEN snapshots exist.

The sidecar is not exposed publicly and is enabled by `RECOVER_SERVICE_URL`. It is built by `recover_service/Dockerfile` and started by `docker-compose.yml` before the backend. If it is unavailable, the backend falls back to the local unchecked renderer and marks unresolved transitions as `x`; this keeps Paste and game finalization available without affecting MQTT, clocks, or normal move processing.

The backend service layer embodies the system’s business rules. It is the layer that translates transport inputs into meaningful chess domain changes.

The service layer is intentionally more important than the controller layer because this codebase is not just CRUD. It is a live chess orchestration workflow.

## Service inventory

### [backend/src/services/chess.service.ts](../backend/src/services/chess.service.ts)

This service wraps `chess.js` operations for move application and move validation.

Responsibilities:

- clone a game from a FEN,
- apply a move to a chess instance,
- enumerate valid candidate moves,
- preserve move validity for ambiguous or promotion cases.

### [backend/src/services/move.service.ts](../backend/src/services/move.service.ts)

This is the primary execution service for the move pipeline.

Responsibilities:

- parse a move candidate sequence,
- route board-type-specific processing for NFC or HALL inputs,
- verify or reject illegal or ambiguous moves,
- persist the resulting state,
- emit the room-scoped `esp_move` event.

For NFC/raw-device moves, custom PGN notation is rebuilt from UCI alongside the durable post-move FEN history. The FEN snapshot is authoritative for the `+` check and `#` checkmate suffixes, so notation remains accurate when device UCI data is incomplete or cannot be replayed as a fully legal `chess.js` game. If neither source can identify a move, the custom PGN renderer retains an explicit `x` placeholder instead of inventing notation.

Finalizing a resignation does not depend on a legacy `initialFen` being valid. An invalid stored starting FEN falls back to the standard position for notation rendering, allowing the game result and durable history snapshot to be saved instead of returning a server error.

### [backend/src/services/board.service.ts](../backend/src/services/board.service.ts)

This service performs hardware board verification rules.

Responsibilities:

- compare a board scan against the expected initial chess layout,
- classify the board as `READY`, `MISSING_PIECE`, or `WRONG_PIECE`,
- return the missing/extra/wrong-square details needed by the UI.

### [backend/src/services/game.action.service.ts](../backend/src/services/game.action.service.ts)

This service handles end-of-game and board lifecycle actions such as:

- restart,
- rename,
- destroy,
- result generation,
- room-based socket notification.

### [backend/src/services/mqtt.service.ts](../backend/src/services/mqtt.service.ts)

This service provides the MQTT integration layer.

Responsibilities:

- connect to the MQTT broker,
- monitor board online/offline topics,
- notify the application when board connectivity changes,
- support board cleanup after offline or destroyed states,
- subscribe to `chess/+/command` and process lifecycle commands. `restart_game_esp` and `restart_game` reset the active board game in place; restart is intentionally handled only on the command topic, not as a status value. `resign` accepts `{"command":"resign","side":"white"|"black"}` and `draw` accepts `{"command":"draw"}`. These commands resolve the active game by board, use the same atomic resignation service as the web API, emit the old game result to its room, and create/announce the next waiting game so an open board page and the home board card update consistently.
- suppress duplicate lifecycle deliveries for 15 seconds using `boardID` plus `requestId` (or the normalized command/side fallback); the short-lived keys remove themselves to avoid an unbounded map.

## Mission of the service layer

The service layer is where the application enforces its actual rules:

- legal chess move validation,
- initial-board readiness validation,
- branch-comparison normalization,
- endgame and restart transitions,
- room broadcast policy.

Controller classes are relatively thin, but services are where the product behavior really lives.

## Service interaction pattern

A standard request path looks like this:

1. controller receives an HTTP request,
2. controller extracts route parameters or payload,
3. controller delegates to a service,
4. service uses `game.manager` or `game.state` to access active runtime state,
5. service persists the result if needed,
6. service emits a socket event for connected clients.

This keeps the application modular and allows the frontend to remain almost entirely ignorant of backend rule enforcement.

## Cross references

- [08-domain-model.md](08-domain-model.md) defines the concepts manipulated by these services.
- [10-state-management.md](10-state-management.md) explains how the related runtime state is represented in memory.
- [14-business-flow.md](14-business-flow.md) walks the service sequencing in a real move lifecycle.
