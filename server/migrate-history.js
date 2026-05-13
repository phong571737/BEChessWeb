import { Chess } from "chess.js";
import { getDB, connectDB } from "./config/database.js";

function safeLoadPgn(pgn) {
  try {
    const c = new Chess();
    if (typeof pgn !== "string" || !pgn.trim()) return null;
    c.loadPgn(pgn);
    return c;
  } catch {
    return null;
  }
}

function normalizeDoc(doc) {
  const whiteName = doc.WhiteName ?? doc.White ?? "White";
  const blackName = doc.BlackName ?? doc.Black ?? "Black";

  const chess = safeLoadPgn(doc.pgn);
  const totalPliesFromPgn = chess ? chess.history().length : 0;

  const totalPlies = doc.totalPlies ?? doc.totalMoves ?? totalPliesFromPgn;
  const totalMoves = doc.totalMoves ?? doc.totalPlies ?? totalPliesFromPgn;

  const fenEnd = doc.fenEnd ?? (chess ? chess.fen() : undefined);
  const fenHistory = Array.isArray(doc.fenHistory) ? doc.fenHistory : [];

  const createAt = doc.createAt ?? doc.createdAt ?? doc.endedAt ?? new Date();
  const endedAt = doc.endedAt ?? doc.updateAt ?? createAt;

  const date = doc.Date ?? (createAt ? new Date(createAt).toISOString().slice(0, 10) : "");

  const source = doc.source ?? (fenHistory.length > 0 ? "fen" : "pgn");

  const quality = chess || fenHistory.length > 0 ? "ok" : "legacy_incomplete";

  return {
    WhiteName: whiteName,
    BlackName: blackName,
    White: whiteName,
    Black: blackName,
    totalPlies,
    totalMoves,
    fenStart: doc.fenStart ?? "start",
    fenEnd,
    fenHistory,
    Date: date,
    createAt,
    endedAt,
    source,
    dataQuality: quality,
  };
}

async function main() {
  await connectDB();
  const col = getDB().collection("pgn_games");

  const docs = await col.find({}).toArray();
  let updated = 0;

  for (const doc of docs) {
    const patch = normalizeDoc(doc);
    await col.updateOne({ _id: doc._id }, { $set: patch });
    updated++;
  }

  console.log(`[migrate-history] normalized ${updated} documents`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate-history] failed:", err);
  process.exit(1);
});
