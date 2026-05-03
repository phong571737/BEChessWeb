/**
 * Seed script — inserts sample data for UI testing.
 *
 * Usage (from project root):
 *   npm run seed              ← insert sample data (skip if already exists)
 *   npm run seed -- --clean   ← wipe seed data first, then re-insert
 */

import { Chess } from "chess.js";
import { connectDB, getDB } from "./config/database.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildActive(gameID, whiteName, blackName, pgnMoves) {
  const chess = new Chess();
  chess.loadPgn(pgnMoves);
  const history = chess.history({ verbose: true });
  const last = history.at(-1);
  return {
    _id:       gameID,
    gameID,
    WhiteName: whiteName,
    BlackName: blackName,
    fen:       chess.fen(),
    pgn:       chess.pgn(),
    lastMove:  last ? { from: last.from, to: last.to, uci: last.from + last.to } : null,
    lastSeq:   history.length,
    createdAt: new Date(),
    updateAt:  new Date(),
  };
}

function buildHistory(gameID, white, black, pgn, createdAt) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const headers = chess.getHeaders();
  const startedAt = new Date(createdAt);
  const durationSec = 120 + Math.floor(Math.random() * 5400); // 2m -> 92m
  const endedAt = new Date(startedAt.getTime() + durationSec * 1000);
  return {
    gameID,
    White:      white,
    Black:      black,
    Result:     headers.Result || "*",
    Date:       headers.Date   || new Date(createdAt).toISOString().slice(0, 10).replace(/-/g, "."),
    pgn:        chess.pgn(),
    totalMoves: chess.history().length,
    createAt:   startedAt,
    endedAt,
    durationSec,
  };
}

function generateBulkHistory(count = 80) {
  const whiteNames = ["Fischer", "Kasparov", "Carlsen", "Anand", "Nakamura", "Lê Quang Liêm", "Polgar", "Kramnik", "Topalov", "Rapport"];
  const blackNames = ["Spassky", "Karpov", "Nepomniachtchi", "Ding", "Firouzja", "So", "Giri", "Aronian", "Ivanchuk", "Karjakin"];
  const pgnPool = [
    `[White "W"][Black "B"][Result "1-0"][Date "2026.04.01"] 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.b4 Bxb4 5.c3 Ba5 6.d4 exd4 7.O-O d3 8.Qb3 Qf6 9.e5 Qg6 10.Re1 Nge7 11.Ba3 b5 12.Qxb5 1-0`,
    `[White "W"][Black "B"][Result "0-1"][Date "2026.04.02"] 1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.e3 O-O 5.Bd3 d5 6.Nf3 c5 7.O-O Nc6 8.a3 Bxc3 9.bxc3 dxc4 10.Bxc4 Qc7 11.Bd3 e5 0-1`,
    `[White "W"][Black "B"][Result "1/2-1/2"][Date "2026.04.03"] 1.Nf3 d5 2.g3 c6 3.Bg2 Bg4 4.O-O Nd7 5.d3 e5 6.Nbd2 Ngf6 7.e4 Be7 8.h3 Bh5 9.Qe1 O-O 10.Nh4 Re8 1/2-1/2`,
  ];

  const base = new Date("2026-03-01T08:00:00Z").getTime();
  return Array.from({ length: count }).map((_, i) => {
    const white = whiteNames[i % whiteNames.length];
    const black = blackNames[(i * 3) % blackNames.length];
    const pgn = pgnPool[i % pgnPool.length]
      .replace(`[White "W"]`, `[White "${white}"]`)
      .replace(`[Black "B"]`, `[Black "${black}"]`);
    const createdAt = new Date(base + i * 6 * 60 * 60 * 1000).toISOString();
    return buildHistory(`bulk_${String(i + 1).padStart(3, "0")}`, white, black, pgn, createdAt);
  });
}

// ─── active games (games collection) ─────────────────────────────────────────

const ACTIVE_GAMES = [
  buildActive(
    "game_alpha", "Trần Minh", "Lê Hoàng",
    // Ruy López Berlin Defense — 14 moves in
    `1.e4 e5 2.Nf3 Nc6 3.Bb5 Nf6 4.O-O Nxe4 5.d4 Nd6 6.Bxc6 dxc6
     7.dxe5 Nf5 8.Qxd8+ Kxd8 9.Nc3 Ke8 10.h3 h5 11.Bf4 Be6
     12.Rad1 Rd8 13.Rxd8+ Kxd8 14.Rd1+ Ke8`
  ),
  buildActive(
    "game_beta", "Nguyễn Văn A", "Phạm Thị B",
    // Sicilian Dragon — 12 moves in
    `1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 g6
     6.Be3 Bg7 7.f3 O-O 8.Qd2 Nc6 9.Bc4 Bd7 10.O-O-O Rc8
     11.Bb3 Ne5 12.h4 h5`
  ),
  buildActive(
    "game_gamma", "Hoàng Long", "Đức Anh",
    // King's Indian — 6 moves in (opening phase)
    `1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Nf3 O-O 6.Be2 e5`
  ),
];

// ─── history games (pgn_games collection) ────────────────────────────────────

const HISTORY_GAMES = [
  buildHistory(
    "hist_001", "Paul Morphy", "Duke of Brunswick",
    // Morphy's Opera Game 1858 — 1-0 in 17 moves
    `[White "Paul Morphy"][Black "Duke of Brunswick"][Result "1-0"][Date "1858.01.01"]
     1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5
     6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5
     11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6
     15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0`,
    "2024-11-01"
  ),
  buildHistory(
    "hist_002", "Anderssen", "Kieseritzky",
    // The Immortal Game 1851 — 1-0 in 23 moves (famous sacrifices)
    `[White "Anderssen"][Black "Kieseritzky"][Result "1-0"][Date "1851.06.21"]
     1.e4 e5 2.f4 exf4 3.Bc4 Qh4+ 4.Kf1 b5 5.Bxb5 Nf6
     6.Nf3 Qh6 7.d3 Nh5 8.Nh4 Qg5 9.Nf5 c6 10.g4 Nf6
     11.Rg1 cxb5 12.h4 Qg6 13.h5 Qg5 14.Qf3 Ng8 15.Bxf4 Qf6
     16.Nc3 Bc5 17.Nd5 Qxb2 18.Bd6 Bxg1 19.e5 Qxa1+
     20.Ke2 Na6 21.Nxg7+ Kd8 22.Qf6+ Nxf6 23.Be7# 1-0`,
    "2025-01-10"
  ),
  buildHistory(
    "hist_003", "Anderssen", "Dufresne",
    // The Evergreen Game 1852 — 1-0 in 24 moves
    `[White "Anderssen"][Black "Dufresne"][Result "1-0"][Date "1852.01.01"]
     1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.b4 Bxb4 5.c3 Ba5
     6.d4 exd4 7.O-O d3 8.Qb3 Qf6 9.e5 Qg6 10.Re1 Nge7
     11.Ba3 b5 12.Qxb5 Rb8 13.Qa4 Bb6 14.Nbd2 Bb7 15.Ne4 Qf5
     16.Bxd3 Qh5 17.Nf6+ gxf6 18.exf6 Rg8 19.Rad1 Qxf3
     20.Rxe7+ Nxe7 21.Qxd7+ Kxd7 22.Bf5+ Ke8 23.Bd7+ Kf8
     24.Bxe7# 1-0`,
    "2025-02-14"
  ),
  buildHistory(
    "hist_004", "Hoàng Long", "Đức Anh",
    // Tal vs Smyslov 1959 style — draw in 18 moves
    `[White "Hoàng Long"][Black "Đức Anh"][Result "1/2-1/2"][Date "2025.03.20"]
     1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Be2 O-O 6.Nf3 e5
     7.O-O Nc6 8.d5 Ne7 9.Ne1 Nd7 10.Nd3 f5 11.Bd2 Nf6
     12.f3 f4 13.c5 g5 14.Rc1 Ng6 15.cxd6 cxd6 16.Nb5 Rf7
     17.Nbc7 Rb8 18.Nb5 Rf8 1/2-1/2`,
    "2025-03-20"
  ),
  buildHistory(
    "hist_005", "Minh Tú", "Thanh Hà",
    // Fool's Mate — 0-1 in 2 moves
    `[White "Minh Tú"][Black "Thanh Hà"][Result "0-1"][Date "2025.04.01"]
     1.f3 e5 2.g4 Qh4# 0-1`,
    "2025-04-01"
  ),
  buildHistory(
    "hist_006", "Bảo Châu", "Quang Vinh",
    // Legal's Mate style quick game — 0-1 in 7 moves
    `[White "Bảo Châu"][Black "Quang Vinh"][Result "0-1"][Date "2025.04.15"]
     1.e4 e5 2.Nf3 Nc6 3.Bc4 Nd4 4.Nxe5 Qg5 5.Nxf7 Qxg2
     6.Rf1 Qxe4+ 7.Be2 Nf3# 0-1`,
    "2025-04-15"
  ),
  buildHistory(
    "hist_007", "Kasparov", "Topalov",
    // Kasparov's Immortal 1999 — 1-0 in 44 moves
    `[White "Kasparov"][Black "Topalov"][Result "1-0"][Date "1999.01.20"]
     1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.Be3 Bg7 5.Qd2 c6 6.f3 b5
     7.Nge2 Nbd7 8.Bh6 Bxh6 9.Qxh6 Bb7 10.a3 e5 11.O-O-O Qe7
     12.Kb1 a6 13.Nc1 O-O-O 14.Nb3 exd4 15.Rxd4 c5 16.Rd1 Nb6
     17.g3 Kb8 18.Na5 Ba8 19.Bh3 d5 20.Qf4+ Ka7 21.Rhe1 d4
     22.Nd5 Nbxd5 23.exd5 Qd6 24.Rxd4 cxd4 25.Re7+ Kb6
     26.Qxd4+ Kxa5 27.b4+ Ka4 28.Qc3 Qxd5 29.Ra7 Bb7
     30.Rxb7 Qc4 31.Qxf6 Kxa3 32.Qxa6+ Kxb4 33.c3+ Kxc3
     34.Qa1+ Kd2 35.Qb2+ Kd1 36.Bf1 Rd2 37.Rd7 Rxd7
     38.Bxc4 bxc4 39.Qxh8 Rd3 40.Qa8 c3 41.Qa4+ Ke1
     42.f4 f5 43.Kc1 Rd2 44.Qa7 1-0`,
    "2025-04-20"
  ),
  buildHistory(
    "hist_008", "Fischer", "Spassky",
    // Fischer vs Spassky 1972 Game 6 — 1-0 in 41 moves
    `[White "Fischer"][Black "Spassky"][Result "1-0"][Date "1972.07.23"]
     1.c4 e6 2.Nf3 d5 3.d4 Nf6 4.Nc3 Be7 5.Bg5 O-O 6.e3 h6
     7.Bh4 b6 8.cxd5 Nxd5 9.Bxe7 Qxe7 10.Nxd5 exd5 11.Rc1 Be6
     12.Qa4 c5 13.Qa3 Rc8 14.Bb5 a6 15.dxc5 bxc5 16.O-O Ra7
     17.Be2 Nd7 18.Nd4 Qf8 19.Nxe6 fxe6 20.e4 d4 21.f4 Qe7
     22.e5 Rb8 23.Bc4 Kh8 24.Qh3 Nf8 25.b3 a5 26.f5 exf5
     27.Rxf5 Nh7 28.Rcf1 Qd8 29.Qg3 Re7 30.h4 Rbb7 31.e6 Rbc7
     32.Qe5 Qe8 33.a4 Qd8 34.R1f2 Qe8 35.R2f3 Qd8 36.Bd3 Qe8
     37.Qe4 Nf6 38.Rxf6 gxf6 39.Rxf6 Kg8 40.Bc4 Kh8 41.Qf4 1-0`,
    "2025-04-25"
  ),
];

const BULK_HISTORY_GAMES = generateBulkHistory(80);

// ─── main ─────────────────────────────────────────────────────────────────────

async function seed() {
  const isClean = process.argv.includes("--clean");
  const withBulk = process.argv.includes("--bulk");

  await connectDB();
  const db = getDB();

  const gamesCol   = db.collection("games");
  const historyCol = db.collection("pgn_games");

  if (isClean) {
    await gamesCol.deleteMany({ _id: { $in: ACTIVE_GAMES.map(g => g._id) } });
    await historyCol.deleteMany({ gameID: { $in: HISTORY_GAMES.map(g => g.gameID) } });
    if (withBulk) {
      await historyCol.deleteMany({ gameID: { $regex: /^bulk_/ } });
    }
    console.log("Cleaned existing seed data.\n");
  }

  for (const game of ACTIVE_GAMES) {
    await gamesCol.updateOne(
      { _id: game._id },
      { $setOnInsert: game },
      { upsert: true }
    );
    console.log(`✓ active   ${game._id.padEnd(14)} ${game.WhiteName} vs ${game.BlackName}  (${game.lastSeq} moves)`);
  }

  console.log();

  const allHistory = withBulk ? [...HISTORY_GAMES, ...BULK_HISTORY_GAMES] : HISTORY_GAMES;

  for (const game of allHistory) {
    await historyCol.updateOne(
      { gameID: game.gameID },
      { $setOnInsert: game },
      { upsert: true }
    );
    console.log(`✓ history  ${game.gameID.padEnd(10)} ${game.White.padEnd(14)} vs ${game.Black.padEnd(14)} [${game.Result}]  ${game.totalMoves} plies`);
  }

  console.log(`\nDone. ${ACTIVE_GAMES.length} active  |  ${allHistory.length} history`);
  process.exit(0);
}

seed().catch(err => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
