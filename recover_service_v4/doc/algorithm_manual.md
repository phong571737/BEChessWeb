bước 0: tìm các X_indice
bước 1: tìm start_fen đầu tiên: Thực hiện initial_fen.push(infer_move[:X_indice[0]])
bước 2: Khởi tạo initial_single_sequence đầu tiên bằng start_fen, infer_move[X_indice[1]:X_indice[2]], viewed_fen[X_indice[1]:X_indice[2]]
bước 3: Suy luận để tìm các cặp (move, assumed_fen) của initial_single_sequence
bước 4: Trường hợp còn X:
- Nếu còn nhiều assumed_fen: thực hiện merg_by_position, được các active_fens: với mỗi active_fen thực hiện tiếp tục tạo single_sequence(active_fen, infer_move[X_indice[2]:X_indice[3]], viewed_fen[X_indice[2]:X_indice[3]])
- Nếu hết assumed_fen (k còn dãy active): thực hiện tạo single_sequence bằng (viewed_fen[X_indice[2] -1], infer_move[X_indice[2]:X_indice[3]], viewed_fen[X_indice[2]:X_indice[3]])

Trường hợp hết X: 
- Nếu còn nhiều assumed_fen: thực hiện merg_by_position, được các active_fens: với mỗi active_fen thực hiện tiếp tục tạo single_sequence(active_fen, infer_move[X_indice[2]:X_indice[3]], viewed_fen[X_indice[2]:X_indice[3]]) để loại bớt các nhánh đến với FEN cuối
- Nếu k còn assumed_fen: thì chỗ cuối cùng vẫn giữ X

bước 5: tăng index và lặp lại bước 4 đến khi hết X

