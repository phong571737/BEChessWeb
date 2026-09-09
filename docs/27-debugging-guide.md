# 27. Debugging Guide

Tài liệu này tổng hợp các lệnh thường dùng để tìm lỗi trong BEChessWeb và quy trình xác định nguyên nhân gốc thay vì sửa theo triệu chứng. Các ví dụ giả định repository nằm tại `E:\DOAN2\BEChessWeb` trên Windows hoặc `~/BEChessWeb` trên VPS Linux.

## Nguyên tắc tìm lỗi nhanh

Một lỗi giao diện thường không bắt đầu ở giao diện. Trước khi sửa, hãy vẽ luồng dữ liệu ngắn nhất có thể:

```text
nguồn dữ liệu
  -> API/Socket/MQTT
  -> controller/service
  -> MongoDB hoặc bộ nhớ runtime
  -> response/event
  -> provider/hook/page
  -> component hiển thị
```

Tại mỗi ranh giới, kiểm tra ba câu hỏi:

1. Dữ liệu có tồn tại không?
2. Tên trường, kiểu dữ liệu và đơn vị có đúng không?
3. Thành phần kế tiếp có thật sự nhận và dùng dữ liệu đó không?

Không nên bắt đầu bằng cách sửa CSS, thêm fallback hoặc đổi giá trị mặc định. Những cách đó có thể che mất lỗi dữ liệu thật.

## Quy trình chẩn đoán chuẩn

### 1. Chuyển mô tả lỗi thành một điều kiện kiểm chứng được

Ví dụ: “Match Analysis luôn bằng 0” được đổi thành:

- Stockfish đã tạo ra danh sách phân tích chưa?
- danh sách đó nằm trong state nào?
- `MatchAnalysis` đang đọc state vừa tạo hay chỉ đọc dữ liệu cũ từ database?

Điều kiện rõ ràng giúp tìm đúng biến và đúng component thay vì đọc toàn bộ repository.

### 2. Tìm điểm hiển thị cuối cùng

Tìm tên component, nhãn hoặc biến đang hiển thị:

```powershell
rg -n "MatchAnalysis|analysisMoves|moveClassifications" frontend
rg -n "Phân tích ván cờ|Match Analysis" frontend
```

Nếu máy chưa có `rg`:

```powershell
Get-ChildItem frontend -Recurse -File |
  Select-String -Pattern 'MatchAnalysis|analysisMoves|moveClassifications'
```

### 3. Đi ngược luồng dữ liệu

Sau khi tìm component cuối, lần lượt tìm:

- prop được truyền vào component;
- state tạo prop;
- callback cập nhật state;
- API, Socket event hoặc hàm phân tích tạo dữ liệu ban đầu.

Ví dụ:

```powershell
rg -n "analysisMoves|onAnalysisChange|onAnalysisSaved|game\.analysis" frontend
rg -n "analyzeHistoryMoves|fenHistoryEdited|fenHistory" frontend
```

Đây là bước quan trọng nhất. Nếu component A tạo kết quả trong local state nhưng component B chỉ đọc `game.analysis.moves` từ response database, cả hai đều hoạt động riêng lẻ nhưng màn hình tổng hợp vẫn bằng 0.

### 4. Xác định nguồn sự thật

Mỗi loại dữ liệu nên có một nguồn chính:

| Dữ liệu | Nguồn chính |
| --- | --- |
| Vị trí bàn cờ điện tử | `fenHistory` nhận từ ESP32 |
| FEN quản trị viên đã sửa | `fenHistoryEdited`, nếu tồn tại |
| Nhánh khôi phục | FEN của chính nhánh được chọn |
| Đồng hồ đang chơi | trạng thái đồng hồ do backend tính |
| Phân tích của nguồn đang xem | `analysisMoves` trong tab hiện tại |
| Phân tích đã lưu trước đây | `game.analysis.moves`, chỉ là fallback/cache |

Khi hai nguồn cùng tồn tại, phải ghi rõ thứ tự ưu tiên. Không trộn FEN của một nguồn với PGN, UCI hoặc kết quả Stockfish của nguồn khác.

### 5. Tạo giả thuyết nhỏ và kiểm tra bằng bằng chứng

Ví dụ giả thuyết:

> Move Analysis đã chạy nhưng Match Analysis không nhận cùng mảng kết quả.

Kiểm tra bằng cách đọc đúng các điểm nối, không thêm log khắp dự án:

```powershell
rg -n -C 5 "setAnalysisMoves|onAnalysisChange|onAnalysisSaved" frontend
```

`-C 5` hiển thị thêm năm dòng trước và sau kết quả, hữu ích để thấy callback được khai báo nhưng có được gọi hay không.

### 6. Sửa tại ranh giới bị đứt

Ưu tiên sửa đường truyền dữ liệu thay vì nhân đôi thuật toán. Ví dụ, nâng kết quả Stockfish từ component con lên page state rồi truyền cùng state đó cho biểu đồ và bảng thống kê. Không chạy một lượt Stockfish thứ hai chỉ để phục vụ component khác.

### 7. Kiểm tra theo mức độ rủi ro

Sau khi sửa frontend TypeScript:

```powershell
Set-Location frontend
npx tsc --noEmit
npm run lint
npm run test:analysis
npm run build
```

Sau khi sửa backend:

```powershell
Set-Location E:\DOAN2\BEChessWeb
npm run build
npm run test:time-control
```

Luôn chạy kiểm tra whitespace và conflict marker:

```powershell
git diff --check
rg -n "^(<<<<<<<|=======|>>>>>>>)" .
```

## Lệnh tìm code và đọc file

### Ripgrep

`rg` tìm chuỗi rất nhanh và mặc định tôn trọng `.gitignore`.

```powershell
# Tìm chuỗi và in số dòng
rg -n "RECOVER_SERVICE_URL" .

# Tìm không phân biệt hoa thường
rg -ni "whitename" backend frontend

# Chỉ tìm trong TypeScript/TSX
rg -n -g "*.ts" -g "*.tsx" "fenHistoryEdited" frontend

# Liệt kê file rồi lọc theo tên
rg --files frontend | rg "analysis|review|pgn"

# Hiển thị ngữ cảnh quanh kết quả
rg -n -C 4 "clock_state" backend frontend

# Loại thư mục build khỏi kết quả
rg -n "console\.log" backend frontend -g "!dist/**" -g "!.next/**"
```

Ý nghĩa các tùy chọn thường dùng:

- `-n`: in số dòng.
- `-i`: không phân biệt chữ hoa/chữ thường.
- `-C N`: in thêm `N` dòng ngữ cảnh ở cả hai phía.
- `-g`: chỉ bao gồm hoặc loại trừ glob file.
- `--files`: chỉ liệt kê tên file.

### PowerShell khi không có `rg`

```powershell
Get-ChildItem backend,frontend -Recurse -File |
  Select-String -Pattern 'setInterval|setTimeout|addEventListener'
```

Nếu lệnh không trả kết quả, điều đó chỉ có nghĩa là không tìm thấy mẫu trong phạm vi đã chọn. Hãy kiểm tra lại:

- đang đứng đúng thư mục chưa;
- tên thư mục có tồn tại không;
- regex có quá chặt không;
- code có nằm trong file build/minified thay vì source không.

### Đọc một phần file lớn

```powershell
Get-Content frontend/components/played/move-analysis-panel.tsx |
  Select-Object -Skip 100 -First 100
```

Hoặc in kèm số dòng:

```powershell
$line = 0
Get-Content frontend/lib/post-game-analysis.ts |
  ForEach-Object { $line++; "{0,5}: {1}" -f $line, $_ }
```

## Git: kiểm tra thay đổi và merge

```powershell
# File đang thay đổi
git status --short

# Diff toàn bộ chưa commit
git diff

# Diff một file
git diff -- frontend/components/played/match-analysis.tsx

# Lỗi whitespace
git diff --check

# Lịch sử commit ngắn
git log --oneline --decorate -n 20

# Commit gần nhất thay đổi một file
git log -p -n 1 -- frontend/components/played/pgn-modal.tsx

# Điểm chung của hai nhánh
git merge-base master dev-long

# Những commit có ở dev-long nhưng chưa có ở master
git log --oneline master..dev-long

# Diff thay đổi của dev-long kể từ điểm chung
git diff master...dev-long

# Chỉ xem tên file khác nhau
git diff --name-status master...dev-long
```

Trước khi merge, dùng `git status --short` để bảo đảm biết rõ thay đổi local nào thuộc về mình. Không dùng `git reset --hard` hoặc `git checkout --` để xử lý conflict khi chưa sao lưu thay đổi.

## Frontend: chẩn đoán trình duyệt

Trong DevTools, kiểm tra theo thứ tự:

1. **Network**: request có được gửi không, URL có đúng không, status là gì, response body nói gì.
2. **Console**: lỗi hydration, worker, CORS, mixed content hay JavaScript runtime.
3. **Application**: token, local storage, session storage và cookie.
4. **React state/data flow**: prop hiện tại có đúng nguồn đang chọn không.

## VPS Linux: kiểm tra lịch sử RAM và Docker

### Kiểm tra dữ liệu RAM đã thu thập bằng sysstat

`docker stats` chỉ hiển thị mức sử dụng hiện tại. Muốn xem lịch sử, VPS phải cài và bật `sysstat` trước đó.

```bash
# Cài công cụ ghi lại CPU/RAM và bật các timer thu thập dữ liệu
sudo apt update
sudo apt install sysstat
sudo systemctl enable --now sysstat

# Kiểm tra dịch vụ khởi tạo log
systemctl status sysstat

# Kiểm tra timer thực hiện việc lấy mẫu định kỳ
systemctl list-timers --all | grep sysstat

# Xem các file dữ liệu đã có
ls -lh /var/log/sysstat/

# Xem thống kê RAM trong ngày hiện tại
sar -r

# Xem thống kê RAM của ngày hôm qua
sar -r -f /var/log/sysstat/sa$(date -d yesterday +%d)

# Xem một ngày cụ thể, ví dụ ngày 22
sar -r -f /var/log/sysstat/sa22
```

`sysstat.service` có thể hiển thị `active (exited)` và `status=0/SUCCESS`; đây là bình thường vì service chỉ khởi tạo log. Việc thu thập định kỳ do `sysstat-collect.timer` thực hiện.

Nếu vừa cài `sysstat`, file chỉ có mốc `LINUX RESTART` thì chưa có mẫu RAM. Có thể tạo một mẫu để kiểm tra:

```bash
sudo systemctl start sysstat-collect.service
sar -r
```

Dữ liệu trước thời điểm cài/bật `sysstat` không thể khôi phục bằng `sar`.

### Kiểm tra VPS có bị OOM hay không

```bash
# Tìm dấu hiệu kernel hết RAM hoặc kill process trong 7 ngày gần nhất
sudo journalctl -k --since "7 days ago" |
  grep -i -E "oom|out of memory|killed process"

# Kiểm tra boot trước đó
sudo journalctl -k -b -1 |
  grep -i -E "oom|out of memory|killed"

# Xem danh sách các lần khởi động của VPS
last reboot
sudo journalctl --list-boots
```

Không có dòng OOM chỉ có nghĩa là journal chưa ghi nhận lỗi OOM; cần kết hợp với lịch sử `sar`, sự kiện Docker và log ứng dụng.

### Kiểm tra RAM và lần restart của từng container

```bash
# Mức RAM hiện tại theo container; lệnh này không lưu lịch sử
docker stats --no-stream

# Kiểm tra container có bị OOM, tự restart hoặc dừng hay không
docker inspect $(docker ps -aq) \
  --format '{{.Name}} | OOMKilled={{.State.OOMKilled}} | Restarts={{.RestartCount}} | Started={{.State.StartedAt}} | Finished={{.State.FinishedAt}}'

# Xem các sự kiện container bị dừng trong 7 ngày
docker events --since 168h --filter event=die
```

Nếu `OOMKilled=false`, `Restarts=0` và không có sự kiện `die`, hiện chưa có bằng chứng container bị kernel kill. Để xem biểu đồ RAM dài hạn cho từng container, cần cài thêm Netdata hoặc Prometheus + cAdvisor; Docker mặc định không lưu biểu đồ lịch sử.

Thoát các màn hình dạng pager của `systemctl status` hoặc `sar` bằng phím `q`.

Các mã lỗi thường gặp:

| Mã/lỗi | Ý nghĩa thường gặp |
| --- | --- |
| `400` | Payload sai về nội dung hoặc quy tắc nghiệp vụ |
| `401` | Thiếu token, token hết hạn hoặc token không hợp lệ |
| `403` | Đã xác thực nhưng không có quyền |
| `404` | Sai route, sai base path hoặc backend chưa deploy route mới |
| `409` | Xung đột version/state do hai request đồng thời |
| `422` | Payload không đúng schema của FastAPI/recover service |
| `429` | Vượt rate limit |
| `500` | Backend phát sinh exception |
| `503` | Service phụ không sẵn sàng hoặc backend không gọi được service đó |
| `504` | Proxy chờ upstream quá lâu, thường do recovery quá nặng hoặc timeout không đồng bộ |
| `ERR_CONNECTION_REFUSED` | Không có tiến trình lắng nghe tại host/port đích |
| Mixed Content | Trang HTTPS gọi API HTTP hoặc WebSocket `ws://` |
| Hydration mismatch | HTML server khác lần render đầu tiên ở client |

Kiểm tra response thực tế thay vì chỉ đọc dòng lỗi rút gọn trong Console. Một `503` ở frontend có thể bắt nguồn từ `422`, timeout hoặc lỗi kết nối giữa backend và recover service.

## API, Socket.IO và port

### Windows

```powershell
# Tiến trình đang giữ port
Get-NetTCPConnection -LocalPort 80 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,State,OwningProcess

Get-Process -Id 4

# Gọi API và giữ lại status/body
curl.exe -i http://localhost:8080/
curl.exe -i http://localhost:8080/socket.io/?EIO=4^&transport=polling
```

### Linux/VPS

```bash
sudo ss -lptn 'sport = :4000'
sudo ss -lptn 'sport = :8080'

curl -i http://127.0.0.1:8080/
curl -i 'http://127.0.0.1:8080/socket.io/?EIO=4&transport=polling'
curl -IL --max-redirs 10 https://ttlab.uit.edu.vn/chess
```

Socket.IO polling trả `200` và một `sid` chứng minh route HTTP của Socket.IO hoạt động. Việc nâng cấp WebSocket vẫn có thể thất bại nếu Nginx thiếu header `Upgrade`/`Connection` hoặc cổng HTTPS không truy cập được.

## Docker và ba service

```bash
# Trạng thái service
sudo docker compose ps

# Log backend
sudo docker compose logs --tail=200 -f ttlab-chess-app

# Log recover service
sudo docker compose logs --tail=200 -f recover-service

# Log frontend
sudo docker compose logs --tail=200 -f frontend

# CPU/RAM trực tiếp; nhấn Ctrl+C để thoát
sudo docker stats

# Biến môi trường thật bên trong container backend
sudo docker exec ttlab-chess-app printenv RECOVER_SERVICE_URL

# Kiểm tra backend gọi được recover service qua mạng Docker
sudo docker exec ttlab-chess-app \
  wget -qO- http://recover-service:8000/openapi.json

# Kiểm tra OOM và số lần restart
sudo docker inspect $(sudo docker ps -aq) \
  --format '{{.Name}} | OOMKilled={{.State.OOMKilled}} | Restarts={{.RestartCount}} | Started={{.State.StartedAt}} | Finished={{.State.FinishedAt}}'
```

`docker stats` là ảnh chụp hiện tại, không cho biết RAM của hôm qua. Để điều tra lịch sử cần log hệ thống hoặc hệ thống giám sát đã được bật trước sự cố:

```bash
sudo journalctl -k --since yesterday | grep -i -E 'oom|out of memory|killed process'
sudo journalctl --list-boots
sudo journalctl -k -b -1 | grep -i -E 'oom|out of memory|killed process'
```

Nếu cần lịch sử RAM/CPU, cài và bật `sysstat`, Prometheus/Grafana hoặc một công cụ giám sát tương đương trước khi sự cố lặp lại.

## Nginx và deployment

```bash
# Xem file site đang cấu hình
sudo nginx -T

# Tìm route/base path/redirect liên quan
sudo nginx -T | grep -n -E 'server_name|listen|location|proxy_pass|return 301|chess'

# Kiểm tra cú pháp và reload
sudo nginx -t
sudo systemctl reload nginx

# Kiểm tra frontend trực tiếp, bỏ qua Nginx
curl -IL http://127.0.0.1:4000/chess

# Kiểm tra qua Nginx/domain
curl -IL http://ttlab.uit.edu.vn/chess
```

So sánh hai kết quả `curl` giúp tách lỗi Next.js khỏi lỗi Nginx. Nếu gọi trực tiếp port `4000` đúng nhưng domain sai, nguyên nhân nằm ở proxy, redirect, base path hoặc cache deployment.

## MongoDB và dữ liệu lịch sử

Không in `MONGO_URI`, `JWT_SECRET`, token hoặc mật khẩu vào log, ảnh chụp hay tài liệu. Khi cần kiểm tra dữ liệu, chỉ truy vấn những trường cần thiết.

Các câu hỏi nên kiểm tra:

- collection có bao nhiêu document tổng cộng;
- bao nhiêu document có `deletedAt`;
- API lịch sử có lọc thùng rác, game 0 nước hoặc trạng thái nào không;
- pagination trả `items`, `total`, `page`, `pageSize` có đồng nhất không;
- index có hỗ trợ sort/filter hiện tại không.

Một số lượng trong MongoDB Compass lớn hơn số hàng trên UI không tự động là lỗi. UI có thể đang lọc document đã xóa mềm, game 0 ply, hoặc chỉ hiển thị một trang.

## Chẩn đoán RAM và CPU

CPU đạt 100% trong một khoảng ngắn khi build hoặc chạy Stockfish/recovery chưa chắc là lỗi. Cần xem:

- kéo dài bao lâu;
- chỉ một container hay toàn VPS;
- số process/thread có tăng liên tục không;
- RAM có tăng mà không giảm sau khi request kết thúc không;
- container có bị OOM kill hoặc restart không.

Các dấu hiệu đáng nghi:

- mỗi request recovery tạo thêm worker/process nhưng không giải phóng;
- cache hoặc `Map` không có giới hạn/TTL;
- listener, interval hoặc timeout không cleanup khi component unmount;
- nhiều client cùng kích hoạt Stockfish cho cùng một nguồn;
- payload FEN tạo số nhánh quá lớn và giữ toàn bộ nhánh trong RAM.

Tìm nhanh các vị trí có vòng đời cần kiểm tra:

```powershell
rg -n "setInterval|setTimeout|clearInterval|clearTimeout|addEventListener|removeEventListener|new Map|Worker\(" backend frontend
```

Kết quả tìm kiếm chỉ là danh sách nghi vấn. Một `setInterval` không phải memory leak nếu cleanup đúng trong `useEffect`; một `Map` không phải leak nếu có TTL hoặc giới hạn kích thước.

## Ví dụ: tìm nguyên nhân Match Analysis bằng 0

Triệu chứng:

- danh sách phân tích phía trên đã xuất hiện;
- lợi thế và chi tiết nước đi có dữ liệu;
- các thẻ tổng hợp và biểu đồ phía dưới vẫn bằng 0.

Quy trình:

1. Tìm component tổng hợp và nguồn prop của nó.
2. Tìm nơi Stockfish ghi kết quả.
3. So sánh hai nguồn.
4. Phát hiện `MoveAnalysisPanel` giữ kết quả mới trong local state, trong khi `MatchAnalysis` chỉ đọc `game.analysis.moves` từ database.
5. Nâng `analysisMoves` lên review page để cả hai component dùng cùng một mảng.
6. Xóa mảng cũ khi người xem đổi nguồn.
7. Chạy type-check, test phân tích và production build.

Điểm giúp tìm nhanh không phải là đọc code nhanh hơn, mà là lần theo một giá trị cụ thể qua từng ranh giới và dừng ngay tại nơi giá trị bị mất.

## Checklist trước khi kết luận đã sửa xong

- Đã tái hiện lỗi với dữ liệu cụ thể.
- Đã xác định nguồn sự thật.
- Đã chỉ ra đúng ranh giới làm mất hoặc biến đổi dữ liệu.
- Không thêm thuật toán thứ hai cho cùng một nhiệm vụ.
- Không che lỗi bằng giá trị mặc định giả.
- Đã kiểm tra empty state, dữ liệu cũ và dữ liệu đang chạy.
- Đã kiểm tra chuyển nguồn hoặc reconnect nếu tính năng có nhiều nguồn.
- Type-check, lint, test liên quan và build đều chạy.
- `git diff --check` không báo lỗi.
- Không đưa secret, token, URL riêng tư hoặc dữ liệu người dùng vào commit/log.
