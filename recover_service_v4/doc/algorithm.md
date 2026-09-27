# Giải thuật phục hồi chuỗi nước đi từ FEN

## 1. Mục tiêu

Pipeline nhận một chuỗi FEN từ sensor, suy luận một chuỗi nước đi có thể còn ký hiệu `X`, sau đó dùng padding để thay từng `X` bằng một chuỗi nước đi hợp lệ giữa hai FEN quan sát kề nhau.

Một component thất bại hoặc không còn `active_nodes` chỉ kết thúc việc phục hồi cục bộ của component đó. Giải thuật vẫn phải tạo và xử lý các `SingleSequence` phía sau, bắt đầu từ FEN quan sát ngay trước `X` tiếp theo.

## 2. Quy ước dữ liệu

- `fen_list[i]` là FEN quan sát thứ `i` sau tiền xử lý.
- `move_list[i]` mô tả transition `fen_list[i] -> fen_list[i + 1]`.
- Luôn bảo toàn `len(move_list) = len(fen_list) - 1`.
- Nước suy luận duy nhất được lưu dưới dạng UCI, ví dụ `e2e4`.
- Transition không xác định duy nhất được lưu bằng chuỗi `X`.
- Một tuple candidate từ `infer_move_from_fen` được chuyển thành `X` ở chuỗi ban đầu; padding sẽ xử lý sau.
- `active_nodes` chỉ thuộc phạm vi một component. Danh sách này rỗng không có nghĩa là toàn bộ lịch sử phải dừng.
- Mỗi `StateNode` đại diện cho một assumed FEN duy nhất theo `position` và chứa `paths: list[list[Move]]`, tức tất cả đường đi khác nhau dẫn tới assumed FEN đó.
- Khi nhiều nhánh khác path tạo cùng position, merge thành một node và nối toàn bộ `paths`; không được loại mất lịch sử nhánh.

## 3. Pseudocode tổng thể

```text
FUNCTION recover_fen_stream(raw_fens):
    viewed_fens = deduplicate(raw_fens)

    IF length(viewed_fens) < 2:
        RETURN empty result

    initial_moves = infer_initial_move_sequence(viewed_fens)
    x_indices = all i where initial_moves[i] == "X"

    IF x_indices is empty:
        RETURN initial_moves

    sequences, local_results = build_and_recover_single_sequences(
        viewed_fens,
        initial_moves,
        x_indices
    )

    full_sequence = SingleSequence(
        start_fen = viewed_fens[0],
        move_list = initial_moves,
        viewed_fen_list = viewed_fens
    )

    final_move_paths = patch_sequence(full_sequence, max_missing_fen=2)

    RETURN {
        sequences,
        local_results,
        final_move_paths
    }
```

## 4. Tiền xử lý FEN

```text
FUNCTION deduplicate(raw_fens):
    IF raw_fens is empty:
        RETURN []

    result = [raw_fens[0]]

    FOR current_fen IN raw_fens[1:]:
        IF position(current_fen) != position(result[-1]):
            result.append(current_fen)

    RETURN result
```

Chỉ loại các position trùng nhau liên tiếp. Không loại một position xuất hiện lại ở vị trí không liên tiếp.

## 5. Tạo chuỗi move ban đầu có `X`

```text
FUNCTION infer_initial_move_sequence(fen_list):
    moves = []

    FOR i FROM 0 TO length(fen_list) - 2:
        TRY:
            inferred = infer_move_from_fen(fen_list[i], fen_list[i + 1])

            IF inferred is one chess.Move:
                moves.append(inferred.uci())
            ELSE:
                # None hoặc tuple nhiều candidate.
                moves.append("X")

        CATCH FenConversionError:
            moves.append("X")

    ASSERT length(moves) == length(fen_list) - 1
    RETURN moves
```

Hàm này không thực hiện padding và không loại transition `X`.

## 6. Tạo `SingleSequence` tuần tự

Không tạo trước toàn bộ `SingleSequence` chỉ từ `viewed_fens`. `start_fen` của sequence phía sau phải ưu tiên các `assumed_fen` còn sống từ component trước.

Trước khi dùng các assumed FEN làm điểm bắt đầu, phải merge node theo `position`. Nếu sau merge không còn node nào, mới fallback về FEN quan sát ngay trước `X` hiện tại.

```text
FUNCTION build_and_recover_single_sequences(fen_list, move_list, x_indices):
    sequences = []
    local_results = []
    first_x = x_indices[0]

    # Bước 1: replay đoạn đã suy luận chắc chắn trước X đầu tiên.
    initial_board = board created from fen_list[0]
    FOR move_uci IN move_list[0:first_x]:
        initial_board.push(move created from move_uci)

    start_nodes = [
        node(
            fen = initial_board.fen(),
            paths = [move_list[0:first_x]]
        )
    ]
    x_index = 0

    WHILE x_index < length(x_indices):
        x_pos = x_indices[x_index]

        IF x_index + 1 < length(x_indices):
            end_pos = x_indices[x_index + 1]
        ELSE:
            # X cuối: xử lý tới FEN cuối để loại các nhánh không đi đến đích.
            end_pos = length(move_list)

        # Bước 2 và 4: merge assumed FEN trước khi tạo sequence.
        active_nodes = merge_nodes_by_position(start_nodes)

        IF active_nodes is empty:
            # Không còn assumed FEN: dùng FEN sensor ngay trước X làm fallback.
            active_nodes = [
                node(
                    fen = fen_list[x_pos],
                    paths = [[]]
                )
            ]

        next_start_nodes = []

        FOR active_node IN active_nodes:
            sequence = SingleSequence(
                start_fen = active_node.fen,
                parent_paths = active_node.paths,
                move_list = move_list[x_pos:end_pos],
                viewed_fen_list = fen_list[x_pos:end_pos + 1]
            )

            # Bước 3: sinh và kiểm tra các cặp (move, assumed_fen).
            result_nodes = recover_local_component(sequence)
            sequences.append(sequence)
            local_results.append(result_nodes)
            next_start_nodes.extend(result_nodes)

        # Nếu còn X, các assumed FEN sống sẽ được merge ở vòng lặp kế tiếp.
        # Nếu không còn assumed FEN, vòng sau sẽ fallback về viewed FEN trước X.
        start_nodes = next_start_nodes
        x_index = x_index + 1

    RETURN sequences, local_results
```

Quy tắc theo từng bước:

1. Tìm toàn bộ `x_indices` trước khi tạo sequence.
2. Replay `move_list[0:x_indices[0]]` từ FEN đầu để lấy `start_fen` trước `X` đầu tiên.
3. Với Python zero-based, component của `X` thứ `k` dùng `move_list[x_indices[k]:x_indices[k + 1]]` và `fen_list[x_indices[k]:x_indices[k + 1] + 1]`.
4. Suy luận các cặp `(move, assumed_fen)` trong component để tạo node bắt đầu cho component sau.
5. Trước component sau, merge các assumed node theo `position`.
6. Nếu merge còn node, mỗi active FEN tạo một `SingleSequence` riêng.
7. Nếu merge không còn node, dùng `fen_list[x_indices[k]]`, tức FEN sensor ngay trước `X` hiện tại.
8. Với `X` cuối, đặt `end_pos = len(move_list)` để replay toàn bộ phần đuôi và loại các nhánh không thể đến FEN cuối.
9. Nếu không còn assumed node sau `X` cuối, giữ `X` cuối là chưa giải quyết; không xóa kết quả của các component trước.

Nếu `X` được đánh số từ 1 thay vì dùng index Python, FEN trước `X` là `viewed_fen[x_number - 1]`. Trong source hiện tại, `x_indices` là zero-based nên FEN trước `X` là `fen_list[x_pos]`.

## 7. Phục hồi cục bộ và quy tắc khi node rỗng

```text
FUNCTION recover_local_component(sequence):
    ASSERT sequence.move_list[0] == "X"

    start_board = board created from sequence.start_fen
    active_nodes = []

    FOR candidate_move IN start_board.legal_moves:
        assumed_board = copy of start_board
        assumed_paths = [
            parent_path + [candidate_move]
            FOR parent_path IN sequence.parent_paths
        ]
        assumed_board.push(candidate_move)

        # candidate_move thay thế X đầu sequence.
        IF NOT compatible(
            assumed_board.fen(),
            sequence.viewed_fen_list[1]
        ):
            CONTINUE

        branch_is_valid = TRUE

        # Replay các move đã suy luận nằm chắn sau X.
        FOR local_index FROM 1 TO length(sequence.move_list) - 1:
            known_move = move created from sequence.move_list[local_index]

            IF known_move NOT IN assumed_board.legal_moves:
                branch_is_valid = FALSE
                BREAK

            assumed_board.push(known_move)
            assumed_paths = [
                path + [known_move]
                FOR path IN assumed_paths
            ]

            IF NOT compatible(
                assumed_board.fen(),
                sequence.viewed_fen_list[local_index + 1]
            ):
                branch_is_valid = FALSE
                BREAK

        IF branch_is_valid:
            active_nodes.append(
                node(
                    fen = assumed_board.fen(),
                    paths = assumed_paths
                )
            )

    RETURN active_nodes
```

Candidate path của một sequence được tạo theo công thức:

```text
[candidate_move] + sequence.move_list[1:]
```

Không nối nguyên `sequence.move_list` vì phần tử đầu tiên là `X`; `candidate_move` phải thay thế phần tử `X` này.

Một nhánh bị loại ngay khi xảy ra một trong hai trường hợp:

1. Move tiếp theo không hợp lệ trên `assumed_board` hiện tại.
2. FEN tạo ra sau một move không `compatible` với `viewed_fen_list` tại cùng transition.

Các node còn lại chứa assumed FEN ở cuối sequence và tất cả path dẫn đến FEN đó. Chúng được chuyển sang bước merge theo `position`.

```text
FUNCTION merge_nodes_by_position(nodes):
    merged_by_position = empty map

    FOR node IN nodes:
        key = position(node.fen)

        IF key not in merged_by_position:
            merged_by_position[key] = node(
                fen = node.fen,
                paths = copy of node.paths
            )
        ELSE:
            merged_by_position[key].paths.extend(node.paths)
            merged_by_position[key].paths = deduplicate_paths(
                merged_by_position[key].paths
            )

    RETURN values of merged_by_position
```

Ví dụ:

```text
node_1 = (assumed_fen_A, paths=[[m1, m2]])
node_2 = (assumed_fen_A, paths=[[m3, m4]])

merge(node_1, node_2)
    => (assumed_fen_A, paths=[[m1, m2], [m3, m4]])
```

Sau khi component kết thúc, các node còn sống được merge trước khi trở thành điểm bắt đầu của component kế tiếp:

```text
merged_nodes = merge_nodes_by_position(local_result_nodes)

IF merged_nodes is not empty:
    next_start_nodes = merged_nodes
ELSE:
    next_start_nodes = [
        node(
            fen = viewed FEN before next X,
            paths = [[]]
        )
    ]
```

Không lấy node chết của component trước để khởi tạo component sau. Khi không có node sống, component sau vẫn được tạo và bắt đầu lại từ FEN sensor ngay trước `X` tiếp theo.

## 8. Padding từng `X`

Hậu kỳ nhận chuỗi move ban đầu đầy đủ từ `process_fen_stream`. Với mỗi `X` tại index `i`, padding dùng cặp `viewed_fen_list[i]` và `viewed_fen_list[i + 1]`. Các `SingleSequence` cục bộ và `active_nodes` không được dùng để loại lại kết quả padding.

```text
FUNCTION patch_sequence(sequence, max_missing_fen=2):
    result_paths = [[]]

    FOR index, move IN sequence.move_list:
        replacements = [[move]]

        IF move == "X":
            padding_paths = start_padding_find(
                sequence.viewed_fen_list[index],
                sequence.viewed_fen_list[index + 1],
                max_missingFEN=2
            )

            IF padding_paths is not empty:
                replacements = padding_paths

        result_paths = [
            current_path + replacement
            FOR current_path IN result_paths
            FOR replacement IN replacements
        ]

    RETURN deduplicate_paths(result_paths)
```

Các move đã được suy luận trong `process_fen_stream` được giữ nguyên. Padding chỉ thay đúng vị trí `X`, không replay để loại lại phần move đã có. Nếu nhiều `X` có nhiều padding path, kết quả là toàn bộ tích Descartes giữa các tập path đó. Nếu một `X` không có kết quả padding, `X` được giữ lại.

`start_padding_find` phải trả tất cả đường hợp lệ trong giới hạn độ sâu. Hai chuỗi nước đi khác thứ tự được giữ thành hai path riêng nếu đều replay đến cùng target position.

```text
FUNCTION start_padding_find(fen1, fen2, max_missingFEN=2):
    start_board = board created from fen1
    target_position = position(fen2)
    max_depth = max_missingFEN + 1
    solutions = []

    FUNCTION dfs(current_board, depth, path):
        IF position(current_board.fen()) == target_position:
            solutions.append(path converted to UCI)
            RETURN

        IF depth == 0:
            RETURN

        FOR move IN current_board.legal_moves:
            current_board.push(move)
            dfs(current_board, depth - 1, path + [move])
            current_board.pop()

    dfs(start_board, max_depth, [])
    RETURN deduplicate_paths(solutions)
```

## 9. Ví dụ luồng hiện tại

```text
FEN_0: vị trí ban đầu
FEN_1: sau e2e4
FEN_2: sau e7e5, g1f3, b8c6

Initial moves:
    ["e2e4", "X"]

Padding tại X:
    start  = FEN_1
    target = FEN_2
    depth  = max_missingFEN + 1 = 3 nước

Các kết quả hợp lệ:
    [
        ["b8c6", "g1f3", "e7e5"],
        ["e7e5", "g1f3", "b8c6"]
    ]

Các final move path:
    [
        ["e2e4", "b8c6", "g1f3", "e7e5"],
        ["e2e4", "e7e5", "g1f3", "b8c6"]
    ]
```

# Hướng dẫn sửa code

## 10. `models.py`

1. Chỉ giữ một định nghĩa `StateNode` trong `models.py`.
2. `SingleSequence.move_list` cần thống nhất lưu chuỗi UCI hoặc chuỗi `X`.
3. `SingleSequence` cần thêm `parent_paths: list[list[Move]]` để lưu các đường đi đã dẫn tới `start_fen`.
4. `StateNode` dùng cho kết quả phục hồi cần có tối thiểu:
   - `fen`: FEN hiện tại.
   - `paths`: danh sách các path UCI khác nhau cùng dẫn tới position này.
5. Chuỗi FEN quan sát vẫn thuộc `SingleSequence.viewed_fen_list`; không dùng `StateNode` để lưu một `fen_history` riêng cho từng path.

## 11. `FEN_utils.py`

### 11.1. Xóa `StateNode` trùng

Xóa class `StateNode` cục bộ hiện nằm gần hàm `_merge_nodes_by_position`. Dùng `StateNode` được import từ `models.py` để tránh trường hợp một loại node có `board`, còn loại kia có `fen` và `fen_history`.

### 11.2. Sửa `_merge_nodes_by_position`

1. Đọc position từ `node.fen`; không truy cập `node.board` nếu model chính chỉ lưu `fen`.
2. Key của dictionary merge là `get_fen_position(node.fen)`.
3. Khi key chưa tồn tại, lưu node cùng bản sao `node.paths`.
4. Khi key đã tồn tại, nối thêm toàn bộ `node.paths` vào node đang có.
5. Loại path trùng hoàn toàn nhưng giữ mọi path khác nhau.
6. Kết quả là một node cho mỗi position, mỗi node có thể chứa nhiều path.

### 11.3. Viết lại `process_fen_stream`

Thực hiện theo thứ tự:

1. Duyệt toàn bộ cặp FEN để tạo `move_list` trước.
2. Dùng chuỗi `X`, không dùng `None`.
3. Nếu `move_list` không có `X`, trả kết quả ngay; không tạo `SingleSequence` và không chạy local recovery.
4. Nếu có `X`, replay `move_list[0:x_indices[0]]` từ FEN đầu để lấy `start_fen` trước `X` đầu tiên.
5. Tạo và phục hồi `SingleSequence` tuần tự theo từng vị trí `X`, không dựng toàn bộ sequence trước.
6. Trong mỗi sequence, suy luận các cặp `(move, assumed_fen)` và giữ các assumed node còn hợp lệ.
7. Trước khi tạo sequence phía sau, merge `active_nodes` của component trước theo `position`.
8. Nếu sau merge còn node, dùng từng `node.fen` làm `start_fen` và `node.paths` làm `parent_paths` cho các sequence kế tiếp.
9. Nếu sau merge không còn node, dùng `fen_list[x_pos]`, tức FEN sensor trước `X`, làm `start_fen` fallback.
10. Khi node của một component rỗng, lưu trạng thái thất bại cục bộ rồi tiếp tục tạo component kế tiếp.
11. Sequence của `X` cuối phải bao gồm phần move còn lại tới cuối để loại các nhánh không đến được FEN cuối.
12. Nếu sau `X` cuối không còn assumed node, giữ `X` cuối là chưa giải quyết.
13. Bảo toàn invariant `len(move_list) = len(fen_list) - 1`.

### 11.4. Sửa `patch_missing_transitions`

1. Nhận một `SingleSequence` chứa toàn bộ `initial_moves` và `viewed_fens`.
2. Với mỗi `X` tại index `i`, gọi `start_padding_find(viewed_fen_list[i], viewed_fen_list[i + 1], 2)`.
3. Giữ nguyên mọi move khác `X`; không replay hoặc loại lại phần move đã được khôi phục trong `process_fen_stream`.
4. Đổi `max_missingFEN=4` thành `2` cho pipeline hiện tại.
5. Nếu một `X` không vá được, giữ lại `X` và tiếp tục xử lý `X` tiếp theo.
6. Khi một `X` có nhiều padding path, nhân chúng với các kết quả đang có để tạo tích Descartes.
7. Không trả `None` làm ngắt toàn bộ pipeline tại lỗi padding đầu tiên.

### 11.5. Sửa contract của `start_padding_find`

1. Đầu vào là hai FEN và số FEN tối đa bị thiếu.
2. Với `max_missingFEN=2`, DFS được phép tìm tối đa ba nước.
3. Kết quả là `list[list[Move]]`; mỗi phần tử là một path UCI hợp lệ.
4. Nếu không tìm thấy đường nào, trả danh sách rỗng.
5. Khi tìm thấy một path, thêm path vào `solutions` rồi tiếp tục duyệt các nhánh DFS còn lại.
6. Loại các path trùng hoàn toàn trước khi trả kết quả.

## 12. `main.py`

1. Chạy `deduplicate` trên chuỗi sensor.
2. Tạo `initial_moves`, rồi gọi `process_fen_stream` để tạo các `SingleSequence` cục bộ và metadata nhánh.
3. Không dùng `active_nodes` làm điều kiện để chạy padding.
4. Tạo một `SingleSequence` đầy đủ từ `initial_moves` và `viewed_fens`, rồi gọi `patch_missing_transitions` một lần.
5. Giữ tất cả tổ hợp padding path và giữ nguyên các move đã suy luận.
6. Nếu một component vẫn còn `X`, đánh dấu kết quả là phục hồi một phần và tiếp tục các component sau.
7. Chỉ replay SAN liên tục khi toàn bộ path không còn `X`.
8. Nếu vẫn còn `X`, replay và xuất SAN riêng cho từng component từ `sequence.start_fen`.
9. Khi replay toàn bộ ván, khởi tạo board từ FEN đầu vào thay vì luôn dùng `chess.Board()` mặc định.

## 13. `test_padding.py`

Không assert một thứ tự nước duy nhất khi nhiều chuỗi hợp lệ tạo cùng target position. Test cần duyệt mọi path được trả về và kiểm tra:

1. Kết quả chứa ít nhất một path.
2. Từng UCI move của từng path hợp lệ khi replay.
3. Mỗi path không vượt quá `max_missingFEN + 1` nước.
4. Position cuối của mọi path bằng position của target FEN.
5. Test case hiện tại chứa cả hai path `b8c6, g1f3, e7e5` và `e7e5, g1f3, b8c6`.

## 14. Thứ tự triển khai đề xuất

```text
1. Thống nhất StateNode và ký hiệu X
2. Viết lại phần tạo initial move_list trong process_fen_stream
3. Tạo SingleSequence tuần tự từ các active node đã merge; fallback về viewed FEN khi node rỗng
4. Sửa start_padding_find và patch_missing_transitions để giữ tất cả padding path
5. Sửa main để padding không phụ thuộc active_nodes
6. Sửa output partial recovery và SAN theo component
7. Cập nhật test_padding theo điều kiện replay/target position
```

## 15. Tiêu chí hoàn thành

- Chuỗi `N` FEN luôn tạo `N - 1` transition.
- Tuple candidate và lỗi inference được biểu diễn bằng `X`.
- `active_nodes` rỗng không ngắt việc tạo hoặc xử lý sequence phía sau.
- Trước khi tạo sequence tiếp theo, các assumed FEN còn sống được merge theo `position`.
- Các node cùng position được gộp thành một node nhưng vẫn giữ đầy đủ danh sách path khác nhau.
- Sequence phía sau ưu tiên assumed FEN đã merge làm `start_fen`; chỉ fallback về viewed FEN khi không còn node.
- Mỗi `X` tại index `i` được padding từ `viewed_fens[i]` đến `viewed_fens[i + 1]`.
- Các padding path của nhiều `X` được ghép thành toàn bộ tích Descartes.
- Padding thất bại tại một `X` không ngăn xử lý các `X` tiếp theo.
- Kết quả phân biệt phục hồi hoàn toàn và phục hồi một phần.
- UCI có thể xuất trực tiếp; SAN được replay từ đúng `start_fen` của toàn ván hoặc từng component.
