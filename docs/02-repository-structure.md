# 02. Repository Structure

## Repository shape

This repository is a monorepo with two runtime roots:

- the backend under [src/js](../src/js)
- the frontend under [frontend](../frontend)

The root also contains deployment and workspace metadata files such as `docker-compose.yml`, `Dockerfile`, `package.json`, `.env.example`, and `tsconfig.json`.

## Top-level folder conventions

### Root-level responsibilities

- `src/js` – backend application code
- `frontend` – frontend application code
- `tools` – operational helper scripts such as MQTT publish/listen utilities
- `docker-compose.yml` – container orchestration file
- `Dockerfile` – backend container build
- `package.json` – backend workspace package manifest
- `.env.example` – safe placeholder contract for backend, frontend build, MQTT, and bootstrap-account settings

### Folder naming conventions

The repository follows a practical, feature-first convention instead of a strict DDD layout:

- `routes` for path declarations
- `controllers` for request adaptation
- `services` for business policies
- `models` for data access wrappers
- `game` for stateful runtime maps and engine coordination
- `sockets` for network event wiring
- `utils` for generic conversion and intermediate helpers
- `config` for environment and database bootstrap
- `types` for API and domain contract definitions

## Backend folder responsibilities

### [src/js/config](../src/js/config)

Contains environment and DB initialization. The design exists so boot-time configuration does not leak into business logic.

### [src/js/controllers](../src/js/controllers)

Contains HTTP-facing controller objects. Controllers are thin layers that validate the request contract and call the service layer.

### [src/js/services](../src/js/services)

Contains the policy layer:

- board validation,
- move processing,
- game actions,
- resignation and restart behavior,
- MQTT cleanup lifecycle.

### [src/js/models](../src/js/models)

Contains database wrappers built against MongoDB collections. These are persistence adapters, not business logic containers.

### [src/js/game](../src/js/game)

Contains the engine-facing runtime state and board-to-game identity relationships. This is the heart of the live game session model.

### [src/js/sockets](../src/js/sockets)

Contains Socket.IO boot and event wiring.

### [src/js/utils](../src/js/utils)

Contains reusable conversion helpers that the chess service layer depends on.

## Frontend folder responsibilities

### [frontend/app](../frontend/app)

Contains app-route pages. The project uses the App Router.

### [frontend/components](../frontend/components)

Contains UI components organized by feature area:

- board
- home
- import-game
- layout
- played
- providers
- ui

### [frontend/hooks](../frontend/hooks)

Contains custom hooks that coordinate fetching, socket subscriptions, and client-side store updates.

### [frontend/lib](../frontend/lib)

Contains utilities and shared runtime configuration, including URL resolution, caches, constants, and the Zustand store.

### [frontend/locales](../frontend/locales)

Contains translation dictionaries for English and Vietnamese.

Every user-facing frontend string must have the same key in both `en.ts` and `vi.ts`, then be rendered with `useT()` / `t("key")`. Do not hard-code visible UI text in pages or components.

### [frontend/types](../frontend/types)

Contains frontend-facing domain types used by hooks and components.

## Naming conventions

### Backend naming

- `*Router` names are HTTP path mount points.
- `*Controller` names expose request entry points.
- `*Service` names contain business rules.
- `*Model` names wrap persistence operations.
- `*Manager` names manipulate in-memory runtime state.

### Frontend naming

- React components use PascalCase.
- Hooks use `use-*` naming.
- Stores and utilities use descriptive nouns.
- Status constants are grouped in `lib/constants`.

## Folder conventions

- Feature folders are colocated with their adjacent UI or service code.
- Runtime state and app-wide constants are intentionally kept separate from page-level rendering.
- UI primitives are centralized in the `ui` folder to maintain consistency.

## Cross references

- [01-architecture.md](01-architecture.md) explains the rationale for the layered split.
- [11-components.md](11-components.md) documents the UI component taxonomy.
- [12-hooks.md](12-hooks.md) documents the hook layer.
- [10-state-management.md](10-state-management.md) explains the client-side store and runtime maps.
