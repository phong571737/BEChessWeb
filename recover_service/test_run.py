import json
import requests

# URL endpoint
URL = "http://localhost:8000/recover"

# Hardcoded FEN history
HISTORY = [
    "rnbqkbnr/pppppppp/8/8/6P1/8/PPPPPP1P/RNBQKBNR b KQkq - 0 2",
    "rnbqkbnr/pppp1ppp/8/4p3/6P1/8/PPPPPP1P/RNBQKBNR w KQkq - 0 3",
    "rnbqkbnr/pppp1ppp/8/4p3/1P4P1/8/P1PPPP1P/RNBQKBNR b KQkq - 0 3",
    "r1bqkbnr/pppp1ppp/2n5/4p3/1P4P1/8/P1PPPP1P/RNBQKBNR w KQkq - 1 4",
    "r1bqkbnr/pppp1ppp/2n5/4p3/1P4P1/2P5/P2PPP1P/RNBQKBNR b KQkq - 0 4",
    "r1bqkbnr/ppp2ppp/2n5/3pp3/1P4P1/2P5/P2PPP1P/RNBQKBNR w KQkq - 0 5",
    "r1bqkbnr/ppp2ppp/2n5/3pp3/1P4P1/N1P5/P2PPP1P/R1BQKBNR b KQkq - 1 5",
    "r2qkbnr/ppp2ppp/2n5/3pp3/1P4b1/N1P5/P2PPP1P/R1BQKBNR w KQkq - 0 6",
    "r2qkbnr/ppp2ppp/2n5/3pp3/1P4b1/N1P5/PB1PPP1P/R2QKBNR b KQkq - 1 6",
    "r2qk1nr/ppp2ppp/2nb4/3pp3/1P4b1/N1P5/PB1PPP1P/R2QKBNR w KQkq - 2 7",
    "r2qk1nr/ppp2ppp/2nb4/3pp3/1P4b1/N1P5/PB1PPPBP/R2QK1NR b KQkq - 3 7",
    "r2qk2r/ppp1nppp/2nb4/3pp3/1P4b1/N1P5/PB1PPPBP/R2QK1NR w KQkq - 4 8",
    "r2qk2r/ppp1nppp/2nb4/3pp3/1P1P2b1/N1P5/PB2PPBP/R2QK1NR b KQkq - 0 8",
    "r2qk2r/ppp1nppp/2nb4/3p4/1P4b1/N1P5/PB2PPBP/R2QK1NR w KQkq - 0 9",
    "r2q1rk1/ppp1nppp/2nb4/3p4/1P1P2b1/N7/PB2PPBP/R2QK1NR b KQkq - 0 9",
    "r2q1rk1/ppp1nppp/2nb4/3p4/1P1P2b1/N7/PB2PPBP/R2QK1NR w KQkq - 1 10",
    "r2q1rk1/ppp1nppp/2nb4/3B4/1P1P2b1/N7/PB2PP1P/R2QK1NR b KQkq - 0 10",
    "r4rk1/pppqnppp/2nb4/3B4/1P1P2b1/N7/PB2PP1P/R2QK1NR w KQkq - 1 11",
    "r4rk1/pppqnppp/2nb4/1P1B4/3P2b1/N7/PB2PP1P/R2QK1NR b KQkq - 0 11",
    "r4rk1/ppp1nppp/2nb4/1P1B1q2/3P2b1/N7/PB2PP1P/R2QK1NR w KQkq - 1 12",
    "r4rk1/ppp1nppp/2Bb4/1P3q2/3P2b1/N7/PB2PP1P/R2QK1NR b KQkq - 0 12",
    "r4rk1/p1p1nppp/3b4/1P3q2/3P2b1/N7/PB2PP1P/R2QK1NR w KQkq - 0 13",
    "r4rk1/p1p1nppp/2Pb4/5q2/3P2b1/N7/PB2PP1P/R2QK1NR b KQkq - 0 13",
    "r4rk1/p1p2ppp/2nb4/5q2/3P2b1/N7/PB2PP1P/R2QK1NR w KQkq - 0 14",
    "r4rk1/p1p2ppp/2nb4/5q2/3P2b1/N4P2/PB2P2P/R2QK1NR b KQkq - 0 14",
    "r4rk1/p1p2ppp/2nb4/3q4/3P2b1/N4P2/PB2P2P/R2QK1NR w KQkq - 1 15",
    "r4rk1/p1p2ppp/2nb4/3q4/3P2b1/N2Q1P2/PB2P2P/R3K1NR b KQkq - 2 15",
    "r4rk1/p1pb1ppp/2nb4/3q4/3P4/N2Q1P2/PB2P2P/R3K1NR w KQkq - 3 16",
    "r4rk1/p1pb1ppp/2nb4/3q4/3PP3/N2Q1P2/PB5P/R3K1NR b KQkq - 0 16",
    "r4rk1/p1pb1ppp/2nb4/q7/3PP3/N2Q1P2/PB5P/R3K1NR w KQkq - 1 17",
    "r4rk1/p1pb1ppp/2nb4/q7/3PP3/N2Q1P2/PB2K2P/R5NR b kq - 2 17",
    "r4rk1/p1pb1ppp/3b4/q3n3/3PP3/N2Q1P2/PB2K2P/R5NR w kq - 3 18",
    "r4rk1/p1pb1ppp/3b4/q3P3/4P3/N2Q1P2/PB2K2P/R5NR b kq - 0 18",
    "r4rk1/p1pb1ppp/8/q3P3/4P3/b2Q1P2/PB2K2P/R5NR w kq - 0 19",
    "r4rk1/p1pb1ppp/8/q3P3/4P3/B2Q1P2/P3K2P/R5NR b kq - 0 19",
    "r4rk1/p1p2ppp/8/qb2P3/4P3/B2Q1P2/P3K2P/R5NR w kq - 1 20",
    "r4rk1/p1p2ppp/8/q3P3/4P3/B2bKP2/P6P/R5NR b kq - 2 20",
    "r4rk1/p1p2ppp/8/q3P3/4P3/B2bKP2/P6P/R5NR w kq - 3 21",
    "r4rk1/p1p2ppp/8/q3P3/4P3/B2K1P2/P6P/R5NR b - - 21 1",
    "r4rk1/p1p2ppp/8/4P3/4P3/q2K1P2/P6P/R5NR w - - 22 1",
    "r4rk1/p1p2ppp/8/4P3/4P3/q4P2/P1K4P/R5NR b - - 22 1",
    "r3r1k1/p1p2ppp/8/4P3/4P3/q4P2/P1K4P/R5NR w - - 23 1",
    "r3r1k1/p1p2ppp/8/4P3/4P3/q4P2/P1K4P/1R4NR b - - 23 1",
    "r5k1/p1p2ppp/8/4r3/4P3/q4P2/P1K4P/1R4NR w - - 24 1",
    "r5k1/pRp2ppp/8/4r3/4P3/q4P2/P1K4P/6NR b - - 24 1",
    "r5k1/pRp2ppp/8/2r5/4P3/q4P2/P1K4P/6NR w - - 25 1",
    "r5k1/pRp2ppp/8/2r5/4P3/q4P2/P2K3P/6NR b - - 25 1",
    "r5k1/pRp2ppp/8/2r5/4P3/5P2/P2K3P/2q3NR w - - 26 1",
    "r5k1/pRp2ppp/8/2r5/4P3/3K1P2/P6P/2q3NR b - - 26 1",
    "r5k1/pRp2ppp/8/2r5/4P3/2qK1P2/P6P/6NR w - - 27 1",
    "r5k1/pRp2ppp/8/2r5/4P3/2q2P2/P6P/6NR b  - 0 27",
    "4r1k1/pRp2ppp/8/2r5/4P3/2q2P2/P3K2P/6NR w  - 1 28",
]


def test_recover_api():
    try:
        payload = {"fenHistory": HISTORY, "maxBranches": 2000}
        print("Đang gửi dữ liệu tới API...")
        response = requests.post(URL, json=payload, timeout=30)

        print(f"Status Code: {response.status_code}")
        if response.ok:
            data = response.json()

            # Ghi toàn bộ dữ liệu nhận được vào file result.json
            output_file = "result.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4, ensure_ascii=False)

            print(f"✓ Đã lưu toàn bộ kết quả thành công vào file: {output_file}")
            print("\nTóm tắt kết quả:")
            print(" - fullyRecovered:", data.get("fullyRecovered"))
            print(" - longestRecoveredPly:", data.get("longestRecoveredPly"))
            print(" - finalMoveLists count:", len(data.get("finalMoveLists", [])))
        else:
            print("API trả về lỗi:")
            print(response.text)

    except requests.exceptions.ConnectionError:
        print(
            "Lỗi: Không thể kết nối tới server. "
            "Hãy chắc chắn FastAPI server ở http://localhost:8000 đang chạy."
        )
    except requests.exceptions.Timeout:
        print("Lỗi: Request bị quá thời gian chờ (timeout).")
    except Exception as e:
        print(f"Lỗi không xác định: {e}")


if __name__ == "__main__":
    test_recover_api()
