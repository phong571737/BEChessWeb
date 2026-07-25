# 04. Environment

## Environment purpose

The backend runtime depends on environment variables for orchestration, database access, and MQTT communications. The frontend also relies on environment values for API target routing.

## Backend configuration contract

The environment contract is declared in [src/js/config/environment.ts](../src/js/config/environment.ts).

### Required values

- `MONGO_URI` – primary MongoDB connection string
- `PORT` – HTTP server port
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

### Default admin account

On backend startup, the server can ensure one administrator account exists, but only when all three admin bootstrap variables are provided through local environment variables or deployment secrets. No administrator credential is hard-coded in source control or documentation.

If a user with `ADMIN_EMAIL` already exists, the bootstrap keeps the existing password and only promotes that account to `role: "admin"` when needed.

### Secret handling rules

Do not document or commit real values for administrator credentials, MongoDB URIs, JWT signing material, or MQTT credentials. Documentation should only list variable names and behavior. Real values must stay in local `.env` files, CI/CD variables, or deployment secret stores.

Example placeholders may be used when necessary, but they must not be valid project credentials:

```env
ADMIN_USERNAME=<admin-username>
ADMIN_EMAIL=<admin-email>
ADMIN_PASSWORD=<admin-password>
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

### Runtime URL resolution logic

The helper in [frontend/lib/api-url.ts](../frontend/lib/api-url.ts) resolves the API endpoint by priority:

1. `NEXT_PUBLIC_API_URL` if present
2. fallback to `window.location` heuristics for localhost/LAN/VPN-like hosts
3. fallback to `API_URL`

This exists because the frontend can run in multiple deployment modes, including local development and remote deployment.

Login and registration pages must call authentication endpoints through this helper. Calling relative paths such as `/auth/login` from the browser can route the request to the Next.js frontend server instead of the Express backend and produce a 404.

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
