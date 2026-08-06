# 04. Environment

## Environment purpose

The backend runtime depends on environment variables for orchestration, database access, and MQTT communications. The frontend also relies on environment values for API target routing.

## Backend configuration contract

The environment contract is declared in [src/js/config/environment.ts](../src/js/config/environment.ts).

### Required values

- `MONGO_URI` – primary MongoDB connection string
- `JWT_SECRET` – JWT signing secret; must be random, private, and at least 32 characters
- `CORS_ORIGINS` – optional comma-separated browser origins allowed to call the API, for example `http://localhost:3000,http://ttlab.uit.edu.vn`
- `PORT` – HTTP server port (defaults to `80` when omitted)
- `URL_HIVEMQTT` – MQTT broker URL
- `MQTT_PORT` – MQTT broker port
- `MQTT_USER` – broker username
- `MQTT_PASSWORD` – broker password

### Optional values

- `AUTHOR` – server attribution metadata
- `SERVER_NAME` – server identity label
- `MQTT_TOPIC_GET_IP` – topic used for IP discovery or device-side signaling
- `MONGO_LOCAL` – local fallback MongoDB URI
- `ADMIN_USERNAME` – optional bootstrap administrator username
- `ADMIN_EMAIL` – optional bootstrap administrator email/login
- `ADMIN_PASSWORD` – optional bootstrap administrator password
- `USER_USERNAME` – optional bootstrap standard-user username
- `USER_EMAIL` – optional bootstrap standard-user email/login
- `USER_PASSWORD` – optional bootstrap standard-user password

### Default admin account

On backend startup, the server can ensure one administrator account exists, but only when all three admin bootstrap variables are provided through local environment variables or deployment secrets. No administrator credential is hard-coded in source control or documentation.

Bootstrap credentials are synchronized at server startup. If the configured email already exists, the username, role, and changed password hash are updated. This lets the developer rotate the private administrator password through deployment secrets. A standard-user email cannot reuse an administrator email.

### Secret handling rules

Do not document or commit real values for administrator credentials, MongoDB URIs, JWT signing material, or MQTT credentials. Documentation should only list variable names and behavior. Real values must stay in local `.env` files, CI/CD variables, or deployment secret stores.

Example placeholders may be used when necessary, but they must not be valid project credentials:

```env
ADMIN_USERNAME=<admin-username>
ADMIN_EMAIL=<admin-email>
ADMIN_PASSWORD=<admin-password>
USER_USERNAME=<standard-user-username>
USER_EMAIL=<standard-user-email>
USER_PASSWORD=<standard-user-password>
JWT_SECRET=<long-random-private-signing-secret>
```

## Why these values exist

The system is built around infrastructure boundaries:

- MongoDB stores durable game documents.
- MQTT tracks physical board online/offline lifecycle.
- `PORT` controls the backend listener.
- `AUTHOR` and `SERVER_NAME` are metadata used by environment and deployment tooling.

## Frontend configuration contract

The frontend relies on a smaller runtime contract for browser and server-side targeting.

### Common local values

- `API_URL` – backend base URL used by SSR or server-side requests
- `NEXT_PUBLIC_API_URL` – browser-visible backend base URL override used by client-side REST calls
- `NEXT_PUBLIC_SOCKET_URL` – browser-side Socket.IO endpoint
- `NEXT_PUBLIC_BASE_PATH` – optional frontend build-time subpath, such as `/chess`
- `BACKEND_PROXY_URL` – server-only backend origin used by Next.js rewrites, for example `https://<render-service>.onrender.com`.

### Runtime URL resolution logic

The helper in [frontend/lib/api-url.ts](../frontend/lib/api-url.ts) resolves the API endpoint by priority:

1. `NEXT_PUBLIC_API_URL` if present
2. fallback to `window.location` heuristics for localhost/LAN/VPN-like hosts
3. fallback to `API_URL`

This exists because the frontend can run in multiple deployment modes, including local development and remote deployment.

Login and registration pages must call authentication endpoints through this helper. Calling relative paths such as `/auth/login` from the browser can route the request to the Next.js frontend server instead of the Express backend and produce a 404.

### Vercel frontend with an external backend

Set `BACKEND_PROXY_URL` in Vercel Project Settings → Environment Variables (Production, and Preview when required). For a Render backend, use its HTTPS service origin, for example `https://<render-service>.onrender.com`. The Next.js rewrite forwards `/auth`, `/games`, `/moves`, `/boards`, and `/eval` server-side to this origin. Do not expose this value as `NEXT_PUBLIC_BACKEND_PROXY_URL`.

## Environment conventions

### Naming conventions

- Backend environment variables use uppercase snake case.
- Frontend env values are still uppercase, but browser-exposed variables use the `NEXT_PUBLIC_` prefix.
- Configuration resolution is centralized rather than duplicated across components.

### Failure behavior

For required backend values, the existing code throws on missing configuration. This is intentional: the application should fail early rather than start in a partially configured state.

## Cross references

- [03-boot-sequence.md](03-boot-sequence.md) shows when environment values are consumed.
- [05-database.md](05-database.md) explains how MongoDB uses the URI configuration.
- [16-deployment.md](16-deployment.md) describes Docker and Compose environment injection.
