# 29. Current Runtime Contract

This is the compact, implementation-oriented contract for the runtime checked on
2026-09-07 at commit `069334c`. It is intended to resolve ambiguity when an
older page, diagram, or report sentence uses a previous command name or event
scope.

## Source of truth

| Concern | Authoritative source | Persistence |
| --- | --- | --- |
| Live game, FEN, PGN, clock, board mapping | Backend game runtime + MongoDB `games` | Active games are restored after backend startup |
| Review/history record | MongoDB `game_history` | Updated after accepted moves and finalized at terminal result |
| Raw electronic-board trace | `fenHistory`, `uciHistory` and move metadata | Raw FEN is never overwritten by administrator correction |
| Administrator correction | `fenHistoryEdited` | Separate sequence; used for the base review source when non-empty |
| Browser live display | REST hydration + Socket.IO patches | Client cache is not authoritative |
| Board connectivity/readiness | MQTT status/command handlers + `gameState` | Re-established by board messages and initcheck |

## Transport boundaries

```text
ESP32 --HTTPS--> Nginx --> Express (/boards, /moves)
ESP32 --MQTT--> broker --> backend command/status handlers
Browser --HTTPS--> Nginx --> Next.js pages and backend REST rewrites
Browser --Socket.IO (/socket.io/)--> backend
Backend --> MongoDB
Backend --internal HTTP--> recovery-service (only for FEN recovery endpoints)
```

The physical board does not call MongoDB or the recovery service directly.
Nginx is the public entry point in the VPS deployment and must proxy both REST
routes and `/socket.io/` polling/WebSocket upgrades.

## REST contract

The backend mounts routes directly, without an `/api` prefix:

| Route | Purpose | Auth |
| --- | --- | --- |
| `POST /auth/login`, `/auth/register` | Issue a seven-day JWT and user record | Public |
| `GET /games/current`, `GET /games/:id` | Read live game state | Public read |
| `POST /moves` | Submit a physical-board move | Device-scoped payload; rate limited |
| `GET /boards` | Read physical-board/game status | Public read |
| `GET /broadcast-settings` | Read spectator delay in milliseconds | Admin |
| `PATCH /broadcast-settings` | Set spectator delay from `delaySeconds` (0–3600) | Admin |
| `POST /boards` | Create a board/game association | Device/app flow; rate limited |
| `POST /boards/:id/initcheck` | Validate initial physical layout and button state | Device/app flow; rate limited |
| `POST /games/:id/rename` | Update players, clock, round, and location | Authenticated |
| `POST /games/:id/restart` | Reset the current game in place; retain `gameID` | Authenticated |
| `POST /games/:id/resign` | Finalize history and create next waiting game | Authenticated |
| `POST /games/history/:id/analysis` | Save bounded browser Stockfish output | Admin |
| `GET /games/history/:id/recovered-pgn` | Recover PGN from selected FEN history | Public/read flow |

History FEN edit, trace edit, recycle-bin, and permanent-delete routes are
administrator-only. The complete route details remain in
[`06-api-rest.md`](06-api-rest.md).

## MQTT contract

Topics:

```text
chess/<boardID>/status   -> {"status":"online"|"offline"}
chess/<boardID>/command  -> lifecycle commands
```

Supported command payloads:

```json
{"command":"restart_game"}
{"command":"resign","requestId":"unique-id"}
{"command":"resign","side":"white","requestId":"unique-id"}
{"command":"resign","side":"black","requestId":"unique-id"}
{"command":"draw","requestId":"unique-id"}
```

Semantics:

1. `restart_game` resets the current session in place and retains `gameID`.
2. Side-less `resign` is the ESP32 physical long-press flow. The backend
   evaluates the current position when possible, archives the old game,
   creates the next waiting game, and then publishes `restart_game` back to
   the ESP32 so it can reset/initcheck.
3. `resign` with `side` and `draw` finalize the result directly and create the
   next waiting game.
4. `requestId` deduplicates delivery for 15 seconds in backend memory; the
   MongoDB resignation claim prevents concurrent finalization of the same game.
5. `restart_game_esp` is not a current public command and must not be emitted
   by a maintained ESP32 firmware.

## Socket.IO contract

The browser joins a room named by `gameID` and may request the current clock or
game state after reconnect. The main events are:

| Event | Scope | Meaning |
| --- | --- | --- |
| `esp_move` | Global broadcast | Authoritative move snapshot; clients filter by `gameID` |
| `clock_state` | Game room | Server-authoritative remaining time and FEN |
| `restore_game` | Requesting socket | Reconnect hydration |
| `initcheck` | Game room | Physical-board initialization result |
| `game:reset` | Game room | In-place reset with retained game identity |
| `game:renamed` | Game room | Updated names/time-control setup |
| `game_status_update` | Global broadcast | Active/finished/waiting lifecycle mapping |
| `board_scan_ok` | Global broadcast | New or remapped board/game association |
| `board_offline`, `game:destroyed` | Global broadcast | Board connectivity or delayed cleanup |

`esp_move` is deliberately global because the home dashboard does not join all
game rooms. The board page and `use-active-games` filter by `gameID`; this is
why a physical move updates the card without a manual reload.

## Initcheck states

The UI may show `idle`/`checkinit` while waiting for a first scan, then one of:

- `ready`: all pieces and the physical start/button condition are correct;
- `waiting_button`: pieces are correct but the start/button action is pending;
- `missing_piece` or `wrong_piece`: the board has a physical placement error;
- `checkinit`: validation is running;
- `error`: the board scan or transport failed.

These are readiness states, not chess results. The card can show them without
opening the board page.

## FEN recovery and analysis

The review source is selected automatically:

1. base source = `fenHistoryEdited` when non-empty, otherwise raw `fenHistory`;
2. recovered source = the chosen branch's FEN sequence;
3. Stockfish compares adjacent FEN snapshots only. It does not replace the
   selected source with UCI or PGN.

The recovery sidecar is called only by recovery/history endpoints. Unresolved
transitions stay visible as unavailable rows; raw FEN and the original PGN are
preserved.

## Spectator delay

The administrator view uses the authoritative game state immediately. Public
viewers receive delayed snapshots according to the MongoDB-backed setting from
`GET/PATCH /broadcast-settings`. The frontend accepts manual seconds and quick
presets; `0` disables the delay. The backend clamps values to the inclusive
range `0..3600` seconds and keeps the original game/history records unchanged.

## Clock contract

The backend owns the clock. A configured `initialTimeMs` and `incrementMs` are
stored with the game. The first accepted move starts timing; each subsequent
accepted move persists elapsed duration and switches the active side. Clients
request `clock_state` after joining and render `remainingMs` against server
timestamps, so a client that joins late does not restart a fresh local clock.

## Security status

Current implementation uses bearer JWTs in the frontend's local storage, bcrypt
password hashes, exact-origin CORS, route-specific rate limits, and role checks
in backend middleware. MQTT lifecycle messages are trusted broker commands and
therefore require broker credentials/ACLs. HttpOnly cookie sessions, CSRF
tokens, a unified Zod/Joi request schema layer, and centralized distributed
rate limiting remain hardening work; they must not be documented as already
implemented.

## Code anchors

- HTTP/server mounting: `backend/src/server.ts`
- MQTT command lifecycle: `backend/src/services/mqtt.service.ts`
- Move persistence and global `esp_move`: `backend/src/services/move.service.ts`
- Socket room/events: `backend/src/sockets/game.socket.ts`
- Initcheck: `backend/src/routes/board.router.ts` and board controllers/services
- FEN recovery: `backend/src/routes/recover.router.ts`, `backend/src/services/fen-recovery.client.ts`
- Browser source-specific analysis: `frontend/lib/post-game-analysis.ts`, `frontend/components/played/move-analysis-panel.tsx`
- Browser realtime consumers: `frontend/hooks/use-game.ts`, `frontend/hooks/use-active-games.ts`
