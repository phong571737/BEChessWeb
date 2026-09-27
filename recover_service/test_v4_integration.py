import io
import unittest

import chess
import chess.pgn
from fastapi.testclient import TestClient

from recover_service.app.main import app
from recover_service.app.v4_runner import build_line, build_response, prepare_history, run_recovery, RecoveryError


def history(moves, start=chess.STARTING_FEN):
    board = chess.Board(start)
    result = []
    for move in moves:
        board.push_uci(move)
        result.append(board.fen())
    return result


class V4IntegrationTests(unittest.TestCase):
    def test_initial_position_duplicates_and_pgn(self):
        fens = history(["e2e4", "e7e5", "g1f3"])
        result = run_recovery([chess.STARTING_FEN, fens[0], fens[0], *fens[1:]], depth=1)
        self.assertTrue(result["fullyRecovered"])
        self.assertEqual(result["bestMoveLists"][0]["uciMoves"], ["e2e4", "e7e5", "g1f3"])
        self.assertEqual(result["bestMoveLists"][0]["steps"][1]["originalPly"], 4)
        game = chess.pgn.read_game(io.StringIO(result["bestPgn"]))
        self.assertEqual(game.end().board().board_fen(), chess.Board(fens[-1]).board_fen())

    def test_padding_scores_and_observation_mapping(self):
        fens = history(["e2e4", "e7e5", "g1f3"])
        result = run_recovery([fens[-1]], depth=1)
        self.assertTrue(result["fullyRecovered"])
        for line in result["bestMoveLists"]:
            self.assertEqual(line["paddingIndices"], [0, 1, 2])
            self.assertEqual(len(line["paddingScores"]), 3)
            self.assertEqual(line["scoreSides"], ["w", "b", "w"])
            self.assertEqual([s["originalPly"] for s in line["steps"]], [None, None, 1])

    def test_partial_keeps_continuous_prefix(self):
        result = run_recovery([history(["e2e4"])[0], chess.STARTING_FEN], missing=0, depth=1)
        self.assertFalse(result["fullyRecovered"])
        self.assertEqual(result["longestRecoveredPly"], 1)
        self.assertEqual(result["failedPlies"], [2])
        self.assertEqual(result["bestMoveLists"][0]["uciMoves"], ["e2e4"])

    def test_black_start_and_numbering(self):
        start = chess.STARTING_FEN.replace(" w ", " b ").replace(" 0 1", " 0 12")
        result = run_recovery(history(["e7e5"], start), start=start, depth=1)
        self.assertIn("12... e5", result["bestPgn"])

    def test_empty_prefix_and_duplicate_only(self):
        result = run_recovery([chess.STARTING_FEN], depth=1)
        self.assertTrue(result["fullyRecovered"])
        self.assertEqual(result["longestRecoveredPly"], 1)
        self.assertEqual(result["bestMoveLists"][0]["uciMoves"], [])

    def test_branch_limit(self):
        fens = history(["e2e4"])
        with self.assertRaises(RecoveryError) as caught:
            build_response({(): [(["e2e4"], []), (["e2e4"], [])]}, [chess.STARTING_FEN, *fens], [[0]], [], 1, 1, {}, 2, 1, 1)
        self.assertEqual(caught.exception.code, "RECOVERY_BRANCH_LIMIT")

    def test_api_validation_and_version(self):
        with TestClient(app) as client:
            self.assertEqual(client.get("/health").json()["engineVersion"], "recover_service_v4")
            for body in ({"fenHistory": []}, {"fenHistory": ["bad"]}, {"fenHistory": [chess.STARTING_FEN], "stockfishDepth": 21}):
                self.assertEqual(client.post("/recover", json=body).status_code, 400)

    def test_deadline(self):
        with self.assertRaises(RecoveryError) as caught:
            run_recovery(history(["e2e4"]), timeout_seconds=0.001)
        self.assertEqual(caught.exception.code, "RECOVERY_TIMEOUT")

    def test_special_moves(self):
        cases = [
            ("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1g1"),
            ("k7/4P3/8/8/8/8/8/7K w - - 0 1", "e7e8n"),
            ("k7/8/8/3pP3/8/8/8/7K w - d6 0 1", "e5d6"),
        ]
        for start, move in cases:
            with self.subTest(move=move):
                result = run_recovery(history([move], start), start=start, missing=0, depth=1)
                self.assertTrue(result["fullyRecovered"])
                self.assertEqual(result["bestMoveLists"][0]["uciMoves"], [move])

    def test_500_observations(self):
        moves = ["g1f3", "g8f6", "f3g1", "f6g8"] * 125
        result = run_recovery(history(moves), depth=1)
        self.assertTrue(result["fullyRecovered"])
        self.assertEqual(len(result["bestMoveLists"][0]["uciMoves"]), 500)


if __name__ == "__main__":
    unittest.main()
