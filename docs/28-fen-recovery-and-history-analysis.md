# 28. Khôi phục trạng thái bàn cờ và phân tích lịch sử ván đấu

Tài liệu này mô tả đúng cơ chế hiện có của BEChessWeb. Hệ thống hỗ trợ **suy luận các vị trí khả thi** khi dữ liệu FEN từ bàn cờ điện tử bị thiếu hoặc không tạo được một nước đi duy nhất; hệ thống không tự khẳng định nhánh nào là vị trí thật nếu bằng chứng chưa đủ.

## 4.5. Phát hiện dữ liệu bất thường, hiệu chỉnh và lưu lịch sử

Hai lưu đồ dưới đây phân biệt xử lý tự động với thao tác sửa và lưu của quản trị viên.

### Phục hồi tự động khi xem lại

![Hình 4.5a. Phục hồi lịch sử theo code V3](architecture/correction-examples.svg)

[Mở hình trong Archify](architecture/correction-examples.html).

1. Khi mở trang xem lại, frontend gọi API recovered-pgn. Backend ưu tiên fenHistoryEdited không rỗng; nếu không có thì lấy fenHistory gốc.
2. Dịch vụ đang chạy là recover_service_v3, được gọi từ recover_service/app/runner.py. V3 gộp các vị trí trùng liên tiếp trước khi xử lý nhiễu quân thừa.
3. Chỉ che ô quân thừa khỏi bản dùng để phục hồi khi suy luận được một nước hợp lệ duy nhất, không có sai khác thiếu quân hoặc sai loại quân, quân thừa không phải vua và chưa vượt giới hạn. Mặc định tối đa hai ô mới mỗi bước và bốn ô tổng cộng. Ô đã che được duy trì từ điểm phát hiện đến cuối chuỗi. Đây là giả định xử lý dữ liệu, không chứng minh hai vị trí mang cùng một quân vật lý.
4. Suy luận ưu tiên nước duy nhất từ dữ liệu gốc, sau đó mới dùng nước duy nhất từ dữ liệu đã làm sạch. Nếu không xác định duy nhất thì đặt X; không chọn tùy ý một ứng viên.
5. Tại đoạn X, hệ thống thử các nước hợp lệ và đối chiếu với những vị trí quan sát tiếp theo. Quân còn được quan sát phải khớp với phương án; ô trống không tự chứng minh quân đã bị bắt. V3 có bước thử bổ sung một hoặc hai nước trung gian; nếu chưa nối được thì có thể giữ đoạn chưa xác định và tiếp tục từ vị trí phù hợp.
6. Backend trả PGN phục hồi, các nhánh, FEN và thông tin chưa xác định về giao diện. Endpoint này không ghi kết quả phục hồi vào MongoDB. Chọn một nhánh trên giao diện không đồng nghĩa lưu nhánh đó.

### Những dấu hiệu sai và giới hạn kết luận

| Dấu hiệu | Code xử lý / ý nghĩa |
|---|---|
| Quân không xuất hiện trong FEN | Có thể thiếu dữ liệu. Phục hồi thử phương án tương thích; không mặc định bổ sung quân vào một ô cụ thể. |
| Quân xuất hiện thừa hoặc nhiều vị trí có thể phù hợp | Thử làm sạch quân thừa nếu đủ điều kiện; trường hợp nhiều ứng viên không được chọn tùy ý. |
| Nhận diện sai loại quân | Bộ làm sạch quân thừa đánh dấu sai khác không an toàn; không tự đổi tượng thành mã. |
| Tốt được ghi đi e2 → e5 trong một nước | Không phù hợp một nước tốt hợp lệ. Cần đối chiếu dữ liệu thiếu hoặc sai; không tự kết luận người chơi vi phạm luật. |

Kiểm tra khởi tạo là luồng riêng: backend nhận missingSquares, extraSquares và wrongPieceSquares do bàn cờ gửi và giao diện tô các ô tương ứng. Không dùng các trường này để khẳng định backend tự nhận diện mã định danh một quân xuất hiện ở nhiều ô. Ví dụ đúng với bố trí khởi đầu tiêu chuẩn: ô e2 thiếu tốt Trắng, không phải ô e4.

### Quản trị viên sửa và lưu

![Hình 4.5b. Luồng sửa FEN và lưu lịch sử](architecture/correction-save.svg)

[Mở hình trong Archify](architecture/correction-save.html).

Quản trị viên đối chiếu rồi thêm, sửa, xóa một FEN hoặc thay toàn bộ danh sách. API yêu cầu quyền quản trị và lịch sử đã kết thúc; kiểm tra dữ liệu nhập, chỉ mục và xung đột mảng FEN. API không kiểm tra tính hợp lệ theo luật cờ trước khi lưu. Do đó lưu thành công không chứng minh bản sửa đã đúng luật.

| Dữ liệu | Cách lưu hiện tại |
|---|---|
| FEN gốc | Giữ trong fenHistory khi sửa FEN lịch sử. |
| FEN chỉnh sửa | Ghi vào fenHistoryEdited và cập nhật updatedAt. Không lưu mọi phiên bản chỉnh sửa. |
| PGN và UCI | Không thay đổi theo thao tác sửa FEN; cập nhật qua API traces riêng, thay thế trường được gửi. |
| Phân tích / dữ liệu chuẩn hóa cũ | Bị xóa khi sửa FEN vì không còn khớp chuỗi mới. |
| Nhánh phục hồi và thông tin xử lý nhiễu | Trả trong phản hồi phục hồi; không tự lưu lâu dài tại endpoint này. |

Sau khi lưu FEN thành công, frontend cập nhật dữ liệu ván, khiến yêu cầu phục hồi chạy lại trên nguồn mới. Nếu không đủ điều kiện lưu hoặc có xung đột, API trả lỗi. Không có cơ chế tự sửa bàn cờ vật lý trong luồng này.

Nguồn đối chiếu: backend/src/routes/recover.router.ts; recover_service/app/runner.py; recover_service_v3/recovery.py; recover_service_v3/noise.py; backend/src/controllers/game.controller.ts; backend/src/models/game.model.ts; backend/src/routes/game.router.ts; frontend/components/played/pgn-modal.tsx.

## 4.6. Phân tích và hiển thị thông tin lịch sử toàn bộ ván cờ

Sau khi mở trang xem lại, frontend phân tích trực tiếp lịch sử FEN của nguồn đang được chọn. Với nguồn gốc, đó là `fenHistoryEdited` khi tồn tại hoặc `fenHistory` khi chưa chỉnh sửa. Với nhánh phục hồi, đó là chuỗi FEN của chính nhánh đó. PGN và `uciHistory` không được dùng để quyết định nước đi trong bước phân tích này, nhằm tránh dữ liệu UCI cũ hoặc lệch thứ tự làm sai kết quả.

Đối với mỗi cặp FEN liên tiếp, frontend thử tái tạo một nước đi hợp lệ bằng `chess.js`. Nếu metadata FEN như lượt đi không tin cậy, hệ thống vẫn có thể so sánh trường bố trí quân để suy luận một thay đổi duy nhất. Nếu không suy luận được nước đi, hàng đó được đánh dấu **Không khả dụng**; các FEN sau vẫn tiếp tục được phân tích thay vì hủy toàn bộ ván.

Sau khi tái tạo được trạng thái, Stockfish 18 Lite chạy trong Web Worker của trình duyệt, theo giao thức UCI. Đây là engine mã nguồn mở đóng gói cùng frontend, **không phải API đám mây hay lời gọi API bên thứ ba qua Internet**. Mỗi vị trí được phân tích với độ sâu mục tiêu 14, giới hạn khoảng một giây cho một vị trí và timeout năm giây. Khi worker lỗi, frontend tạo worker mới và thử lại một lần ở độ sâu thấp hơn.

Với mỗi nước đi, hệ thống lưu trong bộ nhớ của trang xem lại: nước đã đi, nước tốt nhất, biến chính (PV), đánh giá trước/sau theo góc nhìn Trắng, centipawn loss, nhãn phân loại và độ sâu đã đạt. Các dữ liệu này được dùng để hiển thị:

- độ chính xác của từng bên;
- đồ thị lợi thế theo từng ply;
- phân loại nước đi: Best, Brilliant, Excellent, Good, Inaccuracy, Mistake, Blunder hoặc Unavailable;
- nước đi đã thực hiện, nước đề xuất tốt nhất và biến chính của Stockfish; và
- bàn cờ, danh sách nước đi và điểm được chọn trên biểu đồ đồng bộ theo cùng một ply.

Kết quả phân tích chỉ là dữ liệu tư vấn cho người xem. Nó không thay đổi FEN, PGN, kết quả ván cờ hay trạng thái bàn cờ đang chơi. Kết quả cũng chỉ được giữ trong vòng đời trang xem lại; một bản `analysis` đã lưu trong lịch sử, nếu có, chỉ đóng vai trò cache/giá trị khởi tạo.

### Công thức đánh giá chất lượng nước đi

Gọi \(E_b\) và \(E_a\) lần lượt là đánh giá Stockfish trước và sau nước đi, chuẩn hóa theo góc nhìn Trắng. Tổn thất centipawn của nước Trắng và Đen được tính như sau:

\[
 CPL_{white}=\max(0,E_b-E_a),\qquad
 CPL_{black}=\max(0,E_a-E_b)
\]

Nhãn nước đi được xác định theo CPL: Excellent khi CPL không vượt 20, Good không vượt 50, Inaccuracy không vượt 100, Mistake không vượt 250 và Blunder lớn hơn 250. Nước đi trùng với nước tốt nhất do engine trả về được gắn Best; trường hợp thỏa thêm heuristic thí quân của dự án có thể được gắn Brilliant.

Độ chính xác chuyển điểm centipawn thành xác suất thắng theo hàm logistic, sau đó chuyển mức suy giảm xác suất thành điểm 0–100. Công thức chi tiết được trình bày tại [25-stockfish-evaluation.md](25-stockfish-evaluation.md#accuracy-formula).

## Giới hạn của hệ thống

- FEN từ cảm biến có thể không mang đầy đủ quyền nhập thành, bắt tốt qua đường hoặc lượt đi chính xác; điều này có thể làm một chuyển trạng thái không suy luận được.
- Nhiều nhánh phù hợp về bố trí quân không cho phép khẳng định nhánh nào là thực tế.
- Độ sâu, thời gian tìm kiếm và phiên bản Stockfish ảnh hưởng kết quả đánh giá.
- Engine chỉ phân tích lịch sử đã chọn sau khi mở trang xem lại; không được dùng để điều khiển luật chơi hoặc thay thế xác nhận của người quản trị.

## Code anchors

- `recover_service/service/recovery.py` — sinh, kiểm tra và cắt tỉa nhánh phục hồi.
- `backend/src/services/fen-recovery.client.ts` — gửi lịch sử FEN đến recovery service và chuyển kết quả cho backend.
- `frontend/components/played/pgn-modal.tsx` — chọn nguồn FEN, hiển thị nhánh và dữ liệu gốc/chỉnh sửa.
- `frontend/lib/post-game-analysis.ts` — suy luận nước đi từ hai FEN liên tiếp và chạy Stockfish.
- `frontend/components/played/move-analysis-panel.tsx` — hiển thị phân loại, độ chính xác, đồ thị lợi thế và chi tiết nước đi.
