import assert from "node:assert/strict";
import { classifyTimeControl as classifyBackend } from "../backend/src/utils/time-control.ts";
import { classifyTimeControl as classifyFrontend } from "../frontend/lib/time-control.ts";

const MINUTE = 60_000;
const SECOND = 1_000;
const cases = [
    { initial: 3 * MINUTE, increment: 2 * SECOND, expected: "blitz" },
    { initial: 10 * MINUTE, increment: 0, expected: "blitz" },
    { initial: 10 * MINUTE, increment: SECOND, expected: "rapid" },
    { initial: 15 * MINUTE, increment: 10 * SECOND, expected: "rapid" },
    { initial: 45 * MINUTE, increment: 15 * SECOND, expected: "classical" },
    { initial: 60 * MINUTE, increment: 15 * SECOND, expected: "classical" },
] as const;

/** Verifies that frontend and backend use the same FIDE classification boundaries. */
function verifyTimeControlClassification(): void {
    for (const testCase of cases) {
        assert.equal(classifyFrontend(testCase.initial, testCase.increment), testCase.expected);
        assert.equal(classifyBackend(testCase.initial, testCase.increment), testCase.expected);
    }
}

verifyTimeControlClassification();
console.log(`Verified ${cases.length} FIDE time-control cases in frontend and backend.`);
