# 17. Observability

## Observability goal

The application is intentionally small and operationally simple, but it still needs clear runtime signals for:

- backend startup and health,
- MongoDB connectivity,
- socket connection state,
- MQTT board reachability,
- active game lifecycle transitions.

## Available logging signals

### Server logs

The backend uses direct `console.log` and `console.error` calls for key events such as:

- request failures,
- socket room join events,
- init check failures,
- move-processing exceptions,
- board offline or destroy events.

### Frontend logs

The frontend emits debug logs for:

- socket connect state,
- move and state consumption,
- board fetch failures,
- `usePhysicalBoards` heartbeat actions.

## Why observability is simple here

This codebase favors local, explicit runtime reporting over a heavy tracing stack. The expectation is that a developer or operator can inspect the existing logs to infer:

- whether the backend connected to MongoDB,
- whether the socket server is present,
- whether a physical board went offline,
- whether a game was restored or ended.

## Operational checkpoints

### Health-related checkpoints

Useful runtime checkpoints are:

- `GET /` or root health from the backend
- initial MongoDB `ping` during startup
- socket connection events from the browser
- MQTT board offline detection events

### Move pipeline checkpoints

The main move pipeline should generate a visible transition between:

- request intake,
- candidate move validation,
- state mutation,
- DB upsert,
- room broadcast.

If any of those stages fail, the logs should reveal the boundary where the problem lives.

## Recommended verification points for operators

- confirm `board_scan_ok` arrives after scanning
- confirm `esp_move` is emitted after a legal move
- confirm `game:reset` and `game_status_update` are emitted after restart
- confirm `update_all_game`, the old `finished` mapping, and the new `waiting`/`board_scan_ok` mapping are emitted after MQTT resignation or draw
- confirm `/games/:id/initcheck` reports `READY` when the board is correctly configured

## Cross references

- [03-boot-sequence.md](03-boot-sequence.md) explains where startup readiness is established.
- [06-api-rest.md](06-api-rest.md) and [07-api-socket.md](07-api-socket.md) document the event endpoints the operators should verify.
- [16-deployment.md](16-deployment.md) explains the deployment context where these signals are most visible.
