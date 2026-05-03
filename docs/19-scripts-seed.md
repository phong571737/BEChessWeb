# 19 — Build, Run & Seed Scripts

---

## Root `package.json` scripts

```json
{
  "scripts": {
    "predev:server": "npm install --prefix server",
    "predev:client": "npm install --prefix client",
    "predev:all":    "npm install --prefix server && npm install --prefix client",
    "dev:server":    "npm run dev   --prefix server",
    "dev:client":    "npm run dev   --prefix client",
    "dev:all":       "concurrently -n \"express,nextjs\" -c \"cyan,magenta\" \"npm run dev --prefix server\" \"npm run dev --prefix client\"",
    "start":         "npm run start --prefix server",
    "seed":          "npm run seed  --prefix server",
    "seed:clean":    "npm run seed  --prefix server -- -- --clean"
  }
}
```

### Pre-hooks

`predev:server` and `predev:client` run automatically before `dev:server` / `dev:client`. They install dependencies if `node_modules` is missing or out of date. On a fresh clone:

```bash
npm run dev:server   # installs server/node_modules then starts nodemon
npm run dev:client   # installs client/node_modules then starts next dev
```

### Running both together

```bash
npm run dev:all
# Uses `concurrently` to stream both processes side by side.
# Express output: cyan  |  Next.js output: magenta
```

---

## Server scripts — `server/package.json`

```json
{
  "scripts": {
    "dev":   "nodemon server.js",
    "start": "node server.js",
    "seed":  "node seed.js"
  }
}
```

- `dev` — nodemon watches for file changes and auto-restarts
- `start` — plain Node.js, used in production / Docker

---

## Client scripts — `client/package.json`

```json
{
  "scripts": {
    "dev":   "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "lint":  "next lint"
  }
}
```

---

## Seed script — `server/seed.js`

Inserts sample data into MongoDB for UI testing. Uses `chess.js` to validate and compute state from PGN strings.

### Usage

```bash
npm run seed          # insert if not already present (upsert with $setOnInsert)
npm run seed:clean    # delete seed documents first, then re-insert
```

### What it inserts

**`games` collection — 3 active games**

| gameID | Opening | Plies |
|---|---|---|
| `game_alpha` | Ruy López Berlin Defense | 14 |
| `game_beta` | Sicilian Dragon | 12 |
| `game_gamma` | King's Indian Defense | 6 |

Each document has `fen`, `pgn`, `lastMove`, `lastSeq`, `WhiteName`, `BlackName`, `createdAt`.

**`pgn_games` collection — 8 historical games**

| gameID | White | Black | Result | Moves |
|---|---|---|---|---|
| `hist_001` | Paul Morphy | Duke of Brunswick | 1-0 | 17 |
| `hist_002` | Anderssen | Kieseritzky | 1-0 | 23 |
| `hist_003` | Anderssen | Dufresne | 1-0 | 24 |
| `hist_004` | Hoàng Long | Đức Anh | 1/2-1/2 | 18 |
| `hist_005` | Minh Tú | Thanh Hà | 0-1 | 2 |
| `hist_006` | Bảo Châu | Quang Vinh | 0-1 | 7 |
| `hist_007` | Kasparov | Topalov | 1-0 | 44 |
| `hist_008` | Fischer | Spassky | 1-0 | 41 |

### How seed data is built

```js
function buildActive(gameID, whiteName, blackName, pgnMoves) {
  const chess = new Chess();
  chess.loadPgn(pgnMoves);           // validates PGN
  const history = chess.history({ verbose: true });
  const last = history.at(-1);
  return {
    _id: gameID, gameID,
    fen:      chess.fen(),
    pgn:      chess.pgn(),
    lastMove: last ? { from, to, uci } : null,
    lastSeq:  history.length,
    WhiteName: whiteName, BlackName: blackName,
    createdAt: new Date(), updateAt: new Date(),
  };
}
```

All PGNs are verified famous historical games (Morphy, Anderssen, Kasparov, Fischer) that are guaranteed to parse correctly in chess.js.

### Upsert strategy

```js
await gamesCol.updateOne(
  { _id: game._id },
  { $setOnInsert: game },   // only insert if _id doesn't exist
  { upsert: true }
);
```

Running `npm run seed` twice does not duplicate data.

---

## Production build

```bash
# Build Next.js client
cd client && npm run build

# Start Express server
npm run start   # from root — runs node server.js

# Start Next.js (after build)
cd client && npm start
```

Or use Docker (see [20-docker.md](./20-docker.md)).
