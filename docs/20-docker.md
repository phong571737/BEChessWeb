# 20 — Docker Deployment

---

## `Dockerfile` — Server only image

```dockerfile
FROM node:20-alpine

WORKDIR /app/server

# Install production dependencies only
COPY server/package*.json ./
RUN npm install --omit=dev

# Copy server source
COPY server/ ./

EXPOSE 8080

ENTRYPOINT ["node", "server.js"]
```

This image contains only the Express server. The Next.js client is deployed separately (Vercel, a separate container, or a static export on a CDN).

**Why Alpine**: Smallest Node base image. Stockfish's `"lite-single"` WASM mode runs without native binaries, so Alpine is sufficient.

---

## `docker-compose.yml`

Standard three-service setup:

```yaml
services:
  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

  server:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    depends_on:
      - mongo
    environment:
      PORT: "8080"
      MONGO_URI: "mongodb://mongo:27017/chess"
      ALLOWED_ORIGINS: "http://localhost:3000"

  client:
    build:
      context: ./client
    ports:
      - "3000:3000"
    depends_on:
      - server
    environment:
      API_URL: "http://server:8080"

volumes:
  mongodb_data:
```

**Internal networking**: Docker services communicate on the `bridge` network using service names as hostnames. `server` calls `mongo` by its service name; `client` rewrites call `server` by its service name.

---

## Environment overrides for production

### Server container

```yaml
environment:
  PORT:            "8080"
  MONGO_URI:       "mongodb://mongo:27017/chess"    # internal Docker network
  ALLOWED_ORIGINS: "http://client:3000,https://your-domain.com"
```

For MongoDB Atlas in production:
```yaml
MONGO_URI: "mongodb+srv://user:pass@cluster.mongodb.net/?appName=Cluster0"
```

### Client container

```yaml
environment:
  API_URL: "http://server:8080"   # internal Docker network — build-time rewrite target
```

The `API_URL` is read by `next.config.ts` during `next build` to configure the rewrite destination. It is never sent to the browser.

---

## LAN access (ESP32)

The server listens on `0.0.0.0` (all interfaces), so it is reachable from other devices on the same network:

```
ESP32 → POST http://192.168.1.100:8080/moves { ... }
```

In Docker, ensure port 8080 is mapped:
```yaml
ports:
  - "8080:8080"
```

For Socket.io from browser on a phone or another machine, the client derives the URL from `window.location.hostname`, so as long as the user visits via the LAN IP (not localhost), Socket.io will connect to the right host automatically.

---

## Seeding in Docker

Run the seed script inside the running server container:

```bash
docker-compose exec server node seed.js
# or clean:
docker-compose exec server node seed.js --clean
```

---

## Notes

- **No Nginx needed** for local/LAN deployment — Express and Next.js both run their own HTTP servers.
- **Production (public)**: Put Nginx or a reverse proxy in front, terminate TLS, proxy `/` → Next.js port 3000, and expose Socket.io on a separate path or subdomain.
- **MongoDB persistence**: The `mongodb_data` named volume ensures data survives container restarts. Back it up before `docker-compose down -v`.
