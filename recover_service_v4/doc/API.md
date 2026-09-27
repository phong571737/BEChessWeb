# Đặc tả Recovery API

## 1. Mục tiêu

API nhận chuỗi FEN, gọi `run_pipeline()` để phục hồi nước đi, đánh giá các nước
padding bằng Stockfish và trả các nhóm nhánh đã sắp xếp.

API chỉ chạy cục bộ tại `127.0.0.1`; chưa yêu cầu authentication hoặc CORS.

## 2. Công nghệ

- FastAPI cung cấp endpoint và kiểm tra request.
- Uvicorn chạy ASGI server.
- `pipeline.py` thực hiện recovery end-to-end.
- `stockfish_service.py` quản lý việc đánh giá và vòng đời Stockfish.

## 3. Recovery endpoint

```http
POST /v1/recover
Content-Type: application/json
```

Request:

```json
{
  "fens": [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
  ],
  "max_missing_fens": 2,
  "stockfish_depth": 15
}
```

Ràng buộc:

- `fens`: bắt buộc, từ 2 đến 500 phần tử.
- `max_missing_fens`: tùy chọn, mặc định `2`, miền `[0, 2]`.
- `stockfish_depth`: tùy chọn, mặc định `15`, miền `[1, 20]`.
- `stockfish_path` là cấu hình server, không nhận từ client.

## 4. Response

Python tuple key được chuyển thành danh sách nhóm để tương thích JSON.

```json
{
  "groups": [
    {
      "padding_indices": [1, 2, 4],
      "ranked_paths": [
        {
          "moves": ["e2e4", "e7e5", "g1f3", "f1c4", "b8c6"],
          "padding_scores": [35, 28, 20]
        }
      ]
    }
  ]
}
```

`ranked_paths` giữ nguyên thứ tự do pipeline và Stockfish xác định. Các nhóm
`padding_indices` độc lập và không được so sánh với nhau.

Nếu không có `X`, response chứa một nhóm với `padding_indices: []` và
`padding_scores: []`. Nếu không có nhánh hợp lệ, API trả `200 OK` với
`{"groups": []}`.

## 5. Xử lý lỗi

- `422 Unprocessable Entity`: request không đúng schema hoặc vượt giới hạn.
- `400 Bad Request`: FEN không hợp lệ.
- `503 Service Unavailable`: Stockfish không khả dụng.
- `500 Internal Server Error`: lỗi ngoài dự kiến.

API không trả traceback hoặc kết quả chưa được Stockfish sắp xếp.

## 6. Health check

```http
GET /health
```

```json
{
  "status": "ok"
}
```

## 7. Khởi chạy

```powershell
uvicorn api:app --host 127.0.0.1 --port 8000
```

Tài liệu OpenAPI được cung cấp tại `http://127.0.0.1:8000/docs`.
