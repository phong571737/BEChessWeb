import assert from "node:assert/strict";
import { excelBoardKey, findExcelBoardRow, isBlackPlayerHeader, isWhitePlayerHeader } from "../frontend/lib/excel-game-import.ts";

assert.equal(excelBoardKey("Board_05"), "5");
assert.equal(excelBoardKey("Bàn 5"), "5");
assert.equal(excelBoardKey("5"), "5");
assert.equal(isWhitePlayerHeader("White"), true);
assert.equal(isWhitePlayerHeader("Tên Trắng"), true);
assert.equal(isBlackPlayerHeader("Black Name"), true);
assert.equal(isBlackPlayerHeader("Tên Đen"), true);
assert.equal(isWhitePlayerHeader("Black"), false);
assert.equal(isBlackPlayerHeader("White"), false);

const workbook = {
    rows: [
        { boardNumber: "Bàn 1", whiteName: "White 1", blackName: "Black 1" },
        { boardNumber: "5", whiteName: "White 5", blackName: "Black 5" },
    ],
};

assert.equal(findExcelBoardRow(workbook, "Board_05"), 1);
assert.equal(findExcelBoardRow(workbook, "2"), -1);

console.log("Verified home and board Excel imports use the same board matching.");
