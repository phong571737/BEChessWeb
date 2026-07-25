# ♟️♟️♟️ TTLab Chess Web

A real-time online chess application with a web interface, backend API, and socket communication for live gameplay.

## Overview

TTLab Chess Web is a full-stack chess platform that combines:
- **Backend**: Node.js/Express server with chess logic and real-time updates
- **Frontend**: Interactive web interface with chessboard visualization
- **Real-time Communication**: WebSocket support via Socket.io for live moves
- **Database**: MongoDB for game persistence
- **Messaging**: MQTT integration for IoT communication
- **Deployment**: Docker & Docker Compose for containerized deployment

## System Requirements

### Windows

- **Docker Desktop** (v4.0+) - [Download](https://www.docker.com/products/docker-desktop)
  - Includes Docker Engine and Docker Compose
  - Requires Windows 10/11 Pro, Enterprise, or Education edition
  - Enable WSL 2 (Windows Subsystem for Linux 2)

### macOS

- **Docker Desktop** (v4.0+) - [Download](https://www.docker.com/products/docker-desktop)
  - Includes Docker Engine and Docker Compose
  - Requires macOS 11 (Big Sur) or newer
  - Native Apple Silicon (M1/M2) or Intel support

### Linux

Install Docker and Docker Compose:

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install docker.io docker-compose

# Fedora
sudo dnf install docker docker-compose

# Start Docker daemon
sudo systemctl start docker
sudo systemctl enable docker

# Optional: Add user to docker group (avoid sudo)
sudo usermod -aG docker $USER
```

## Quick Start with Docker

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/TTLab_BEChessWeb.git
cd TTLab_BEChessWeb
```

### Step 2: Create Environment Files

Create a `.env` file in the root directory:

```bash
#mongodb
MONGO_URI=mongodb+srv://<username>:<password>@<your-cluster>.mongodb.net/?appName=<your-app>
MONGO_LOCAL=mongodb://localhost:27017
VERCEL_WEB=https://<your-vercel-app>.vercel.app
AUTHOR=<your-name>
PORT=8080
SERVER_NAME=<your-server-name>

# Public hostnames fronted by Pangolin (Newt tunnel), used only at
# `docker compose build` time to bake the frontend's browser-facing API/socket URLs.
FRONTEND_PUBLIC_URL=https://<your-frontend-domain>
BACKEND_PUBLIC_URL=https://<your-backend-domain>
# MQTT
URL_HIVEMQTT=mqtts://<your-broker-url>.hivemq.cloud
MQTT_USER=<your-mqtt-username>
MQTT_PASSWORD=<your-mqtt-password>
MQTT_PORT=8883
MQTT_TOPIC_GET_IP=<your/mqtt/topic>
```

Create a `frontend/.env.local` file (local, non-Docker `npm run dev` only — Docker Compose bakes the equivalent values in at build time instead):

```bash
API_URL=http://localhost:8080          # HTTP proxy target (server-side)
NEXT_PUBLIC_SOCKET_URL=http://localhost:8080   # Socket.io URL (browser-side)
```

**Configuration Details:**
- `MONGO_URI` - MongoDB Atlas connection string
- `MONGO_LOCAL` - Local MongoDB fallback URI
- `VERCEL_WEB` - URL of the Vercel-hosted frontend deployment
- `PORT` - Application port (default: 8080)
- `SERVER_NAME` - Identifier for this server instance
- `AUTHOR` - Server author/maintainer name
- `FRONTEND_PUBLIC_URL` / `BACKEND_PUBLIC_URL` - Public hostnames (fronted by Pangolin/Newt) baked into the frontend build for browser-facing API/socket calls
- `URL_HIVEMQTT` - MQTT broker URL
- `MQTT_USER` / `MQTT_PASSWORD` - MQTT authentication credentials
- `MQTT_PORT` - MQTT broker port (8883 for secure)
- `MQTT_TOPIC_GET_IP` - MQTT topic for IP discovery

### Step 3: Build and Deploy with Docker Compose

```bash
# Navigate to project root
cd TTLab_BEChessWeb

# Build Docker image
docker compose build

# Start all services
docker compose up -d

# Verify services are running
docker compose ps
```

### Step 4: Verify Deployment

```bash
# Check application logs
docker compose logs -f app

# Check MongoDB connection
docker compose logs mongodb

# Test the application
curl http://localhost:8080

# View all running containers
docker compose ps
```

## Docker Architecture

```
┌─────────────────────────────────────────────────────┐
│         Docker Compose Network                      │
│         (ttlab-network)                             │
│                                                     │
│  ┌────────────────────────────────────────────┐   │
│  │   Chess App Container                      │   │
│  │  (Port 8080)                               │   │
│  │                                            │   │
│  │  Node.js v18                               │   │
│  │  Express + Socket.io                       │   │
│  │  MQTT client                               │   │
│  │                                            │   │
│  │  Connects to:                              │   │
│  │  - MongoDB Atlas (Cloud)                   │   │
│  │  - HiveMQ Cloud (MQTT)                     │   │
│  └────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Common Docker Commands

### View Logs

```bash
# View all service logs
docker compose logs

# View specific service logs (follow mode)
docker compose logs -f app

# View last 50 lines
docker compose logs --tail=50
```

### Manage Services

```bash
# Start services
docker compose up -d

# Stop services
docker compose stop

# Restart services
docker compose restart

# Stop and remove containers
docker compose down

# Stop and remove containers + volumes
docker compose down -v

# View running containers
docker compose ps

# Execute command in running container
docker compose exec app npm list
```

### Troubleshooting

```bash
# View service status
docker compose ps

# Check application health
docker compose exec app curl http://localhost:8080

# View Docker images
docker images

# Remove unused images
docker image prune

# View Docker networks
docker network ls

# Inspect service details
docker compose exec app env
```

## Project Structure

```text
BEChessWeb/
├── frontend/                    # Next.js 16 / React 19 TypeScript web client
│   ├── app/                     # App Router pages, including the board and history views
│   ├── components/              # UI, home, board, layout, and provider components
│   ├── hooks/                   # Game loading, chess-clock, socket, board, and Stockfish hooks
│   ├── lib/                     # Zustand state, API URL, Socket.IO client, and shared utilities
│   ├── locales/                 # English and Vietnamese translations
│   ├── public/                  # Static images and Stockfish browser assets
│   ├── types/                   # Frontend TypeScript game and socket contracts
│   ├── Dockerfile               # Frontend production image
│   └── README.md                # Frontend setup and structure notes
├── src/
│   ├── js/                      # Express backend TypeScript source
│   │   ├── config/              # Environment and MongoDB setup
│   │   ├── controllers/         # HTTP request handlers
│   │   ├── game/                # In-memory chess games, repository maps, and game state
│   │   ├── models/              # MongoDB game, move, PGN, user, and log persistence
│   │   ├── routes/              # REST routes for boards, games, moves, and authentication
│   │   ├── services/            # Game, move, board, branch, resign, and MQTT logic
│   │   ├── sockets/             # Socket.IO initialization, events, and emitters
│   │   ├── types/               # Backend request, game, board, chess, and move types
│   │   ├── utils/               # Chess, UCI, caching, and branch helpers
│   │   └── server.ts            # Express, Socket.IO, and MQTT application entry point
│   └── lib/                     # Vendored chess.js and chessboard.js libraries
├── docs/                        # Architecture, API, environment, deployment, and UI documentation
├── tools/                       # Local MQTT publish and Socket.IO listening scripts
├── Dockerfile                   # Backend/container image definition
├── docker-compose.yml           # Docker Compose deployment configuration
├── package.json                 # Backend scripts and dependencies
├── tsconfig.json                # Backend TypeScript configuration
└── README.md                    # Project overview and setup guide
```

The frontend calls the backend through its `/games` and `/boards` proxies (`API_URL`) and connects directly to Socket.IO with `NEXT_PUBLIC_SOCKET_URL`. Game and clock configuration are loaded through `frontend/hooks/use-game.ts`, displayed by `frontend/hooks/use-chess-clock.ts`, and persisted by the backend game model and services under `src/js/`. MQTT integration is implemented in `src/js/services/mqtt.service.ts`; REST and Socket.IO entry points are in `src/js/routes/` and `src/js/sockets/`.

## API Endpoints

### Game Routes
- `GET /api/games` - List all games
- `POST /api/boards` - Create a new game
- `GET /api/games/:id` - Get game details
- `PUT /api/games/:id` - Update game

### Move Routes
- `POST /api/moves` - Make a move in a game
- `GET /api/moves/:gameId` - Get move history

## WebSocket Events

Real-time communication via Socket.io:
- `esp_move` - Broadcast when a move is made
- `game_update` - Broadcast when game state changes

## Key Dependencies

- **chess.js** (v1.4.0) - Chess engine for move validation
- **express** (v5.1.0) - Web framework
- **socket.io** (v4.8.1) - Real-time WebSocket communication
- **mongodb** (v7.0.0) - Database driver
- **mqtt** (v5.15.1) - MQTT client for IoT integration
- **cors** (v2.8.6) - Cross-origin resource sharing
- **dotenv** (v17.2.3) - Environment variable management

## Deployment Tips

### Production Considerations

1. **Use MongoDB Atlas** (Cloud database) instead of local MongoDB
2. **Set strong MQTT passwords** with special characters
3. **Enable HTTPS/TLS** for MQTT connections (mqtts://)
4. **Use environment-specific `.env` files**
5. **Monitor container logs** regularly
6. **Set resource limits** in docker-compose.yml

### Scaling

For production deployment with multiple instances:

```bash
# Scale app service to 3 replicas
docker compose up -d --scale app=3

# Use a reverse proxy (Nginx) for load balancing
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs app

# Verify .env file exists and has required variables
cat .env

# Rebuild image
docker compose build --no-cache
docker compose up -d
```

### MongoDB connection error

```bash
# Verify MongoDB is running
docker compose ps

# Check MongoDB logs
docker compose logs mongodb

# Test connection
docker compose exec app mongosh mongodb://mongodb:27017
```

### Port already in use

```bash
# Change PORT in .env file
PORT=8081

# Restart services
docker compose restart
```

## License

See individual library licenses:
- chess.js - BSD-2-Clause
- chessboard.js - MIT

## Contributing

To contribute to this project:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Build and test with Docker
5. Submit a pull request

## Support

For issues or questions:
- Check Docker logs: `docker compose logs`
- Review `.env` configuration
- Verify MongoDB/MQTT connectivity
- Check firewall and port availability

## Security Notes

- Never commit `.env` file to version control
- Use strong passwords for MQTT and MongoDB
- Keep Docker images updated: `docker compose pull`
- Regularly backup `mongodb_data` volume
- Use environment variables for sensitive data only

---
