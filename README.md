# TTLab Chess Web

A real-time online chess application with a web interface, backend API, and socket communication for live gameplay.

## Overview

TTLab Chess Web is a full-stack chess platform that combines:
- **Backend**: Node.js/Express server with chess logic and real-time updates
- **Frontend**: Interactive web interface with chessboard visualization
- **Real-time Communication**: WebSocket support via Socket.io for live moves
- **Database**: MongoDB for game persistence
- **Messaging**: MQTT integration for IoT communication

## Project Structure

```
src/
├── js/                          # Backend source code
│   ├── server.js               # Main Express server
│   ├── config/
│   │   ├── database.js         # MongoDB configuration
│   │   └── environment.js      # Environment variables
│   ├── controllers/
│   │   └── game.controller.js  # Game request handlers
│   ├── models/
│   │   └── game.model.js       # Database models
│   ├── routes/
│   │   ├── game.route.js       # Game endpoints
│   │   └── move.route.js       # Move endpoints
│   ├── services/
│   │   ├── board.service.js    # Board utilities
│   │   └── game.service.js     # Game logic
│   ├── game/
│   │   └── game.manager.js     # Game state management
│   ├── sockets/
│   │   └── index.js            # WebSocket handlers
│   └── utils/
│       └── ucis.js             # Chess utilities
├── lib/                         # Third-party libraries
│   ├── chess.js/               # Chess engine library
│   └── chessboardjs-1.0.0/     # Chessboard UI library
└── ServerWeb/                   # Frontend assets
    ├── app.js                  # Frontend application
    ├── html/                   # HTML templates
    ├── css/                    # Stylesheets
    ├── js/                     # Client-side JavaScript
    └── img/                    # Images
```

## Prerequisites

- **Node.js** (v18+)
- **MongoDB** (running locally or remote URI)
- **npm** or **pnpm** package manager
- Environment variables configured in `.env`

## Installation

1. Clone the repository
2. Install dependencies:
```bash
pnpm install
```

3. Create a `.env` file in the root directory with the following variables:
```
MONGO_URI=mongodb://localhost:27017/ttlab-chess
PORT=3000
SERVER_NAME=TTLabChess
AUTHOR=Your Name
URL_HIVEMQTT=mqtt://broker.hivemq.com
MQTT_USER=your_username
MQTT_PASSWORD=your_password
MQTT_PORT=8884
MQTT_TOPIC_GET_IP=ttlab/chess/ip
```

## Running the Application

Start the server with live reloading:
```bash
npm run dev
```

The server will start on the configured PORT (default: 3000).

## Key Dependencies

- **chess.js** (v1.4.0) - Chess engine for move validation and game logic
- **express** (v5.1.0) - Web framework
- **socket.io** (v4.8.1) - Real-time WebSocket communication
- **mongodb** (v7.0.0) - Database driver
- **mqtt** (v5.15.1) - MQTT client for IoT integration
- **cors** (v2.8.6) - Cross-origin resource sharing
- **dotenv** (v17.2.3) - Environment variable management

## API Endpoints

### Game Routes
- `GET /api/games` - List all games
- `POST /api/games` - Create a new game
- `GET /api/games/:id` - Get game details
- `PUT /api/games/:id` - Update game

### Move Routes
- `POST /api/moves` - Make a move in a game
- `GET /api/moves/:gameId` - Get move history

## WebSocket Events

The application uses Socket.io for real-time updates:
- `esp_move` - Broadcast when a move is made
- `game_update` - Broadcast when game state changes

## Features

- ✅ Real-time multiplayer chess
- ✅ Move validation and legality checking
- ✅ Game persistence with MongoDB
- ✅ Interactive chessboard UI
- ✅ Live game notifications via WebSocket
- ✅ PGN support for game replay
- ✅ MQTT integration for IoT devices
- ✅ RESTful API for game management

## Development

- **Live Reloading**: Uses nodemon for automatic restart on file changes
- **Code Quality**: ESLint and Prettier configurations available
- **Testing**: Test structure ready in library files

## License

See individual library licenses:
- chess.js - BSD-2-Clause
- chessboard.js - MIT

## Contributing

To contribute to this project, please follow the existing code structure and ensure all dependencies are properly configured.

## Support

For issues or questions, please refer to the project documentation or contact the development team.
