import assert from "node:assert/strict";
import { classifyTimeControl as classifyBackend } from "../backend/src/utils/time-control.ts";
import { classifyTimeControl as classifyFrontend } from "../frontend/lib/time-control.ts";

const minute = 60_000;
const second = 1_000;
const cases = [
    { initial: 3 * minute, increment: 2 * second, expected: "blitz" },
    { initial: 10 * minute, increment: 0, expected: "blitz" },
    { initial: 10 * minute, increment: second, expected: "rapid" },
    { initial: 15 * minute, increment: 10 * second, expected: "rapid" },
    { initial: 45 * minute, increment: 15 * second, expected: "classical" },
    { initial: 60 * minute, increment: 15 * second, expected: "classical" },
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
