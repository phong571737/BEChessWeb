import json
import requests

# URL endpoint
URL = "http://localhost:8000/recover"

# Hardcoded FEN history (from example.txt)
HISTORY = [
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1",
    "rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2",
    "rnbqkb1r/pppppppp/5n2/8/3P4/6P1/PPP1PP1P/RNBQKBNR b KQkq - 0 2",
    "rnbqkb1r/pppppp1p/5np1/8/3P4/6P1/PPP1PP1P/RNBQKBNR w KQkq - 0 3",
    "rnbqkb1r/pppppp1p/5np1/8/3P4/6P1/PPP1PPBP/RNBQK1NR b KQkq - 1 3",
    "rnbqk2r/ppppppbp/5np1/8/3P4/6P1/PPP1PPBP/RNBQK1NR w KQkq - 2 4",
    "rnbqk2r/ppppppbp/5np1/8/3P4/5NP1/PPP1PPBP/RNBQK2R b KQkq - 3 4",
    "rnbq1rk1/ppppppbp/5np1/8/3P4/5NP1/PPP1PPBP/RNBQK2R w KQ - 4 5",
    "rnbq1rk1/ppppppbp/5np1/6B1/3P4/5NP1/PPP1PPBP/RN1QK2R b KQ - 5 5",
    "rnbq1rk1/ppp1ppbp/3p1np1/6B1/3P4/5NP1/PPP1PPBP/RN1QK2R w KQ - 0 6",
    "rnbq1rk1/ppp1ppbp/3p1np1/6B1/3P4/2N2NP1/PPP1PPBP/R2QK2R b KQ - 1 6",
    "rnbq1rk1/pp2ppbp/3p1np1/2p3B1/3P4/2N2NP1/PPP1PPBP/R2QK2R w KQ - 0 7",
    "rnbq1rk1/pp2ppbp/3p1np1/2p3B1/3P4/2NQ1NP1/PPP1PPBP/R3K2R b KQ - 1 7",
    "r1bq1rk1/pp2ppbp/2np1np1/2p3B1/3P4/2NQ1NP1/PPP1PPBP/R3K2R w KQ - 2 8",
    "r1bq1rk1/pp2ppbp/2np1np1/2p3B1/3P4/2NQ1NP1/PPP2PBP/R3K2R b KQ - 0 8",
    "r1bq1rk1/pp2ppbp/3p1np1/2p3B1/1n1P4/2NQ1NP1/PPP2PBP/R3K2R w KQ - 1 9",
    "r1bq1rk1/pp2ppbp/3p1np1/2p3B1/1n1P4/2N2NP1/PPPQ1PBP/R3K2R b KQ - 2 9",
    "r1bq1rk1/pp2ppbp/2np1np1/2p3B1/3P4/2N2NP1/PPPQ1PBP/R3K2R w KQ - 3 10",
    "r1bq1rk1/pp2ppbp/2np1np1/2p3B1/3P4/2N2NP1/PPPQ1PBP/2KR3R b - 4 10",
    "r1bq1rk1/1p2ppbp/p1np1np1/2p3B1/3P4/2N2NP1/PPPQ1PBP/2KR3R w - 0 11",
    "r1bq1rk1/1p2ppbp/p1np1np1/2p3B1/3P3P/2N2NP1/PPPQ1PB1/2KR3R b - 0 11",
    "r1bq1rk1/4ppbp/p1np1np1/2p3B1/3P3P/2N2NP1/PPPQ1PB1/2KR3R w - 0 12",
    "r1bq1rk1/4ppbp/p1np1Bp1/2p5/3P3P/2N2NP1/PPPQ1PB1/2KR3R b - 0 12",
    "r1bq1rk1/4pp1p/p1np1bp1/2p5/3P3P/2N2NP1/PPPQ1PB1/2KR3R w - 0 13",
    "r1bq1rk1/4pp1p/p1np1bp1/2p4P/3P4/2N2NP1/PPPQ1PB1/2KR3R b - 0 13",
    "r1bq1rk1/4ppbp/p1np2p1/2p4P/3P4/2N2NP1/PPPQ1PB1/2KR3R w - 1 14",
    "r1bq1rk1/4ppbp/p1np2p1/2p3NP/3P4/2N3P1/PPPQ1PB1/2KR3R b - 2 14",
    "r1bq1rk1/5pbp/p1npp1p1/2p3NP/3P4/2N3P1/PPPQ1PB1/2KR3R w - 0 15",
    "r1bq1rk1/5pbp/p1Bpp1p1/2p3NP/3P4/2N3P1/PPPQ1P2/2KR3R b - 0 15",
    "r1b2rk1/5pbp/p1Bpp1p1/2p3qP/3P4/2N3P1/PPPQ1P2/2KR3R w - 0 16",
    "r1b2rk1/5pbp/p1Bpp1P1/2p3q1/3P4/2N3P1/PPPQ1P2/2KR3R b - 0 16",
    "1rb2rk1/5pbp/p1Bpp1P1/2p3q1/3P4/2N3P1/PPPQ1P2/2KR3R w - 1 17",
    "1rb2rk1/5Pbp/p1Bpp3/2p3q1/3P4/2N3P1/PPPQ1P2/2KR3R b - 0 17",
    "1rb3k1/5rbp/p1Bpp3/2p3q1/3P4/2N3P1/PPPQ1P2/2KR3R w - 0 18",
    "1rb3k1/5rbp/p1Bpp3/2p3q1/3P1P2/2N3P1/PPPQ4/2KR3R b - 0 18",
    "1rb3k1/5rbp/p1Bpp3/2p5/3P1P2/2N3q1/PPP5/2KR3R w - 1 19",
    "1rb3k1/5rbp/p1Bpp3/2p5/3P1P2/2N3q1/PPP4Q/2KR3R b - 2 19",
    "1rb3k1/5rbp/p1Bpp3/2p5/3P1P2/2N5/PPP5/2KR4 w - 3 20",
    "1rb3k1/5rbp/p1Bpp3/2p5/3P1P2/2N5/PPP4R/2KR4 b - 4 20",
    "1rb3k1/5rbp/p1Bpp3/8/3p1P2/2N5/PPP4R/2KR4 w - 0 21",
    "1rb3k1/5rbp/p1Bpp3/8/3P1P2/2N5/PPP4R/2KR4 b - 1 21",
    "1r4k1/1b3rbp/p1Bpp3/8/3P1P2/2N5/PPP4R/2KR4 w - 2 22",
    "1r4k1/1B3rbp/p2pp3/8/3P1P2/2N5/PPP4R/2KR4 b - 0 22",
    "6k1/1r3rbp/p2pp3/8/3P1P2/2N5/PPP4R/2KR4 w - 0 23",
    "6k1/1r3rbp/p2pp3/3P4/5P2/2N5/PPP4R/2KR4 b - 0 23",
    "6k1/1r3rbp/p2p4/3p4/5P2/2N5/PPP4R/2KR4 w - 0 24",
    "6k1/1r3rbp/p2p4/3R4/5P2/2N5/PPP4R/2K5 b - 0 24",
    "6k1/1r4bp/p2p4/3R4/5r2/2N5/PPP4R/2K5 w - 0 25",
    "6k1/1r4bp/p2R4/8/5r2/2N5/PPP4R/2K5 b - 0 25",
    "6k1/1r4bp/p2R4/8/8/2N5/PPP4R/2K2r2 w - 1 26",
    "6k1/1r4bp/p7/8/8/2N5/PPP4R/2KR1r2 b - 2 26",
    "6k1/5rbp/p7/8/8/2N5/PPP4R/2KR1r2 w - 3 27",
    "6k1/5rbp/p7/8/8/2N5/PPP4R/2K2R2 b - 0 27",
    "6k1/6bp/p7/8/8/2N5/PPP4R/2K2r2 w - 0 28",
    "6k1/6bp/p7/8/8/8/PPP4R/2KN1r2 b - 1 28",
    "6k1/7p/p7/4b3/8/8/PPP4R/2KN1r2 w - 2 29",
    "6k1/7p/p7/4b3/8/8/PPP3R1/2KN1r2 b - 3 29",
    "7k/7p/p7/4b3/8/8/PPP3R1/2KN1r2 w - 4 30",
    "7k/7p/p7/4b3/8/8/PPP1R3/2KN1r2 b - 5 30",
    "7k/7p/p7/8/5b2/8/PPP1R3/2KN1r2 w - 6 31",
    "7k/7p/p7/8/5b2/8/PPPR4/2KN1r2 b - 7 31",
    "7k/7p/p7/8/8/8/PPP5/2KN1r2 w - 8 32",
    "7k/7p/p7/8/8/8/PPPK4/3N1r2 b - 9 32",
    "7k/8/p7/7p/8/8/PPPK4/3N1r2 w - 0 33",
    "7k/8/p7/7p/8/8/PPPK4/5r2 b - 0 33",
    "5r1k/8/p7/7p/8/8/PPPK4/8 w - 1 34",
    "5r1k/8/p7/7p/8/3K4/PPP5/8 b - 2 34",
    "5r1k/8/p7/8/7p/3K4/PPP5/8 w - 0 35",
    "5r1k/8/p7/8/7p/3K4/PPP3N1/8 b - 1 35",
    "5r1k/8/p7/8/8/3K3p/PPP3N1/8 w - 0 36",
    "5r1k/8/p7/1p6/8/3K3p/PPP5/4N3 b - 1 36",
    "5r1k/8/p7/1p6/8/3K4/PPP4p/4N3 w - 0 37",
    "5r1k/8/p7/1p6/2P5/3K4/PP5p/4N3 b - 0 37",
    "5r1k/8/p7/8/2p5/3K4/PP5p/4N3 w - 0 38",
    "5r1k/8/p7/8/2K5/8/PP5p/4Nr2 w - 0 38",
    "7k/8/p7/8/2K5/8/PP5p/4Nr2 w - 1 39",
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
        print("Lỗi: Không thể kết nối tới server. Hãy chắc chắn FastAPI server ở http://localhost:8000 đang chạy.")
    except requests.exceptions.Timeout:
        print("Lỗi: Request bị quá thời gian chờ (timeout).")
    except Exception as e:
        print(f"Lỗi không xác định: {e}")


if __name__ == "__main__":
    test_recover_api()