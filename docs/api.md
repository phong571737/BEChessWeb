# API Reference (Legacy Link)

This compatibility file is retained for existing links. The maintained API documentation is split by transport:

- [06-api-rest.md](06-api-rest.md) — Express routes, authentication, history, game actions, and MQTT command payloads
- [07-api-socket.md](07-api-socket.md) — Socket.IO rooms, events, payloads, and frontend consumers

The backend routes are mounted directly at `/auth`, `/boards`, `/moves`, and `/games`; there is no `/api` prefix.
