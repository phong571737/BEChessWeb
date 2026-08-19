# Recover Service V2 API Contract

## Internal endpoint

```http
POST http://recover-service:8000/recover
Content-Type: application/json
```

## Request

```json
{
  "fenHistory": ["FEN 1", "FEN 2"],
  "startFen": "optional start FEN",
  "headers": {},
  "maxBranches": 10000,
  "nRetry": 5,
  "deduplicatePositions": true,
  "maxRepairGaps": 10,
  "maxTotalPadding": 20,
  "finalOnly": false
}
```

`fenHistory` phải có từ 1 đến 500 phần tử. V2 chỉ yêu cầu mỗi phần tử có piece-placement; runner không ép toàn bộ metadata phải là FEN chuẩn trước khi gọi engine.

Các option ngoài `fenHistory`, `startFen` và `maxBranches` được giữ trong request để tương thích với backend hiện tại. Engine V2 tự quyết định retry, deduplicate và padding.

## Raw V2 response

Endpoint nội bộ trả nguyên kết quả của `recover_service_v2.recovery.recover()` và không đổi tên field:

```json
{
  "fullyRecovered": true,
  "continuedToEnd": true,
  "stoppedAtMoveIndex": null,
  "skippedXIndexes": [],
  "skippedRanges": [],
  "unresolvedSegments": [],
  "paddingAttempts": [],
  "paddingRepairs": [],
  "normalizedFens": [],
  "normalizedSides": [],
  "inferredSides": [],
  "inferredMoves": [],
  "components": [],
  "moveTemplates": [],
  "final_move_lists": [],
  "branchCount": 0,
  "moveLists": []
}
```

### Field conventions

- `final_move_lists` là `string[][]` và luôn tồn tại trong kết quả hợp lệ.
- Mỗi phần tử trong một final list là UCI hoặc token `X`.
- `X` là vị trí tham chiếu chưa xác định, không phải lỗi HTTP.
- `fullyRecovered=false` vẫn trả HTTP 200.
- `skippedXIndexes`, `startMoveIndex` và `endMoveIndex` là index 0-based.
- `moveTemplates` và `final_move_lists` giữ nguyên định dạng engine V2.
- `moveLists` giữ các field gốc `uci`, `san`, `componentIndex`, `startMoveIndex`, `endMoveIndex` khi engine cung cấp.
- `normalizedFens` có thể chứa metadata không đạt chuẩn FEN sáu field; consumer phải dùng piece-placement tolerant parsing.

## Backend public response

Backend đọc raw V2 response và bổ sung dữ liệu phục vụ frontend:

```json
{
  "schemaVersion": 3,
  "engineVersion": "recover_service_v2",
  "pgn": "PGN-like notation for the observed timeline",
  "bestPgn": "PGN-like notation for the first final list",
  "fullyRecovered": true,
  "failedPlies": [],
  "longestRecoveredPly": 0,
  "bestMoveLists": [],
  "finalMoveLists": [],
  "steps": [],
  "preprocessing": {},
  "retry": {},
  "recovery": {}
}
```

Mapping:

- Raw `final_move_lists` → public `finalMoveLists`.
- Raw V2 response đầy đủ → public `recovery`.
- Public `bestMoveLists` được backend tạo từ `final_move_lists` để cung cấp `uciMoves`, `sanMoves`, `moveSources` và `assumedFens` cho frontend.
- Frontend dùng `assumedFens` để điều hướng qua token `X`; không gọi `chess.move()` với `X`.

## Errors

### HTTP 400

```json
{
  "detail": "fenHistory must contain between 1 and 500 FEN positions",
  "code": "INVALID_RECOVERY_INPUT"
}
```

### HTTP 422

```json
{
  "detail": "Recovery produced more than 10000 compatible branches",
  "code": "RECOVERY_BRANCH_LIMIT"
}
```

### HTTP 500

```json
{
  "detail": "Recovery service failed",
  "code": "RECOVERY_INTERNAL_ERROR"
}
```
