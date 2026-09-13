# BEChessWeb Documentation

A maintained architecture and operating guide for BEChessWeb. This documentation set was reviewed against the current spectator-delay, FEN-editor, and review-layout implementation on 2026-09-09. The source code remains authoritative when a generated diagram or older note disagrees with an implementation detail.

## Overview

BEChessWeb is a real-time chess platform made of four major runtime parts:

- A Node.js + Express backend under `backend/src`
- A Next.js frontend under `frontend`
- MongoDB persistence for durable game and history records
- Socket.IO + MQTT for live board synchronization and hardware events

## Documentation map

| Area | Description |
| --- | --- |
| [01-architecture.md](01-architecture.md) | System architecture and runtime layering |
| [02-repository-structure.md](02-repository-structure.md) | Repository organization and folder responsibilities |
| [03-boot-sequence.md](03-boot-sequence.md) | Backend startup and initialization order |
| [04-environment.md](04-environment.md) | Environment and runtime configuration |
| [05-database.md](05-database.md) | MongoDB persistence model |
| [06-api-rest.md](06-api-rest.md) | REST API surface |
| [07-api-socket.md](07-api-socket.md) | Socket.IO event model |
| [08-domain-model.md](08-domain-model.md) | Business concepts and domain entities |
| [09-services.md](09-services.md) | Backend service responsibilities |
| [10-state-management.md](10-state-management.md) | Runtime and frontend state model |
| [11-components.md](11-components.md) | Frontend component taxonomy |
| [12-hooks.md](12-hooks.md) | Hook layer and runtime data wiring |
| [13-pages.md](13-pages.md) | App Router page map |
| [14-business-flow.md](14-business-flow.md) | End-to-end lifecycle of a game |
| [15-navigation.md](15-navigation.md) | Navigation and user journey structure |
| [16-deployment.md](16-deployment.md) | Docker and deployment model |
| [17-observability.md](17-observability.md) | Logs and runtime check points |
| [18-security.md](18-security.md) | Deployment and secret-handling posture |
| [19-glossary.md](19-glossary.md) | Shared terminology |
| [20-styling.md](20-styling.md) | Frontend design system: tokens, themes, primitives, typography, and motion |
| [21-layout-shell.md](21-layout-shell.md) | App shell and navigation layout |
| [22-board-visuals.md](22-board-visuals.md) | Chessboard and evaluation visual treatment |
| [23-stateful-ui.md](23-stateful-ui.md) | State-driven UI patterns |
| [24-versioning.md](24-versioning.md) | Release and GitHub versioning policy |
| [25-stockfish-evaluation.md](25-stockfish-evaluation.md) | Browser Stockfish lifecycle and evaluation-bar behavior |
| [26-codegraph.md](26-codegraph.md) | Local repository code graph and architecture visualization |
| [26-code-comments-and-configuration.md](26-code-comments-and-configuration.md) | English function-comment and environment/secret policy |
| [27-debugging-guide.md](27-debugging-guide.md) | Practical debugging commands and root-cause workflow for this repository |
| [28-fen-recovery-and-history-analysis.md](28-fen-recovery-and-history-analysis.md) | Report-ready explanation of FEN candidate recovery and complete-game history analysis |
| [29-current-runtime-contract.md](29-current-runtime-contract.md) | Canonical current-state contract for REST, Socket.IO, MQTT, initcheck, clocks, and lifecycle transitions |

The former `recover_service/evaluate_engines/plan.md` content is now maintained
in [`recover_service/evaluate_engines/README.md`](../recover_service/evaluate_engines/README.md),
so the evaluation directory has one canonical guide instead of a plan and README
that can drift apart. `docs/api.md` remains a short compatibility link for old
references and intentionally points to the split REST/Socket documentation.

## Archify diagrams

The standalone diagrams in `diagrams/` are generated from the current runtime code and keep the legend hidden for a cleaner report layout:

| Artifact | Covers | Code anchors |
| --- | --- | --- |
| [ttlab-chess-architecture.html](diagrams/ttlab-chess-architecture.html) | Runtime topology: browser, Nginx, Next.js, backend, MongoDB, MQTT, ESP32, and recovery service | `backend/src/server.ts`, `backend/src/services/mqtt.service.ts`, `recover_service/app/runner.py` |
| [ttlab-chess-live-sequence.html](diagrams/ttlab-chess-live-sequence.html) | Physical-board move and realtime Socket.IO propagation | `backend/src/routes/move.routes.ts`, `backend/src/sockets/game.socket.ts` |
| [ttlab-chess-recovery-workflow.html](diagrams/ttlab-chess-recovery-workflow.html) | Edited/raw FEN selection, legal candidate branching, pruning, and administrator review | `backend/src/services/fen-recovery.client.ts`, `recover_service/service/recovery.py`, `frontend/components/played/pgn-modal.tsx` |
| [ttlab-chess-fen-candidate-workflow.html](diagrams/ttlab-chess-fen-candidate-workflow.html) | Detailed candidate-position workflow: evidence, legal-move branches, pruning, and review | `recover_service/service/recovery.py`, `frontend/lib/post-game-analysis.ts` |

The two JSON files beside the HTML outputs are the Archify source specifications. They are validated with the `showcase` quality profile; the generated HTML is the report-ready artifact.

## Code/documentation audit (2026-09-07)

The diagrams and the relevant documentation were checked against the current implementation. The following relationships are consistent:

- Board HTTP input and MQTT lifecycle events are separate paths into the backend.
- MongoDB stores durable game/history snapshots; Socket.IO broadcasts live state after backend updates.
- Recovery selects edited FEN history when present, otherwise raw electronic-board FEN history, and delegates legal multi-branch recovery to the FastAPI sidecar.
- Historical PGN/analysis uses adjacent FEN transitions; it does not use UCI or legacy PGN as the analysis source for the selected review branch.
- A game is archived in history after completion while restart reinitializes the active session in place.
- Administrator FEN corrections are stored separately from raw electronic-board snapshots; the review UI can duplicate a row in place and edit it on the standard chessboard.
- Vertical evaluation bars use the exact rendered board height, and narrow review layouts group evaluation, suggestion, and annotation controls in a menu.

The repository intentionally keeps `docs/` ignored, so these local documentation artifacts are not included in application builds or Git commits unless explicitly force-added.

## Runtime flow

1. A physical board submits moves/init checks through HTTP and publishes connectivity or lifecycle commands through MQTT.
2. The backend restores or creates the matching in-memory chess session and persists the latest snapshot to MongoDB.
3. The frontend hydrates the UI through REST calls and joins the matching Socket.IO room.
4. Move and state events are broadcast to connected clients to refresh the board page and the active-game dashboard.

## Reading order

For a fast understanding of the system, read in this order:

1. [01-architecture.md](01-architecture.md)
2. [03-boot-sequence.md](03-boot-sequence.md)
3. [06-api-rest.md](06-api-rest.md)
4. [07-api-socket.md](07-api-socket.md)
5. [10-state-management.md](10-state-management.md)
6. [14-business-flow.md](14-business-flow.md)
7. [29-current-runtime-contract.md](29-current-runtime-contract.md)
