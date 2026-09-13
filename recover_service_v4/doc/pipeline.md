# Đặc tả pipeline end-to-end

## 1. Mục tiêu

`pipeline.py` cung cấp một hàm duy nhất để chuyển chuỗi FEN thô thành các nhánh
nước đi hoàn chỉnh, được phân nhóm và sắp xếp bằng Stockfish.

## 2. Giao diện

```python
def run_pipeline(
    raw_fens: list[str],
    stockfish_path: str,
    max_missing_fens: int = 2,
    stockfish_depth: int = 15,
) -> dict[
    tuple[int, ...],
    list[tuple[list[str], list[int]]],
]:
    ...
```

`stockfish_path` được truyền từ bên ngoài, không hard-code trong pipeline.

## 3. Luồng xử lý

```text
raw_fens
→ kiểm tra FEN
→ loại các FEN liên tiếp bị trùng
→ suy luận transition thành move hoặc X
→ padding từng X và lưu index các nước được thêm
→ tạo, replay và kiểm tra các nhánh hoàn chỉnh
→ loại nhánh còn X hoặc chứa nước không hợp lệ
→ Stockfish chấm các nước padding
→ nhóm theo bộ index padding
→ sắp xếp độc lập trong từng nhóm
→ trả kết quả
```

`process_fen_stream()` được giữ trong chuỗi xử lý để thực hiện bước phục hồi cục
bộ như trong luồng `main.py` ban đầu. Output công khai vẫn được tạo từ các nhánh
padding hoàn chỉnh và kết quả xếp hạng Stockfish.

## 4. Dữ liệu nhánh nội bộ

Trong quá trình padding, mỗi nhánh phải giữ tối thiểu:

```python
(final_moves, padding_indices)
```

Sau khi đánh giá:

```python
(final_moves, padding_indices, padding_scores)
```

`padding_indices` là vị trí các nước padding trong `final_moves`.
`padding_scores[i]` là điểm Stockfish của nước tại `padding_indices[i]`.

## 5. Đánh giá Stockfish

- Chỉ đánh giá các nước được padding để thay thế `X`.
- Nếu một `X` sinh nhiều nước, đánh giá tất cả nước trong đoạn padding.
- Điểm được lấy sau khi thực hiện nước và quy về góc nhìn của bên vừa đi.
- Các nước suy luận chắc chắn chỉ được replay, không tham gia xếp hạng.
- Các vị trí trùng được cache để tránh đánh giá lặp lại.

## 6. Phân nhóm và sắp xếp

Các nhánh có cùng `padding_indices` thuộc cùng một nhóm. Các nhóm được xử lý độc
lập và không so sánh với nhau.

Trong mỗi nhóm, `padding_scores` được sắp xếp giảm dần theo thứ tự từ trái sang
phải (lexicographic). Điểm tại index trước có độ ưu tiên tuyệt đối. Nếu hai
vector điểm bằng nhau, giữ nguyên thứ tự sinh nhánh.

Không sử dụng tổng điểm, trung bình, trọng số, độ dài padding hoặc điểm của nước
không thuộc padding.

## 7. Kết quả

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

Trong đó:

- Key là tuple chứa index các nước padding trong danh sách nước hoàn chỉnh.
- Value là danh sách `(move_list, padding_scores)` đã được sắp xếp.
- Pipeline không trả diagnostics.

## 8. Trường hợp đặc biệt

- FEN không hợp lệ: phát sinh `ValueError`.
- Stockfish không khởi động hoặc không trả được điểm: phát sinh lỗi; không trả
  kết quả chưa sắp xếp.
- Nhánh còn `X` hoặc replay không hợp lệ: loại khỏi kết quả.
- Không còn nhánh hợp lệ: trả `{}`.
- Không có `X`: không gọi Stockfish và trả nhánh duy nhất với key `()` cùng danh
  sách điểm rỗng.

```python
{
    (): [
        (["e2e4", "e7e5", "g1f3"], []),
    ],
}
```
