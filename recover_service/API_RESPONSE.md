# Payload trả về của API `/recover`

> **Schema v2:** request hỗ trợ `deduplicatePositions` (mặc định `true`) và
> `nRetry` (mặc định `5`). Response có thêm `preprocessing`, `retry`,
> `longestRecoveredOriginalPly` và `longestRecoveredEffectivePly`.
> `steps[].moveLists` của schema cũ được thay bằng `steps[].candidates`: mỗi
> candidate chỉ chứa delta của một move (`id`, `parentId`, `uci`, `san`,
> `source`, `assumedFen`). Chuỗi đầy đủ chỉ nằm trong `finalMoveLists` và
> `bestMoveLists`.

Endpoint:

```http
POST /recover
Content-Type: application/json
```

## Cấu trúc response

```json
{
  "originalPgn": "1. e4 e5 2. Nf3",
  "failedPlies": [2],
  "detections": [
    {
      "ply": 1,
      "detected": true,
      "move": "e2e4",
      "error": null
    },
    {
      "ply": 2,
      "detected": false,
      "move": null,
      "error": "No piece-placement change"
    }
  ],
  "survivorCounts": [1, 3, 2],
  "fullyRecovered": true,
  "longestRecoveredPly": 3,
  "finalMoveLists": [
    {
      "uciMoves": ["e2e4", "e7e5", "g1f3"],
      "sanMoves": ["e4", "e5", "Nf3"],
      "moveSources": ["detected", "assumed", "detected"],
      "assumedFens": ["FEN sau ply 1", "FEN sau ply 2", "FEN sau ply 3"],
      "movetext": "1. e4 e5 2. Nf3"
    }
  ],
  "bestMoveLists": [
    {
      "uciMoves": ["e2e4", "e7e5", "g1f3"],
      "sanMoves": ["e4", "e5", "Nf3"],
      "moveSources": ["detected", "assumed", "detected"],
      "assumedFens": ["FEN sau ply 1", "FEN sau ply 2", "FEN sau ply 3"],
      "movetext": "1. e4 e5 2. Nf3"
    }
  ],
  "steps": [
    {
      "ply": 1,
      "observedFen": "FEN quan sát tại ply 1",
      "detectedMove": "e2e4",
      "detectionError": null,
      "usedAssumption": false,
      "candidateCount": 1,
      "moveLists": []
    }
  ]
}
```

> Payload trên chỉ minh họa cấu trúc. Các giá trị FEN và danh sách nước đi thực tế phụ thuộc vào `fenHistory` gửi lên.

## Chú thích các trường cấp cao

| Trường | Kiểu dữ liệu | Ý nghĩa |
|---|---|---|
| `originalPgn` | `string` | PGN được tạo trực tiếp từ lịch sử FEN. Nước không xác định được có thể được biểu diễn bằng ký hiệu thay thế như `X`. |
| `failedPlies` | `number[]` | Danh sách số thứ tự nửa-nước mà hệ thống không suy luận trực tiếp được, ví dụ `[3, 7]`. Ply bắt đầu từ `1`. |
| `detections` | `object[]` | Kết quả phát hiện trực tiếp nước đi tại từng ply. |
| `survivorCounts` | `number[]` | Số nhánh ứng viên còn hợp lệ sau mỗi ply. Ví dụ `[1, 1, 4]` nghĩa là sau ply thứ ba còn bốn chuỗi nước đi khả dĩ. |
| `fullyRecovered` | `boolean` | Cho biết có ít nhất một chuỗi nước đi hợp lệ tồn tại đến hết lịch sử FEN hay không. |
| `longestRecoveredPly` | `number` | Ply xa nhất mà hệ thống còn tìm được ít nhất một chuỗi nước đi hợp lệ. |
| `finalMoveLists` | `object[]` | Các chuỗi ứng viên còn tồn tại ở ply cuối cùng. Mảng có thể rỗng nếu quá trình phục hồi thất bại trước khi đến cuối. |
| `bestMoveLists` | `object[]` | Các chuỗi tốt nhất tại ply xa nhất phục hồi được. Khi phục hồi hoàn toàn, trường này giống `finalMoveLists`. |
| `steps` | `object[]` | Chi tiết quá trình phục hồi tại từng ply. Trường này không xuất hiện khi request gửi `"finalOnly": true`. |

## Cấu trúc `detections[]`

| Trường | Kiểu dữ liệu | Ý nghĩa |
|---|---|---|
| `ply` | `number` | Số thứ tự nửa-nước, bắt đầu từ `1`. |
| `detected` | `boolean` | Cho biết hệ thống có nhận diện trực tiếp được nước đi hay không. |
| `move` | `string \| null` | Nước đi theo chuẩn UCI, ví dụ `e2e4` hoặc `e7e8q`. Giá trị là `null` nếu không nhận diện được. |
| `error` | `string \| null` | Nguyên nhân không nhận diện được nước đi. Giá trị là `null` khi nhận diện thành công. |

## Cấu trúc move list

Cấu trúc này được sử dụng trong `finalMoveLists`, `bestMoveLists` và `steps[].moveLists`.

| Trường | Kiểu dữ liệu | Ý nghĩa |
|---|---|---|
| `uciMoves` | `string[]` | Danh sách nước đi theo chuẩn UCI. |
| `sanMoves` | `string[]` | Danh sách nước đi theo chuẩn SAN, ví dụ `e4`, `Nf3`, `O-O` hoặc `Qxd5+`. |
| `moveSources` | `string[]` | Nguồn của từng nước đi: `detected` nếu phát hiện trực tiếp, `assumed` nếu hệ thống phải thử nước đi hợp lệ. |
| `assumedFens` | `string[]` | FEN đầy đủ mà hệ thống tính được sau từng nước đi trong chuỗi ứng viên. |
| `movetext` | `string` | Chuỗi nước đi được định dạng theo phần nội dung của PGN. |

## Cấu trúc `steps[]`

| Trường | Kiểu dữ liệu | Ý nghĩa |
|---|---|---|
| `ply` | `number` | Số thứ tự nửa-nước đang được xử lý. |
| `observedFen` | `string` | FEN quan sát nhận được từ `fenHistory` tại ply tương ứng. |
| `detectedMove` | `string \| null` | Nước đi UCI được phát hiện trực tiếp hoặc `null` nếu không phát hiện được. |
| `detectionError` | `string \| null` | Lý do phát hiện thất bại hoặc `null` nếu thành công. |
| `usedAssumption` | `boolean` | `true` nếu hệ thống phải thử các nước đi hợp lệ thay vì dùng một nước được phát hiện trực tiếp. |
| `candidateCount` | `number` | Số chuỗi ứng viên còn hợp lệ sau ply này. |
| `moveLists` | `object[]` | Chi tiết các chuỗi ứng viên còn lại tại ply này. |

## Lưu ý

- `failedPlies` không đồng nghĩa với `fullyRecovered = false`. Hệ thống có thể không phát hiện trực tiếp một nước đi nhưng vẫn phục hồi được bằng cách thử các nước hợp lệ.
- Các phần tử tại cùng một vị trí trong `uciMoves`, `sanMoves`, `moveSources` và `assumedFens` cùng mô tả một ply.
- Gửi `"finalOnly": true` để giảm kích thước response bằng cách loại bỏ trường `steps`.

## Response lỗi

```json
{
  "detail": "Nội dung lỗi"
}
```

- HTTP `400`: FEN không hợp lệ hoặc số nhánh vượt quá giới hạn cho phép.
- HTTP `422`: request không đúng schema, chẳng hạn thiếu trường bắt buộc `fenHistory`.
- HTTP `500`: lỗi ngoài dự kiến trong quá trình xử lý.

## Ví dụ response khi có nhiều nhánh nước đi

Khi một ply không thể được phát hiện trực tiếp, hệ thống thử các nước đi hợp lệ phù hợp với FEN quan sát. Nếu có nhiều chuỗi cùng phù hợp, mỗi chuỗi được trả về dưới dạng một object riêng trong mảng `finalMoveLists`, `bestMoveLists` hoặc `steps[].moveLists`.

Ví dụ dưới đây có hai nhánh ứng viên:

```json
{
  "failedPlies": [2],
  "survivorCounts": [1, 2, 2],
  "fullyRecovered": true,
  "longestRecoveredPly": 3,
  "finalMoveLists": [
    {
      "uciMoves": ["e2e4", "e7e5", "g1f3"],
      "sanMoves": ["e4", "e5", "Nf3"],
      "moveSources": ["detected", "assumed", "detected"],
      "assumedFens": ["FEN-A1", "FEN-A2", "FEN-A3"],
      "movetext": "1. e4 e5 2. Nf3"
    },
    {
      "uciMoves": ["e2e4", "c7c5", "g1f3"],
      "sanMoves": ["e4", "c5", "Nf3"],
      "moveSources": ["detected", "assumed", "detected"],
      "assumedFens": ["FEN-B1", "FEN-B2", "FEN-B3"],
      "movetext": "1. e4 c5 2. Nf3"
    }
  ],
  "bestMoveLists": [
    {
      "uciMoves": ["e2e4", "e7e5", "g1f3"],
      "sanMoves": ["e4", "e5", "Nf3"],
      "moveSources": ["detected", "assumed", "detected"],
      "assumedFens": ["FEN-A1", "FEN-A2", "FEN-A3"],
      "movetext": "1. e4 e5 2. Nf3"
    },
    {
      "uciMoves": ["e2e4", "c7c5", "g1f3"],
      "sanMoves": ["e4", "c5", "Nf3"],
      "moveSources": ["detected", "assumed", "detected"],
      "assumedFens": ["FEN-B1", "FEN-B2", "FEN-B3"],
      "movetext": "1. e4 c5 2. Nf3"
    }
  ]
}
```

Trong ví dụ:

- `survivorCounts[1] = 2`: sau ply thứ hai có hai nhánh hợp lệ.
- `finalMoveLists.length = 2`: có hai chuỗi nước đi phục hồi hoàn chỉnh.
- `moveSources[1] = "assumed"`: nước thứ hai của mỗi nhánh được hệ thống giả định.
- API không chọn một nhánh duy nhất; client cần hiển thị tất cả hoặc áp dụng tiêu chí riêng để chọn.

Nếu `finalOnly` là `false`, các nhánh cũng xuất hiện trong bước tương ứng:

```json
{
  "ply": 2,
  "observedFen": "FEN quan sát tại ply 2",
  "detectedMove": null,
  "detectionError": "No piece-placement change",
  "usedAssumption": true,
  "candidateCount": 2,
  "moveLists": [
    {
      "uciMoves": ["e2e4", "e7e5"],
      "sanMoves": ["e4", "e5"],
      "moveSources": ["detected", "assumed"],
      "assumedFens": ["FEN-A1", "FEN-A2"],
      "movetext": "1. e4 e5"
    },
    {
      "uciMoves": ["e2e4", "c7c5"],
      "sanMoves": ["e4", "c5"],
      "moveSources": ["detected", "assumed"],
      "assumedFens": ["FEN-B1", "FEN-B2"],
      "movetext": "1. e4 c5"
    }
  ]
}
```

> Đây là ví dụ minh họa định dạng nhiều nhánh, không phải response tính từ bộ 59 FEN bên dưới.

## POST request dùng bộ 59 FEN để test

Payload đầy đủ được lưu trong file [`recover_test_payload.json`](./recover_test_payload.json). Các số thứ tự `1.` đến `59.` đã được loại bỏ vì chúng không phải một phần của chuỗi FEN.

Khởi động API tại cổng `8001`, sau đó chạy một trong các lệnh sau từ thư mục `recover_service`.

### PowerShell

```powershell
$payload = Get-Content -Raw .\recover_test_payload.json
$response = Invoke-RestMethod `
  -Uri "http://127.0.0.1:8001/recover" `
  -Method Post `
  -ContentType "application/json" `
  -Body $payload

$response | ConvertTo-Json -Depth 20
```

### curl

```bash
curl -X POST "http://127.0.0.1:8001/recover" \
  -H "Content-Type: application/json" \
  --data-binary "@recover_test_payload.json"
```

Payload đang đặt:

```json
{
  "fenHistory": [
    "59 chuỗi FEN theo thứ tự thời gian"
  ],
  "maxBranches": 1000,
  "finalOnly": false
}
```

- `maxBranches: 1000` giới hạn số nhánh để tránh tăng tổ hợp quá lớn.
- `finalOnly: false` giữ lại `steps`, giúp kiểm tra ply nào bắt đầu sinh nhiều nhánh.
- Kiểm tra `survivorCounts` để tìm nhanh ply có nhiều nhánh; giá trị lớn hơn `1` nghĩa là tại bước đó có nhiều chuỗi ứng viên còn tồn tại.
