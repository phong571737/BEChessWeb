# Deployment and Environment Guide

## Runtime environment assumptions

The repository expects a full-stack environment with:

- MongoDB access for the backend
- MQTT broker credentials for physical board communication
- A frontend runtime for the Next.js app
- Docker Compose support for containerized deployment

## Root environment variables

The backend reads environment variables from `src/js/config/environment.ts`.

Required or expected settings include:

- `MONGO_URI` – primary MongoDB connection string
- `PORT` – backend listening port
- `URL_HIVEMQTT` – MQTT broker endpoint
- `MQTT_PORT` – MQTT port
- `MQTT_USER` – MQTT username
- `MQTT_PASSWORD` – MQTT password
- `MONGO_LOCAL` – optional local fallback MongoDB connection string
- `AUTHOR`, `SERVER_NAME`, `MQTT_TOPIC_GET_IP` – optional metadata and topic settings

## Frontend environment variables

The frontend expects local development settings such as:

- `API_URL` – server-side backend target
- `NEXT_PUBLIC_SOCKET_URL` – browser-side Socket.IO URL

The helper `getApiUrl()` also supports runtime auto-discovery for local or LAN deployments.

## Docker deployment

The repo ships with:

- `docker-compose.yml`
- `Dockerfile`
- `frontend/Dockerfile`

The root `README.md` documents a deployment flow that includes:

1. Creating the root `.env`
2. Creating `frontend/.env.local` for local-only development
3. Building Docker images with `docker compose build`
4. Starting services with `docker compose up -d`

## Deployment topology

At a high level:

- The application container runs the Express backend and Socket.IO service
- The frontend container or Next.js dev server serves the UI
- MongoDB provides persistent state
- MQTT provides device status and board lifecycle messaging

## Operational observations

From the current codebase, the application is designed for:

- local dev and containerized deployment
- board/network reconnect scenarios
- automatic board cleanup after an extended offline period
- real-time board state propagation across multiple clients

## Recommended documentation usage

Use this documentation set together with the existing root and frontend READMEs for:

- setup and environment configuration
- component understanding
- API behavior
- deployment troubleshooting
