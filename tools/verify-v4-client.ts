import assert from "node:assert/strict";
import { createServer } from "node:http";

process.env.RECOVER_SERVICE_URL = "http://127.0.0.1:8014";
process.env.MONGO_URI ||= "mongodb://127.0.0.1/test";
process.env.JWT_SECRET ||= "local-test-only";
process.env.URL_HIVEMQTT ||= "localhost";
process.env.MQTT_PORT ||= "1883";
const { recoverFenHistory, validateV4Response } = await import("../dist/services/fen-recovery.client.js");
const { env } = await import("../dist/config/environment.js");
const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const result = await recoverFenHistory([fen], undefined, { White: "Integration test" }, { exposeServiceErrors: true });
assert.equal(result?.engineVersion, "recover_service_v4");
assert.deepEqual(result?.bestMoveLists[0]?.uciMoves, ["e2e4"]);
assert.ok(result?.bestPgn.includes("1. e4"));
assert.throws(() => validateV4Response({ groups: [] }), /Invalid V4/);
const malformed = structuredClone(result!);
malformed.bestMoveLists[0]!.paddingIndices = [900];
assert.throws(() => validateV4Response(malformed), /Invalid V4/);

let status = 503, code = "RECOVERY_UNAVAILABLE";
const server = createServer((_req, res) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify({ code, detail: "Test service error" })); });
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  env.RECOVER_SERVICE_URL = `http://127.0.0.1:${address.port}`;
  for (const [nextStatus, nextCode, expected] of [[503, "RECOVERY_UNAVAILABLE", "RECOVERY_UNAVAILABLE"], [504, "RECOVERY_TIMEOUT", "RECOVERY_TIMEOUT"], [400, "INVALID_RECOVERY_INPUT", "RECOVERY_INVALID_INPUT"], [422, "RECOVERY_BRANCH_LIMIT", "RECOVERY_BRANCH_LIMIT"]] as const) {
    status = nextStatus; code = nextCode;
    await assert.rejects(recoverFenHistory([fen], undefined, {}, { exposeServiceErrors: true }), (error: any) => error.code === expected && error.httpStatus === status);
  }
} finally { server.close(); }
console.log("V4 client: live Python request, response validation and HTTP error mapping passed.");
