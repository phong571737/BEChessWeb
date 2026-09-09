# 4.4. Lưu lại và kiểm tra lịch sử bàn cờ để phát hiện sai sót

![Hình 4.4. Quy trình lưu và kiểm tra lịch sử bàn cờ](architecture/history-check.html)

## Ví dụ minh họa

Giả sử bàn cờ gửi hai trạng thái liên tiếp:

| Thời điểm | Dữ liệu nhận được | Ý nghĩa |
|---|---|---|
| Trước nước đi | `FEN A` | Quân tốt Trắng đang ở ô e2 |
| Sau nước đi | `FEN B` | Quân tốt Trắng chuyển sang ô e4 |

Hệ thống so sánh `FEN A` và `FEN B`, nhận thấy chỉ có một thay đổi hợp lệ: tốt Trắng đi từ `e2` đến `e4`. Vì vậy, lịch sử được ghi nhận là:

```text
Nước đi: e2 → e4
FEN trước: FEN A
FEN sau:  FEN B
Trạng thái: Hợp lệ
```

Nếu `FEN B` lại thể hiện quân tốt xuất hiện ở một ô không thể đi tới từ `FEN A`, hoặc xuất hiện nhiều thay đổi cùng lúc, hệ thống không tự sửa dữ liệu. Kết quả được đánh dấu:

```text
Trạng thái: Chưa xác định / Có thể sai lệch
```

Quản trị viên có thể mở lịch sử để xem FEN gốc, chỉnh sửa vị trí sai và lưu bản chỉnh sửa riêng. Dữ liệu gốc vẫn được giữ lại để so sánh.

## Nội dung được lưu

- `uciHistory`: danh sách nước đi nhận từ bàn cờ.
- `fenHistory`: các vị trí FEN gốc sau từng nước đi.
- `fenHistoryEdited`: các vị trí FEN đã được quản trị viên hiệu chỉnh.
- `pgn`: danh sách nước đi dùng để xem lại ván cờ.

Lịch sử đang chơi được lưu trong MongoDB để có thể khôi phục khi backend khởi động lại. Khi ván kết thúc, bản ghi được chuyển vào `game_history`. Lịch sử bị xóa được giữ trong thùng rác 30 ngày trước khi xóa vĩnh viễn.

Việc kiểm tra bằng Stockfish chỉ phục vụ phân tích và không tự thay đổi lịch sử bàn cờ.

![Hình 4.4. Luồng lưu và kiểm tra lịch sử bàn cờ](architecture/history-check.html)

## Tóm tắt dễ hiểu

Có thể hiểu quy trình như việc camera chụp lại bàn cờ sau mỗi nước đi. Hệ thống lưu các “ảnh chụp” đó, sau đó ghép hai ảnh liên tiếp để kiểm tra quân nào đã di chuyển. Nếu hai ảnh không giải thích được bằng một nước đi rõ ràng, hệ thống giữ lại dấu hiệu bất thường để người quản trị kiểm tra, thay vì tự sửa và làm mất dữ liệu gốc.

## Code anchors

- `backend/src/game/game.manager.ts` — nhận nước đi, lưu UCI/FEN và khôi phục phiên chơi.
- `backend/src/models/game.model.ts` — lưu snapshot, archive lịch sử, chỉnh sửa FEN/PGN và thùng rác 30 ngày.
- `backend/src/routes/game.router.ts` — các API đọc lịch sử, sửa FEN/PGN, khôi phục và xóa lịch sử.
- `frontend/components/played/pgn-modal.tsx` — hiển thị FEN timeline, PGN và các thao tác xem lại/chỉnh sửa.
- `frontend/lib/post-game-analysis.ts` — đối chiếu FEN liên tiếp và phân tích lịch sử.
