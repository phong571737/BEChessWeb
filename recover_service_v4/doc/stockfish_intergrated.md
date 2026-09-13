# Đặc tả tích hợp Stockfish

## 1. Phạm vi đánh giá

Stockfish chỉ đánh giá các nước được padding để thay thế `X`. Các nước đã suy
luận chắc chắn chỉ được replay nhằm tái tạo đúng trạng thái bàn cờ.

Nếu một `X` được thay bằng nhiều nước, tất cả nước trong đoạn padding đều được
đánh giá theo thứ tự thời gian.

## 2. Quy ước điểm

Điểm được lấy sau khi thực hiện nước padding và quy về góc nhìn của bên vừa đi:

- Điểm dương: có lợi cho bên vừa đi.
- Điểm âm: bất lợi cho bên vừa đi.
- Điểm lớn hơn: nước đi hiệu quả hơn.
- Điểm chiếu hết được quy đổi về miền số nguyên lớn, ví dụ `±100000`.

## 3. Chỉ mục padding

Chỉ mục được tính trên danh sách nước hoàn chỉnh sau padding.

```text
Initial: [e2e4, X1, f1c4, X2]
X1:      [e7e5, g1f3]
X2:      [b8c6]
Final:   [e2e4, e7e5, g1f3, f1c4, b8c6]
Index:      0      1      2      3      4
```

Khóa padding của nhánh là `(1, 2, 4)`. Vector điểm tương ứng có dạng
`[score_1, score_2, score_4]`.

Hệ thống phải lưu ranh giới các đoạn padding theo từng `X` trong metadata nội
bộ để phục vụ truy vết.

## 4. Phân nhóm và sắp xếp

Các nhánh có cùng khóa chỉ mục padding được xếp vào một nhóm. Mỗi nhóm được sắp
xếp độc lập; không so sánh các nhánh thuộc hai khóa khác nhau.

Trong một nhóm, vector điểm được so sánh giảm dần theo thứ tự từ trái sang phải
(lexicographic). Điểm tại chỉ mục trước có độ ưu tiên tuyệt đối so với điểm tại
chỉ mục sau.

```text
A = [80, 20, 30]
B = [80, 10, 500]
C = [50, 900, 900]

Thứ tự: A, B, C
```

Không sử dụng tổng điểm, trung bình, trọng số, độ dài padding hoặc điểm của nước
không thuộc padding. Nếu hai vector bằng nhau, giữ nguyên thứ tự sinh nhánh.

## 5. Cấu trúc kết quả

Kiểu dữ liệu Python:

```python
dict[
    tuple[int, ...],
    list[tuple[list[Move], list[int]]],
]
```

Ví dụ:

```python
{
    (1, 3): [
        (["e2e4", "e7e5", "g1f3", "b8c6"], [35, 20]),
        (["e2e4", "c7c5", "g1f3", "g8f6"], [30, 18]),
    ],
    (1, 2, 4): [
        (["e2e4", "e7e5", "g1f3", "f1c4", "b8c6"], [35, 28, 20]),
    ],
}
```

`list` không thể làm khóa dictionary trong Python, vì vậy khóa chỉ mục sử dụng
`tuple`. Khi tuần tự hóa JSON, mỗi nhóm được biểu diễn bằng một object chứa
`indices` và `ranked_paths`.

## 6. Trường hợp lỗi

- Nhánh còn `X` hoặc replay không hợp lệ không được đưa vào kết quả xếp hạng.
- Nếu Stockfish không khởi động hoặc không trả được điểm, pipeline phải báo lỗi
  rõ ràng và không trả kết quả chưa sắp xếp.
- Không sử dụng điểm giả cho vị trí đánh giá thất bại.

## 7. Tối ưu

Kết quả đánh giá được cache theo:

```python
(fen_after_padding_move, mover_color, stockfish_depth)
```

Cache chỉ giảm số lần gọi Stockfish và không làm thay đổi tập nhánh đầu ra.
