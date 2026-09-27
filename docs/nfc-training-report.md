# Lưu lịch sử cờ nhanh và cờ chớp phục vụ huấn luyện

Hệ thống ghi lại trạng thái bàn cờ sau khi người chơi tác động vào đồng hồ. Lịch sử giúp người chơi và huấn luyện viên xem lại diễn biến, xác định sai lầm và luyện lại các tình huống để hạn chế lặp lại khi thi đấu.

## 1. Khởi động và đọc dữ liệu bàn cờ

ESP32 khởi tạo hai reader WS1850S: một reader phụ trách 32 ô thuộc hàng 1–4, reader còn lại phụ trách 32 ô thuộc hàng 5–8. Sau bước kiểm tra xếp quân ban đầu, tín hiệu thay đổi từ đồng hồ kích hoạt việc quét bàn cờ.

![Khởi động và đọc bàn cờ](architecture/nfc-two-reader-scan.svg)

*Hình 1. Quy trình ghi nhận vị trí quân cờ bằng hai reader.*

ESP32 điều khiển switch qua 32 lượt chọn anten. Mỗi lượt, chương trình đọc một ô ở mỗi nửa bàn cờ; kết thúc vòng quét thu được dữ liệu 64 ô. Mã thẻ và vị trí ô được lưu tạm để xác định quân cờ, so sánh với trạng thái trước và tạo FEN cùng thông tin nước đi. Hai lời gọi đọc reader được thực hiện lần lượt trong chương trình, không đồng nghĩa hai thao tác đọc UID diễn ra cùng một thời điểm.

Ví dụ: khi tốt Trắng chuyển từ e2 đến e4, lần quét sau ghi nhận e2 trống và e4 có tốt Trắng. Nếu xác định được nước đi, thiết bị biểu diễn bằng UCI `e2e4`. Trường hợp không xác định rõ được gửi kèm thông tin lỗi theo nhánh xử lý của firmware.

## 2. Truyền dữ liệu và lưu lịch sử

![Truyền và lưu lịch sử](architecture/nfc-server-history.svg)

*Hình 2. Luồng xử lý khi server chấp nhận dữ liệu từ bàn cờ.*

ESP32 đưa dữ liệu vào hàng đợi và gửi qua Wi-Fi bằng HTTP POST đến `/moves`. Gói dữ liệu gồm mã bàn cờ, loại bàn NFC, số thứ tự, loại nước đi, FEN và UCI; trường hợp lỗi có thêm thông tin các ô thay đổi. Firmware xử lý phản hồi để xác nhận thứ tự hoặc gửi lại đối với lỗi có thể thử lại.

Server cập nhật trạng thái ván đấu và lưu lịch sử vào MongoDB khi dữ liệu được chấp nhận. Web nhận thông tin qua Socket.IO để hiển thị bàn cờ. Thời gian từng nước trên web được tính từ thời điểm server tiếp nhận và ghi nhận các nước, không phải phép đo trực tiếp thời gian suy nghĩ từ đồng hồ vật lý. Thời điểm công bố cho người xem còn phụ thuộc cấu hình trì hoãn của server.

## 3. Sử dụng lịch sử để huấn luyện

![Sử dụng lịch sử để huấn luyện](architecture/nfc-training-review.svg)

*Hình 3. Cách khai thác lịch sử để kiểm tra và rút kinh nghiệm.*

Người dùng mở lịch sử và chọn nước cần xem. Nếu xuất hiện dấu hiệu nhận diện sai, người quản trị đối chiếu và chỉnh sửa dữ liệu trước khi dùng để đánh giá cách chơi; nếu dữ liệu đúng thì tiếp tục phân tích. Bản FEN gốc được giữ lại và bản chỉnh sửa được lưu riêng. Kết quả phục hồi tự động không được xem là một bản chỉnh sửa đã lưu chỉ vì người dùng chọn nhánh để xem.

Stockfish hỗ trợ so sánh nước đã chơi với phương án tốt hơn. Huấn luyện viên và người chơi xem lại tình huống, xác định nguyên nhân mất lợi thế rồi luyện lại trên bàn cờ. Đây là hoạt động huấn luyện sử dụng dữ liệu của web; web chưa tự bảo đảm rằng người chơi sẽ không lặp lại sai lầm.

Ví dụ: người chơi đi mã và bỏ quên hậu đang bị tấn công. Huấn luyện viên mở vị trí trước nước đi đó, cùng người chơi kiểm tra mối đe dọa và so sánh với gợi ý. Người chơi đặt lại tình huống để luyện quan sát trước khi quyết định nước đi.

## Tệp để mở và xuất hình

- [Hình 1 – Archify HTML](architecture/nfc-two-reader-scan.html)
- [Hình 2 – Archify HTML](architecture/nfc-server-history.html)
- [Hình 3 – Archify HTML](architecture/nfc-training-review.html)

Các SVG chỉ chứa sơ đồ, không có khung giai đoạn hoặc số thứ tự. Chữ node 18px, chữ edge 14px. Nội dung tiếng Việt; các nút điều khiển cố định của trình xem Archify dùng tiếng Anh.

Nguồn đối chiếu: bản hai reader tại `E:/HK1_2026_2027/ChessBoard/ChessNFC/main/src/boardControl.c`, `NFCscan.c`, `handlemove.c`, `SendtoWeb.c`; phía web tại `backend/src/services/move.service.ts`, `backend/src/models/game.model.ts`, `backend/src/routes/recover.router.ts` và `frontend/components/played/pgn-modal.tsx`.
