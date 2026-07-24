# 18. Security

## Security posture

This repository does not implement a large authentication or authorization framework. The architecture is best described as a lightweight operational system with infrastructure-level trust assumptions.

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

- user authentication,
- role-based access control,
- explicit API authorization middleware,
- rate limiting,
- CSRF protection,
- strict input validation beyond the local controller and service checks.

This means the product is functionally oriented and operationally targeted rather than security-hardened.

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
