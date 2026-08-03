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
- `FRONTEND_BASE_PATH`
- `BACKEND_PROXY_URL`
- `URL_HIVEMQTT`
- `MQTT_USER`
- `MQTT_PASSWORD`

## Operational notes

### Build time

The frontend is expected to know its public-facing API and socket URLs at build time. This is why the Docker configuration relies on env values rather than only runtime browser heuristics.

### Runtime

The backend process is expected to stay alive and maintain the active game state map through the app lifecycle. This is why the runtime is designed around in-memory state plus durable persistence rather than fully stateless HTTP requests.

MongoDB Atlas `mongodb+srv://` connections use SRV DNS records. The backend uses the operating system DNS resolver so it works with institutional networks and VPN DNS policies; ensure the host can resolve `_mongodb._tcp.<cluster-host>` and reach the Atlas cluster.

## Vercel frontend with a Render backend

When the frontend is deployed at `https://be-chess-web.vercel.app` and the backend runs on Render, configure this Vercel **server-side** environment variable with the HTTPS Render service origin, then redeploy:

```env
BACKEND_PROXY_URL=https://<render-service>.onrender.com
```

Next.js forwards REST routes such as `/games/history/trash` through a server-side rewrite. Therefore DevTools can still show a request to `https://be-chess-web.vercel.app/games/history/trash`; that is correct—the Vercel server proxies it to Render. The backend must still have the corresponding route deployed; an unauthenticated request to the trash endpoint should return `401`, while `404` from the backend means the backend release is outdated.

In the **Render backend** service, configure these environment variables as well, then redeploy the service:

```env
JWT_SECRET=<long-random-private-signing-secret>
CORS_ORIGINS=https://be-chess-web.vercel.app
VERCEL_WEB=https://be-chess-web.vercel.app
```

`CORS_ORIGINS` is used by both Express REST endpoints and Socket.IO polling/WebSocket connections. For extra frontend domains, append exact origins separated by commas; do not use a wildcard and do not add a trailing slash.

## VPS deployment at `/chess`

For a VPS deployment at `/chess`, set only the following frontend values in the root ignored `.env` file next to `docker-compose.yml`. Do not add `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, or `NEXT_PUBLIC_BASE_PATH` there: Docker Compose derives those build arguments from these two values. `BACKEND_PUBLIC_URL` must be the domain origin without `/chess`, because Nginx proxies backend routes and Socket.IO at the root. Its protocol must match the protocol users use to open the site.

```env
FRONTEND_BASE_PATH=/chess
BACKEND_PUBLIC_URL=http://ttlab.uit.edu.vn
```

For HTTPS, replace `http://` with `https://` only after the HTTPS gateway/proxy is correctly configured. Rebuild the frontend after changing either value.

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

### TLS terminated before the VPS

When a tunnel or edge proxy owns HTTPS while the VPS accepts only port `80`, keep the API and `/socket.io/` proxy locations in the Nginx `listen 80` server. The edge proxy must forward `/chess/`, the API routes, and `/socket.io/` to that server and allow HTTP long-polling. The frontend starts Socket.IO with polling and upgrades to WSS only when the edge proxy supports WebSocket upgrades.

For same-domain deployments, the frontend also uses the protocol of the page for API and Socket.IO when an old build-time public URL differs only by `http` versus `https`. This avoids mixed-content requests while a corrected Docker image is being deployed.

## Cross references

- [04-environment.md](04-environment.md) describes the environment variables used by Compose.
- [03-boot-sequence.md](03-boot-sequence.md) describes how the runtime starts after deployment.
- [17-observability.md](17-observability.md) describes how to verify the deployed service health.
