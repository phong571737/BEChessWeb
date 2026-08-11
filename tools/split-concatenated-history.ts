/// <reference types="node" />
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { MongoClient, type Document } from "mongodb";

type HistoryDocument = Document & {
  gameID?: string;
  fenHistory?: unknown[];
  uciHistory?: unknown[];
  totalMoves?: number;
  pgn?: string;
};

/** Count pieces in a FEN board section without applying chess rules. */
function pieceCount(fen: string): number {
  const board = fen.trim().split(/\s+/)[0] ?? "";
  return [...board].reduce((count, symbol) => count + (/[prnbqkPRNBQK]/.test(symbol) ? 1 : 0), 0);
}

/** Find the first snapshot that looks like a new initial setup after a reduced end position. */
function findSplitIndex(fens: string[]): number {
  for (let index = 1; index < fens.length; index += 1) {
    const previous = pieceCount(fens[index - 1]!);
    const current = pieceCount(fens[index]!);
    if (previous <= 16 && current >= 24) return index;
  }
  return -1;
}

/** Create a safe migration preview and optionally write the two sessions. */
async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is required");
  const apply = process.argv.includes("--apply");
  const requestedId = process.argv.find((value: string) => value.startsWith("--game-id="))?.slice(10);
  const requestedUciSplit = process.argv.find((value: string) => value.startsWith("--uci-split="))?.slice(12);
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const collection = client.db().collection<HistoryDocument>("game_history");
    const backups = client.db().collection<Document>("game_history_repair_backups");
    const filter: Document = requestedId ? { $or: [{ _id: requestedId }, { gameID: requestedId }] } : {};
    const candidates = await collection.find(filter).toArray();
    let changed = 0;

    for (const original of candidates) {
      const fens = Array.isArray(original.fenHistory) ? original.fenHistory.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
      const split = findSplitIndex(fens);
      if (split <= 0 || split >= fens.length) continue;
      const uci = Array.isArray(original.uciHistory) ? original.uciHistory : [];
      const firstId = typeof original._id === "string" ? original._id : (original.gameID ?? randomUUID());
      const secondId = randomUUID();
      const parsedUciSplit = requestedUciSplit === undefined ? split : Number(requestedUciSplit);
      const uciSplit = Number.isInteger(parsedUciSplit) && parsedUciSplit >= 0 && parsedUciSplit <= uci.length
        ? parsedUciSplit
        : Math.min(split, uci.length);
      const first: Document = { ...original, _id: firstId, gameID: firstId, fenHistory: fens.slice(0, split), uciHistory: uci.slice(0, uciSplit), totalMoves: split, pgn: "", Result: "*", historyStatus: "active" };
      const second: Document = { ...original, _id: secondId, gameID: secondId, fenHistory: fens.slice(split), uciHistory: uci.slice(uciSplit), totalMoves: fens.length - split, pgn: "", Result: "*", historyStatus: "active", createdAt: new Date() };
      delete first.deletedAt; delete first.deleteAfter;
      delete second.deletedAt; delete second.deleteAfter;
      console.log(JSON.stringify({ source: firstId, fenSplitAt: split, uciSplitAt: uciSplit, firstGameID: firstId, secondGameID: secondId, firstPlies: split, secondPlies: fens.length - split, apply }, null, 2));
      if (apply) {
        await backups.insertOne({ sourceId: original._id, backedUpAt: new Date(), document: original });
        await collection.replaceOne({ _id: original._id }, first, { upsert: false });
        await collection.insertOne(second);
      }
      changed += 1;
    }

    if (!changed) console.log("No concatenated history record was found.");
    else if (!apply) console.log("Dry run only. Re-run with --apply after checking the split preview.");
  } finally {
    await client.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
