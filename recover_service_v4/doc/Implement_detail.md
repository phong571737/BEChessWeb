# 0. Thứ tự thực hiện giải thuật
- Bước 1: Deduplicate
- Bước 2: Move_infer
- Bước 3: Chuẩn hóa side_to_move
- Bước 4: Khởi tạo các chuỗi Single_sequence
- Bước 5: Giải thuật xử lý tuần tự các Single_sequence
- Bước 6: Hậu kỳ padding các chỗ đứt gãy
# 1. Các kiểu cấu trúc dữ liệu: 
- FEN: str
- Board: List[64 square]
- Single_sequence: {
    - StartFEN: FEN
    - Move_list: List[Move]
    - View_FEN_list: List[FEN]
}


# 2. Các micro service: 
- Compatible(assumed_FEN, observed_FEN): Fen giả định có thể là FEN quan sát (output: bool)
- Infer_move(FEN1, FEN2): Suy luận nước đi (output: move)
- Normalize_side_to_move(FEN, ): Chuẩn hóa màu FEN from dựa trên nước đi (output: FEN)
- start_padding_find(FEN1, FEN2, max_missingFEN = 2): Thực hiện tìm kiếm điểm nối giữa 2 FEN đứt gãy bằng PADDING (output: List[move])
- merge_FEN_position(List[FEN]): Thực hiện merge FEN list theo vị trí (output: FEN_list)
- Deduplicate(List[FEN]): Thực hiện lọc chuỗi FEN, lọc 2 FEN liên tiếp bị trùng lặp, lặp lại cho tới khi không còn 2 FEN nào liên tiếp bị trùng lặp (output: List[FEN])


# 3. Cấu trúc file: 
- models.py chứa các data model class
- FEN_utils: Chức các service nhỏ bao gồm: 
+ fen_to_board(fen: FEN) -> board
+ get_fen_position(fen: FEN) -> str
+ set_side_to_move(fen: FEN, side: str) -> FEN
+ compatible(assumed_fen: FEN, observed_fen: FEN) -> bool:
+ merge_fen_position(fen_list: List[FEN]) -> list[FEN]

- move_service: gồm các service ở move
+ infer_move(FEN1, FEN2) -> San_move: lưu ý ở đây chỉ nhận nếu có 1 San move duy nhất còn lại trả None. các trường hợp ngoại lệ sẽ được định nghĩa ở get transition phía sau

# 4. Vị trí implementation hiện tại

> Số hàng dưới đây tính theo source hiện tại. `Một phần` nghĩa là đã có khung hoặc một phần logic nhưng chưa đáp ứng đầy đủ mô tả trong báo cáo.

## 4.1. Tiền xử lý FEN sensor

- Lấy phần `position`: `FEN_utils.py:7-8` — hàm `get_fen_position`.
- Loại FEN trùng liên tiếp theo `position`: `FEN_utils.py:50-59` — hàm `deduplicate` (`một phần`, hiện có lỗi tên biến `depuped_fens` tại hàng 56).
- So sánh FEN đầu tiên với `start_fen`: `chưa có`. `deduplicate` hiện giữ phần tử đầu tiên tại `FEN_utils.py:54` và không nhận `start_fen`.

## 4.2. Kiểm tra tương thích FEN

- Parse FEN giả định và FEN quan sát: `FEN_utils.py:17-22` — hàm `compatible`.
- So sánh một chiều trên 64 ô: `FEN_utils.py:23-28`.
- Hỗ trợ sensor bỏ sót quân: ý định nằm tại `FEN_utils.py:26-28`, chỉ loại khi phía quan sát có quân nhưng khác phía giả định (`một phần`, biểu thức `is Not None` tại hàng 26 chưa hợp lệ).

## 4.3. Suy luận nước đi

- Parse hai FEN liên tiếp thành bàn cờ: `move_service.py:6-8` — hàm `infer_move`.
- Tìm các ô thay đổi: `move_service.py:9-11`.
- Tìm ô nguồn và ô đích: `move_service.py:13-31` (`một phần`, phần xử lý ô đích đang sai phạm vi vòng lặp và dùng biến trước khi gán).
- Sinh candidate và xử lý promotion: `move_service.py:33-35` (`một phần`, `PAWN` và `NONE` chưa được định nghĩa).
- So khớp quân di chuyển, gồm promotion: `move_service.py:42-50` — hàm `_same_moving_piece`.
- Xử lý nhập thành: `move_service.py:57-84` — hàm `_castling_move` (`một phần`, chưa được gọi từ `infer_move` và còn lỗi biểu thức tại hàng 70).
- Kiểm tra candidate theo luật cờ: `chưa có` trong `infer_move`; hàm chưa đối chiếu candidate với `legal_moves`.

## 4.4. Tạo chuỗi nước đi ban đầu

- Model chuỗi: `models.py:11-15` — `SingleSequence(start_fen, move_list, viewed_fen_list)`.
- Chọn candidate duy nhất, trả `None` khi không duy nhất: `move_service.py:35-38` (`một phần`; chưa phân biệt 0 candidate với nhiều candidate và chưa dựng chuỗi).
- Biểu diễn `X`: `models.py:14` cho phép `None` trong `move_list`, nhưng chưa có code chuyển `None` thành ký hiệu `X`.
- Khởi tạo chuỗi ban đầu: `FEN_utils.py:98-107` — khung `process_fen_stream` (`chưa hoàn chỉnh`, đang dùng các biến chưa định nghĩa).

## 4.5. Side-to-move normalization

- Đặt trực tiếp lượt đi: `FEN_utils.py:10-15` — hàm `set_side_to_move`.
- Suy ra lượt từ quân di chuyển: `FEN_utils.py:42-47` — hàm `normalize_side_to_move` (`một phần`, chưa trả về FEN và bỏ qua giá trị trả về của `set_side_to_move`).

## 4.6. Local Recovery

- Node bắt đầu và danh sách node đang hoạt động: `FEN_utils.py:84-87`, `FEN_utils.py:102-105`.
- Điểm vào xử lý luồng FEN: `FEN_utils.py:98-107` — `process_fen_stream` (`khung chưa hoàn chỉnh`).
- Phân nhánh candidate: `chưa có` trong local recovery.
- Replay và loại nhánh không hợp lệ/không tương thích: `chưa có`.
- Chia lịch sử thành component: `chưa có`; mới có model `SingleSequence` tại `models.py:11-15`.

## 4.7. Đồ thị trạng thái

- Node chứa bàn cờ và đường đi: `FEN_utils.py:84-87` — `StateNode` (`một phần`).
- Gộp node theo `position`: `FEN_utils.py:89-96` — `_merge_nodes_by_position`.
- Cạnh/transition của đồ thị: `chưa có`.
- Thuộc tính `parents`: `chưa có`; `StateNode` hiện chỉ có `board` và `path` tại `FEN_utils.py:85-87`.

## 4.8. Continuous Recovery bằng padding

- Tìm đường nối giữa hai FEN bằng DFS: `FEN_utils.py:62-81` — `start_padding_find`.
- Giới hạn tối đa 0, 1 hoặc 2 FEN bị thiếu: `FEN_utils.py:62-67`; độ sâu nước đi là `max_missingFEN + 1`.
- Sinh nước hợp lệ: `FEN_utils.py:74-77` qua `current_board.legal_moves`.
- Trả đường đi dạng UCI: `FEN_utils.py:68-69`.
- Phục hồi liên tục từ `start_fen` tới FEN cuối: `chưa có`; hàm hiện chỉ nối một cặp FEN và còn thiếu `return result` sau hàng 78.

## 4.9. Targeted Padding

- Chỉ xử lý vị trí `X`: `chưa có`.
- Thử replacement gồm 2 hoặc 3 nước: `chưa có`.
- Replay replacement tới cuối lịch sử để chấp nhận: `chưa có`.
- `start_padding_find` tại `FEN_utils.py:62-81` chỉ là primitive tìm đường giữa hai FEN, chưa phải targeted padding.

## 4.10. Component Merging và đầu ra

- Gộp danh sách FEN theo `position`: `FEN_utils.py:31-40` — `merge_fen_position`.
- Gộp state node theo `position`: `FEN_utils.py:89-96` — `_merge_nodes_by_position`.
- Kiểu dữ liệu component/sequence: `models.py:11-15` — `SingleSequence`.
- UCI: `FEN_utils.py:68-69` mới có ở kết quả của `start_padding_find`.
- SAN: `chưa có`.
- Ghép component thành kết quả cuối: `chưa có`.
- Trả component, vị trí chưa giải quyết và metadata: `chưa có`.
- `main.py`: hiện trống, chưa có pipeline điều phối hoặc đầu ra cuối.
