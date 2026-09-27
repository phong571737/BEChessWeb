# Hướng dẫn sử dụng Stockfish Recommendation API

Tài liệu này mô tả cách chuẩn bị Stockfish binary, khởi động service, gửi
request và xử lý response của API trong thư mục `stockfish_recommend`.

## 1. Tổng quan

Service nhận một thế cờ ở định dạng FEN, tạo toàn bộ nước đi hợp lệ bằng
`python-chess`, sau đó dùng Stockfish MultiPV để chấm điểm và xếp hạng.

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| `GET` | `/live` | Kiểm tra process FastAPI còn hoạt động |
| `GET` | `/ready` | Kiểm tra Stockfish sẵn sàng nhận lệnh |
| `POST` | `/v2/evaluate` | API khuyến nghị, trả danh sách có thứ tự |
| `POST` | `/v1/evaluate` | API tương thích cũ, trả object `move: score` |
| `GET` | `/docs` | Swagger UI để thử API |

Nên dùng `/v2/evaluate` cho tích hợp mới. `/v1/evaluate` đã deprecated và chỉ
nên giữ cho client cũ.

## 2. Thêm Stockfish binary

### Chạy bằng Docker

Dockerfile tự cài Stockfish của Debian và đặt:

```text
STOCKFISH_PATH=/usr/games/stockfish
```

Khi chạy bằng Docker, không cần copy binary local vào image.

### Chạy trực tiếp trên Windows

Cách 1: đặt binary Windows đúng tên mặc định:

```text
stockfish_recommend/stockfish/stockfish-windows-x86-64-avx2.exe
```

File mặc định yêu cầu CPU hỗ trợ AVX2. Nếu máy không hỗ trợ, sử dụng một bản
Stockfish generic và đặt đường dẫn tùy chỉnh:

```powershell
$env:STOCKFISH_PATH = "C:\tools\stockfish\stockfish.exe"
```

### Chạy trực tiếp trên Linux

Tên binary local mặc định là:

```text
stockfish_recommend/stockfish/stockfish-ubuntu-x86-64-sse41-popcnt
```

Cấp quyền thực thi cho file:

```bash
chmod +x stockfish_recommend/stockfish/stockfish-ubuntu-x86-64-sse41-popcnt
```

Hoặc cài Stockfish bằng package manager và đặt:

```bash
export STOCKFISH_PATH=/usr/games/stockfish
```

Không dùng binary `x86-64` trên máy ARM64. Máy ARM64 cần binary Stockfish dành
cho `aarch64/arm64` và `STOCKFISH_PATH` tương ứng.

### Git và Docker build context

Thư mục `stockfish_recommend/stockfish/` đang được loại khỏi Git và Docker
build context. Điều này có nghĩa:

- Có thể đặt binary local trong thư mục này để phát triển.
- Binary không xuất hiện trong `git status` và không được push lên Git.
- Docker production không sử dụng binary local.
- Khi chuyển sang máy mới, cần cài lại Stockfish hoặc cấu hình
  `STOCKFISH_PATH`.

Nên lấy binary từ nguồn Stockfish chính thức và xác minh checksum trước khi
sử dụng trong production.

## 3. Khởi động API

### Chạy container trong website hiện tại

Từ thư mục root `BEChessWeb`:

```powershell
docker compose build stockfish-recommend
docker compose up -d stockfish-recommend
docker compose ps stockfish-recommend
```

API được bind tại:

```text
http://127.0.0.1:8001
```

Port chỉ lắng nghe trên loopback và không được mở trực tiếp ra Internet.

### Chạy trực tiếp bằng Python

Từ thư mục `stockfish_recommend`:

```powershell
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Nếu chạy từ root repository:

```powershell
python -m uvicorn --app-dir stockfish_recommend app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Không dùng nhiều worker nếu chưa cấp riêng CPU và RAM cho từng process
Stockfish.

## 4. Kiểm tra trạng thái

### `GET /live`

Response thành công:

```json
{
  "status": "live"
}
```

Liveness chỉ xác nhận FastAPI đang chạy.

### `GET /ready`

Response khi Stockfish sẵn sàng:

```json
{
  "status": "ready"
}
```

Nếu Stockfish không khởi động hoặc không phản hồi, endpoint trả `503`.

## 5. Payload request

Endpoint khuyến nghị:

```http
POST /v2/evaluate
Content-Type: application/json
```

Payload:

```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "depth": 16
}
```

### Trường `fen`

- Bắt buộc và phải là chuỗi từ 1 đến 200 ký tự.
- Phải là FEN hợp lệ và mô tả một thế cờ hợp lệ.
- Nên có đủ lượt đi, quyền nhập thành, en passant, halfmove và fullmove.

### Trường `depth`

- Không bắt buộc; mặc định là `16`.
- Schema chấp nhận số nguyên từ `1` đến `22`.
- Service áp dụng thêm `MAX_DEPTH`, mặc định production là `20`.
- Vì vậy giới hạn hiệu lực mặc định là `1` đến `20`.

Không gửi field ngoài `fen` và `depth`. Schema dùng `extra="forbid"`, nên field
không được hỗ trợ sẽ bị từ chối với `422`.

## 6. Response V2

```json
{
  "moves": [
    {
      "rank": 1,
      "move": "e2e4",
      "scoreCp": 38,
      "mateIn": null
    },
    {
      "rank": 2,
      "move": "d2d4",
      "scoreCp": 31,
      "mateIn": null
    }
  ],
  "depth": 16,
  "sideToMove": "white"
}
```

### Trường cấp cao

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `moves` | array | Danh sách nước hợp lệ, tốt nhất đứng trước |
| `depth` | integer | Depth nhỏ nhất thực tế đạt được giữa các candidate |
| `sideToMove` | string | `white` hoặc `black`, lấy từ FEN đầu vào |

### Mỗi phần tử trong `moves`

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `rank` | integer | Thứ hạng bắt đầu từ 1 |
| `move` | string | Nước UCI, ví dụ `e2e4` hoặc `e7e8q` |
| `scoreCp` | integer hoặc null | Centipawn từ góc nhìn bên đang tới lượt |
| `mateIn` | integer hoặc null | Khoảng cách mate có dấu |

Khi `scoreCp` có giá trị, `mateIn` thường là `null`. Khi Stockfish phát hiện
mate, `scoreCp` là `null` và `mateIn` có giá trị.

- Điểm dương: có lợi cho bên đang tới lượt.
- Điểm âm: bất lợi cho bên đang tới lượt.

Vị trí checkmate hoặc stalemate không còn nước hợp lệ sẽ trả `moves: []` và
`depth: 0`.

## 7. Response V1

Request của `/v1/evaluate` giống V2. Response:

```json
{
  "e2e4": 38,
  "d2d4": 31,
  "g1f3": 24
}
```

Mate được ánh xạ gần `+100000` hoặc `-100000`. JSON object không phải cấu trúc
phù hợp để biểu diễn thứ tự trên mọi client, nên code mới phải dùng V2.

## 8. Response lỗi

```json
{
  "error": {
    "code": "ENGINE_TIMEOUT",
    "message": "Stockfish analysis exceeded the allowed time"
  }
}
```

| Status | Code thường gặp | Ý nghĩa |
| ---: | --- | --- |
| `413` | `REQUEST_TOO_LARGE` | Request body vượt giới hạn |
| `422` | `INVALID_REQUEST`, `INVALID_POSITION` | Payload hoặc FEN không hợp lệ |
| `429` | `QUEUE_FULL` | Hàng đợi phân tích đã đầy |
| `503` | `ENGINE_NOT_READY`, `QUEUE_WAIT_TIMEOUT` | Engine chưa sẵn sàng hoặc chờ quá lâu |
| `504` | `ENGINE_TIMEOUT` | Stockfish phân tích vượt thời gian |
| `500` | `INTERNAL_ERROR` | Lỗi nội bộ ngoài dự kiến |

Client nên xử lý theo HTTP status và `error.code`, không so sánh trực tiếp
chuỗi `message`.

## 9. Ví dụ gọi API

### Swagger UI

Mở `http://127.0.0.1:8001/docs`, chọn `POST /v2/evaluate`, nhấn **Try it out**,
nhập payload và nhấn **Execute**.

### PowerShell

```powershell
$body = @{
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    depth = 16
} | ConvertTo-Json

Invoke-RestMethod `
    -Method Post `
    -Uri "http://127.0.0.1:8001/v2/evaluate" `
    -ContentType "application/json" `
    -Body $body
```

### curl

```bash
curl -X POST http://127.0.0.1:8001/v2/evaluate \
  -H 'Content-Type: application/json' \
  -d '{
    "fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "depth":16
  }'
```

### JavaScript hoặc TypeScript

```ts
const response = await fetch("/stockfish-api/v2/evaluate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    depth: 16,
  }),
});

const data = await response.json();
if (!response.ok) {
  throw new Error(data?.error?.code ?? "STOCKFISH_API_ERROR");
}

console.log(data.moves[0]);
```

Local chưa có Nginx thì thay URL bằng
`http://127.0.0.1:8001/v2/evaluate`. Trên website production, sử dụng URL
cùng-origin `/stockfish-api/v2/evaluate`.

## 10. Cấu hình runtime

| Biến | Mặc định | Ý nghĩa |
| --- | ---: | --- |
| `STOCKFISH_PATH` | Theo platform | Đường dẫn Stockfish binary |
| `STOCKFISH_THREADS` | `2` | Số thread Stockfish |
| `STOCKFISH_HASH_MB` | `128` | Hash từ 16 đến 512 MB |
| `ANALYSIS_TIMEOUT_SECONDS` | `3` | Thời gian phân tích tối đa |
| `ENGINE_STOP_GRACE_SECONDS` | `1` | Thời gian cho engine dừng |
| `STARTUP_TIMEOUT_SECONDS` | `10` | Timeout khởi động engine |
| `READINESS_TIMEOUT_SECONDS` | `1` | Timeout readiness ping |
| `QUEUE_WAIT_TIMEOUT_SECONDS` | `5` | Thời gian tối đa chờ engine |
| `MAX_DEPTH` | `20` | Depth tối đa service chấp nhận |
| `QUEUE_SIZE` | `8` | Số request tối đa được chờ |
| `MAX_REQUEST_BODY_BYTES` | `2048` | Giới hạn request body |

Compose gốc dùng một số biến có prefix `STOCKFISH_` rồi ánh xạ vào biến trong
container. Ví dụ `STOCKFISH_ANALYSIS_TIMEOUT_SECONDS` ở `.env` trở thành
`ANALYSIS_TIMEOUT_SECONDS` trong container.

## 11. Đường dẫn production

Sau khi cài hai Nginx snippet trong `deploy/nginx/`, API dùng cùng domain với
website:

```text
https://<domain>/stockfish-api/live
https://<domain>/stockfish-api/ready
https://<domain>/stockfish-api/v2/evaluate
```

Nginx loại bỏ prefix `/stockfish-api/` trước khi chuyển vào FastAPI. Không mở
port `8001` trên firewall và không bind container vào `0.0.0.0:8001`.

## 12. Lỗi vận hành thường gặp

### `STOCKFISH_PATH does not point to a file`

Đường dẫn binary sai hoặc Stockfish chưa được cài.

### `STOCKFISH_PATH is not executable`

Binary Linux chưa có quyền chạy. Cấp executable permission hoặc cài Stockfish
từ package manager.

### `Exec format error`

Binary không đúng hệ điều hành hoặc kiến trúc CPU, ví dụ dùng `x86-64` trên
ARM64.

### `/ready` trả `503`

Stockfish không khởi động, bị crash hoặc không phản hồi. Kiểm tra log container
và tài nguyên RAM/CPU.

### Request trả `429`

Queue đang đầy. Client nên chờ rồi thử lại, không retry liên tục.

### Request trả `504`

Phân tích vượt `ANALYSIS_TIMEOUT_SECONDS`. Giảm depth hoặc tăng timeout nếu VPS
còn đủ tài nguyên.

### Browser không gọi được `127.0.0.1:8001`

Trong browser người dùng, `127.0.0.1` là máy người dùng, không phải VPS.
Production phải gọi `/stockfish-api/v2/evaluate` qua Nginx.
