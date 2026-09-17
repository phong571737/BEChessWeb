import assert from "node:assert/strict";
import { calculateDelayedReleaseAt } from "../backend/src/utils/spectator-delay.ts";

const delayMs = 60_000;
const receivedAt = [0, 8_000, 21_000];
const releasedAt: number[] = [];

for (const receivedAtMs of receivedAt) {
    releasedAt.push(calculateDelayedReleaseAt(
        receivedAtMs,
        delayMs,
        releasedAt.at(-1) ?? 0,
    ));
}

assert.deepEqual(releasedAt, [60_000, 68_000, 81_000]);
assert.equal(releasedAt[1] - releasedAt[0], receivedAt[1] - receivedAt[0]);
assert.equal(releasedAt[2] - releasedAt[1], receivedAt[2] - receivedAt[1]);

// Events received in the same millisecond remain ordered without receiving a
// second full delay interval.
assert.equal(calculateDelayedReleaseAt(8_000, delayMs, 68_000), 68_001);

console.log("Verified spectator delay preserves the original gaps between moves.");
