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

## VPS deployment at `/chess`

For `http://ttlab.uit.edu.vn/chess`, create the ignored file `frontend/.env.production` on the VPS with the following build-time values. Never commit this environment file. `NEXT_PUBLIC_BASE_PATH=/chess` is a build-time value, so rebuild/restart the Next.js frontend after changing it. `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` must be the domain origin without `/chess`, because Nginx proxies backend routes and Socket.IO at the root.

```env
API_URL=http://127.0.0.1:8080
NEXT_PUBLIC_API_URL=http://ttlab.uit.edu.vn
NEXT_PUBLIC_SOCKET_URL=http://ttlab.uit.edu.vn
NEXT_PUBLIC_BASE_PATH=/chess
```

Use this Nginx shape (adjust the backend port if the service does not run on `8080`):

```nginx
location = /chess { return 301 /chess/; }

location ^~ /chess/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

location ~ ^/(auth|games|moves|boards|eval)(/|$) {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /socket.io/ {
    proxy_pass http://127.0.0.1:8080/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Do not add a separate `/images/` proxy location. The Next.js app now serves its public images, Stockfish worker, and APK under `/chess`; shared public-asset paths include the configured base path, and image optimization is disabled so public asset paths do not trigger the failing `/_next/image` request.

## Cross references

- [04-environment.md](04-environment.md) describes the environment variables used by Compose.
- [03-boot-sequence.md](03-boot-sequence.md) describes how the runtime starts after deployment.
- [17-observability.md](17-observability.md) describes how to verify the deployed service health.
