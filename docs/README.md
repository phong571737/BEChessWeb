# BEChessWeb Documentation

A maintained architecture and operating guide for BEChessWeb. This documentation set was reviewed against release `v1.1.3-change10`.

## Overview

BEChessWeb is a real-time chess platform made of four major runtime parts:

- A Node.js + Express backend under `src/js`
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
