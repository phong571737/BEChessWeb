# 09. Services

## Service-layer role

The backend service layer embodies the system’s business rules. It is the layer that translates transport inputs into meaningful chess domain changes.

The service layer is intentionally more important than the controller layer because this codebase is not just CRUD. It is a live chess orchestration workflow.

## Service inventory

### [src/js/services/chess.service.ts](../src/js/services/chess.service.ts)

This service wraps `chess.js` operations for move application and move validation.

Responsibilities:

- clone a game from a FEN,
- apply a move to a chess instance,
- enumerate valid candidate moves,
- preserve move validity for ambiguous or promotion cases.

### [src/js/services/move.service.ts](../src/js/services/move.service.ts)

This is the primary execution service for the move pipeline.

Responsibilities:

- parse a move candidate sequence,
- route board-type-specific processing for NFC or HALL inputs,
- verify or reject illegal or ambiguous moves,
- persist the resulting state,
- emit the room-scoped `esp_move` event.

For NFC/raw-device moves, custom PGN notation is rebuilt from UCI alongside the durable post-move FEN history. The FEN snapshot is authoritative for the `+` check and `#` checkmate suffixes, so notation remains accurate when device UCI data is incomplete or cannot be replayed as a fully legal `chess.js` game. If neither source can identify a move, the custom PGN renderer retains an explicit `x` placeholder instead of inventing notation.

Finalizing a resignation does not depend on a legacy `initialFen` being valid. An invalid stored starting FEN falls back to the standard position for notation rendering, allowing the game result and durable history snapshot to be saved instead of returning a server error.

### [src/js/services/board.service.ts](../src/js/services/board.service.ts)

This service performs hardware board verification rules.

Responsibilities:

- compare a board scan against the expected initial chess layout,
- classify the board as `READY`, `MISSING_PIECE`, or `WRONG_PIECE`,
- return the missing/extra/wrong-square details needed by the UI.

### [src/js/services/game.action.service.ts](../src/js/services/game.action.service.ts)

This service handles end-of-game and board lifecycle actions such as:

- restart,
- rename,
- destroy,
- result generation,
- room-based socket notification.

### [src/js/services/mqtt.service.ts](../src/js/services/mqtt.service.ts)

This service provides the MQTT integration layer.

Responsibilities:

- connect to the MQTT broker,
- monitor board online/offline topics,
- notify the application when board connectivity changes,
- support board cleanup after offline or destroyed states.
- subscribe to `chess/+/command` and process lifecycle commands. `restart_game_esp` and `restart_game` reset the active board game in place; `resign` accepts `{"command":"resign","side":"white"|"black"}` and `draw` accepts `{"command":"draw"}`. These commands resolve the active game by board, use the same atomic resignation service as the web API, emit the old game result to its room, and create/announce the next waiting game so an open board page and the home board card update consistently.

### [src/js/services/log.service.ts](../src/js/services/log.service.ts)

This service supports the game history and logging pipeline. It is used to keep a durable record of lifecycle and move-related state transitions.

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
