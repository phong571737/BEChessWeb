# 16. Deployment

## Deployment shape

The repository is designed for containerized deployment using Docker and Docker Compose.

The root-level deployment artifacts are:

- `Dockerfile`
- `docker-compose.yml`
- `frontend/Dockerfile`

## Runtime packaging

### Backend container

The backend container runs the Node/Express service and depends on the MongoDB and MQTT connections configured in environment variables.

### Frontend container

The frontend container packages the Next.js app. Its runtime URL values are baked at build time so the browser can target the correct backend and socket host.

## Why Docker is used

Docker is the simplest way to ensure the project has a consistent runtime environment for:

- the Node app
- the Next.js app
- the external service connectivity contract

This is especially useful because the application depends on dynamic network endpoints such as MQTT and MongoDB Atlas.

## Compose topology

The compose setup wires together multiple service boundaries:

- app service for the Node backend
- frontend service for the Next.js UI
- MongoDB service or MongoDB-compatible endpoint

In practice, the backend is the process that connects to MongoDB and MQTT, while the frontend just needs the correct public endpoint URLs.

## Deployment variables

The deployment setup depends on environment variables described in [04-environment.md](04-environment.md). The most important are:

- `PORT` (default `80`)
- `MONGO_URI`
- `BACKEND_PUBLIC_URL`
- `FRONTEND_PUBLIC_URL`
- `NEXT_PUBLIC_SOCKET_URL`
- `URL_HIVEMQTT`
- `MQTT_USER`
- `MQTT_PASSWORD`

## Operational notes

### Build time

The frontend is expected to know its public-facing API and socket URLs at build time. This is why the Docker configuration relies on env values rather than only runtime browser heuristics.

### Runtime

The backend process is expected to stay alive and maintain the active game state map through the app lifecycle. This is why the runtime is designed around in-memory state plus durable persistence rather than fully stateless HTTP requests.

## Cross references

- [04-environment.md](04-environment.md) describes the environment variables used by Compose.
- [03-boot-sequence.md](03-boot-sequence.md) describes how the runtime starts after deployment.
- [17-observability.md](17-observability.md) describes how to verify the deployed service health.
