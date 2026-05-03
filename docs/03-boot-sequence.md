# 03 — Server Entry Point & Boot Sequence

**File**: `server/server.js`

---

## Startup steps (in order)

```
Step 1 — Override DNS resolvers
  dnsSetServers(["1.1.1.1", "8.8.8.8"])
  ↳ Required for MongoDB Atlas SRV record resolution.
    Without this, DNS lookup for *.mongodb.net may fail on some
    corporate/ISP networks that block or cache SRV records poorly.

Step 2 — Create HTTP server
  const app    = express()
  const server = createServer(app)

Step 3 — Register middleware
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

Step 4 — Mount routers
  app.use("/games", gameRouter)   → game.route.js
  app.use("/moves", moveRouter)   → move.route.js
  app.use("/",      evalRouter)   → eval.route.js  (GET /eval)

Step 5 — Connect to MongoDB Atlas
  await connectDB()
  ↳ Calls client.connect(), then pings "admin" db to verify.
  ↳ On failure → console.error + process.exit(1)
    (server will NOT start if DB is unreachable)

Step 6 — Initialise Socket.io
  initSocket(server)
  ↳ Attaches io to the http.Server instance.
  ↳ Registers game room events and eval events.
  ↳ CORS origins from ALLOWED_ORIGINS env var.

Step 7 — Start Stockfish engine
  stockfishService.init()
  ↳ Loads Stockfish WASM ("lite-single" mode).
  ↳ Sends "uci" + "isready" commands.
  ↳ Sets up engine.listener for score/bestmove parsing.

Step 8 — Listen
  server.listen(PORT, "0.0.0.0", callback)
  ↳ Binds on all interfaces (0.0.0.0) so ESP32 on LAN can reach it.
  ↳ Logs:
      Express running on:
        Local:   http://localhost:8080
        Network: http://<LAN-IP>:8080
```

---

## LAN IP detection

```js
function getLocalIp() {
  // Checks Wi-Fi adapter first (Windows label "Wi-Fi")
  // Falls back to any non-internal IPv4, excluding 192.168.56.x (VirtualBox)
  return "127.0.0.1" if nothing found
}
```

---

## Critical dependency: DNS override

The line `dnsSetServers(["1.1.1.1", "8.8.8.8"])` is at the **top of the file**, before any other import resolves. This is intentional — Node resolves DNS at connection time, so the override must be in place before `connectDB()` runs.

If you remove this line and MongoDB connection fails with `querySrv ENOTFOUND`, restore it.

---

## No CORS middleware

There is no `cors()` middleware on the Express app. All browser REST traffic is proxied through Next.js rewrites. Only Socket.io uses a CORS config (managed inside `sockets/index.js` via the `ALLOWED_ORIGINS` env var).
