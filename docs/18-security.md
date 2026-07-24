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

- role-based access control,
- explicit API authorization middleware,
- rate limiting,
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
- JWT tokens are required for authenticated operations
- User identity is verified on each protected request
- Sensitive operations (login, register) use HTTPS in production
- Error messages do not reveal whether an email exists in the system

### Administrator account and UI authorization

Administrator credentials are not hard-coded in source control or documentation. The backend only bootstraps an administrator account when `ADMIN_USERNAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` are supplied through environment variables or deployment secrets.

Admin identity is exposed to the frontend as `role: "admin"` and `isAdmin: true` in the auth response. The board UI uses this flag to show operational actions such as **Restart** and **Resign** only to administrators.

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
- User lookup by email/username for authentication
- No password plaintext storage

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
