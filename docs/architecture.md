# Architecture Overview

## Monorepo structure

The repository is organized as a two-part application:

### 1. Backend

Location: `src/js`

Core responsibilities:

- Start the Express server
- Serve REST routes for games, moves, and boards
- Manage chess session state in memory
- Persist game snapshots to MongoDB
- Receive physical-board events through MQTT
- Broadcast live updates through Socket.IO

Key backend modules:

- `server.ts` – entry point that creates the HTTP server, installs middleware, mounts routers, initializes DB, sockets, and MQTT.
- `routes/` – HTTP endpoints for `boards`, `games`, and `moves`.
- `controllers/` – request handlers that validate input and delegate processing.
- `services/` – business logic for move execution, board validation, game lifecycle, and MQTT.
- `game/` – in-memory chess state management and board-to-game lookup maps.
- `models/` – MongoDB-backed game persistence and history collection access.
- `sockets/` – Socket.IO lifecycle and event listeners.
- `config/` – environment and database configuration.

### 2. Frontend

Location: `frontend`

Core responsibilities:

- Present the home screen, board review screens, and game history pages
- Render board UI and move timeline
- Connect to the backend through REST and Socket.IO
- Let users select a game, inspect branches, and review PGN history

Key frontend modules:

- `app/` – Next.js App Router pages for the main user flows
- `components/` – UI building blocks for board view, history, layout, providers, and shared UI atoms
- `hooks/` – stateful React hooks for active games, game lifecycle, initial board checks, and Stockfish integration
- `lib/` – URL helpers, caching, chess utilities, socket constants, and Zustand store
- `types/` – TypeScript models for game and socket payloads
- `locales/` – translation resources

## Runtime dependencies

### Core runtime

- Node.js backend serving Express and Socket.IO
- MongoDB for persistent game and history documents
- MQTT broker for physical board status monitoring

### Frontend runtime

- Next.js App Router
- React and TypeScript
- Zustand state management
- Socket.IO client
- Chess.js for move validation and PGN logic
- Recharts and UI primitives for analysis views

## Request flow

The application behaves like a live chess control plane:

1. The user opens the board interface.
2. The frontend fetches a game by `gameID` and populates local board state.
3. The backend processes physical board scan and move submissions.
4. Socket.IO pushes updated FEN/PGN state to active clients.
5. MongoDB stores the current state and finished-history records.

## Design characteristics

- The backend is stateful in memory for active chess sessions.
- The frontend relies on cached fetches and socket updates for responsiveness.
- The game model mixes real-time state with persisted history documents.
- MQTT is used for board presence and offline cleanup behavior.
