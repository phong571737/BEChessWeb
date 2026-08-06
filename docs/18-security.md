# 18. Security

## Security posture

This repository uses JWT-based administrator authorization for state-changing game operations. Public visitors may view board state, but cannot control games.

The main concerns are therefore:

- protecting database and MQTT credentials,
- preventing accidental exposure of internal endpoints,
- keeping environment variables out of source control,
- relying on narrow access boundaries for the deployed runtime.

## Primary security boundary

Environment variables are the first major security boundary.

Values such as:

- `MONGO_URI`
- `MQTT_USER`
- `MQTT_PASSWORD`
- `URL_HIVEMQTT`

must not be committed to source control. The application expects them to be injected via environment configuration or deployment secrets.

## Transport and network assumptions

The system uses:

- HTTP for API access,
- Socket.IO for realtime communication,
- MQTT for hardware-side telemetry.

The application should be deployed behind a secure network boundary or a reverse proxy that controls access to the backend and frontend endpoints.

## Security limitations of the current codebase

From the repository structure alone, the app does not appear to include:

- role-based access control,
- explicit API authorization middleware,
- CSRF protection,
- strict input validation beyond the local controller and service checks.

This means the product is functionally oriented and operationally targeted rather than security-hardened.

## Authentication and authorization

The application implements a lightweight authentication system using JWT tokens.

### Authentication mechanism

- Users register with username, email, and password
- Passwords are hashed using bcrypt before storage
- On successful login, a JWT token is issued with 7-day expiry
- The token is stored in the frontend's localStorage
- Protected routes and UI elements check authentication status via React Context

### Authorization principles

The system follows the principle of **not exposing sensitive information to unauthorized parties**:

- User passwords are never returned in API responses
- `JWT_SECRET` is mandatory at server startup; there is no fallback signing secret
- JWT tokens are required for authenticated operations
- User identity is verified on each protected request
- Sensitive operations (login, register) use HTTPS in production
- Error messages do not reveal whether an email exists in the system

### Administrator account and UI authorization

Administrator credentials are not hard-coded in source control or documentation. The backend only bootstraps an administrator account when `ADMIN_USERNAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` are supplied through environment variables or deployment secrets. The same mechanism can provision a non-administrator account through `USER_USERNAME`, `USER_EMAIL`, and `USER_PASSWORD`. Existing bootstrap accounts are synchronized so password rotation takes effect after restart; passwords remain bcrypt hashes in MongoDB.

Admin identity is exposed to the frontend as `role: "admin"` and `isAdmin: true` in the auth response. The board UI uses this flag to show operational actions such as **Restart** and **Resign** only to administrators. The backend independently enforces this rule with `requireAdmin`, so a hidden UI button cannot be bypassed by calling the API directly.

History deletion is administrator-only at both layers. The frontend hides and disables moving records to trash, viewing/restoring trash, permanent deletion, and empty-trash actions for standard users. Every corresponding backend route also uses `requireAdmin`; a valid `user` JWT therefore receives HTTP `403` even if the endpoint is called manually.

### Data exposure rules

The following information is considered sensitive and must not be exposed:

- User passwords (even hashed versions should not be returned from APIs)
- JWT tokens in URLs or logs
- Internal MongoDB document structure (_id fields in public responses)
- Environment variables and configuration secrets
- MQTT broker credentials
- Internal API endpoints and architecture details

### Frontend security

- Authentication state is managed via React Context
- Token is stored in localStorage (consider httpOnly cookies for enhanced security)
- UI adapts based on authentication status
- Logout clears all authentication data

### Backend security

- Passwords are hashed with bcrypt (10 salt rounds)
- JWT tokens are signed and verified
- `DELETE /games/history/:id` and all game mutation routes (`pgn`, `restart`, `destroy`, `resign`, `reset`, `rename`, `endgame`, and `update`) require an administrator Bearer token
- Socket.IO connections remain public for live board viewing, while `restart` and `resign` events require an administrator JWT supplied during the Socket.IO handshake
- User lookup by email/username for authentication
- No password plaintext storage

### Rate limiting

The backend applies an in-memory, IP-based rate limit at public route boundaries. Express trusts the single Nginx reverse proxy so the limiter can use the forwarded client IP.

- Login: 5 requests per minute per IP
- Registration: 5 requests per hour per IP
- Move submission: 120 requests per minute per IP
- ESP and browser initialization checks: 240 requests per minute per IP
- Game reads: 120 requests per minute per IP
- Game mutations: 20 requests per minute per IP
- Destructive game actions and history deletion: 5 requests per minute per IP

When a limit is exceeded, the API returns `429 Too Many Requests` with a `Retry-After` header. The limiter protects against bursts and brute-force attempts; it does not replace authentication or authorization. Expired in-memory buckets are pruned once per minute and the cleanup timer is unreferenced, so inactive client IPs do not accumulate indefinitely or keep the Node.js process alive. For multiple backend replicas, the limiter should be moved to Redis.

### CORS

The backend accepts cross-origin browser requests only from the comma-separated allowlist in `CORS_ORIGINS` and the optional legacy `VERCEL_WEB` origin. It permits the API methods used by the app and the `Authorization` header. ESP32 and other non-browser clients without an `Origin` header remain supported. Bearer-token authentication does not use cross-origin cookies, so CORS credentials are disabled.

### Idempotent resignation

`POST /games/:id/resign` first performs an atomic MongoDB state transition from a live status to `resigning`. Only the request that successfully claims that transition may write the history entry, reset the live state, and create the next game. Concurrent clicks and network retries receive `409 Conflict` while the resignation is in progress, rather than creating another history entry or next-game record. History records use the game ID as their deterministic MongoDB `_id`, making a repeated final-history write an idempotent no-op.

The resignation claim is a 30-second lease. If a process dies after claiming a resignation, a later request may reclaim an expired lease instead of leaving the game permanently locked. Move and restart writes use a monotonically increasing game `version`; a write based on an older version returns a conflict rather than overwriting the latest persisted state.

### Board creation serialization

Game creation takes a short MongoDB lease keyed by physical `boardID`. Concurrent scans for the same board reuse the active game when one exists; they never delete the retained live game. A lock left by a crashed process expires automatically after 15 seconds.

### History recycle bin

Only administrators may move history entries to the recycle bin or restore them. Deletion is a soft-delete operation; a MongoDB TTL index permanently removes records 30 days after `deleteAfter`. Public history queries exclude trashed entries.

## Operational recommendations

For any production deployment, the team should consider adding:

- authenticated session control for user-facing endpoints,
- endpoint-level authorization between board operators and history viewers,
- secrets management through a provider such as Docker secrets, Vault, or cloud secret stores,
- reverse-proxy TLS termination,
- input sanitization and stricter request validation at the API boundary.

## Cross references

- [04-environment.md](04-environment.md) identifies the sensitive environment variables that are security-critical.
- [16-deployment.md](16-deployment.md) explains how deployment should isolate these values.
- [17-observability.md](17-observability.md) describes the runtime evidence a secure deployment should preserve.
