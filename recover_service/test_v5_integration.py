"""Web adapter contract for the first V5 path and unresolved X."""

import unittest

import chess

from recover_service.app.v5_runner import _build_response, prepare_history
from recover_service_v5.pipeline import run_pipeline


class V5IntegrationTests(unittest.TestCase):
    def test_first_path_is_displayed(self):
        board = chess.Board()
        board.push_san("e4")
        history = [board.fen()]
        fens, groups, leading = prepare_history(history, None)
        first = run_pipeline(fens)["results"][0]["moves"]
        response = _build_response(first, fens, groups, leading, len(history), {}, 2)
        self.assertEqual(response["schemaVersion"], 5)
        self.assertEqual(response["bestMoveLists"][0]["uciMoves"], first)
        self.assertTrue(response["fullyRecovered"])
        self.assertIn("e4", response["pgn"])

    def test_unresolved_x_is_preserved_but_not_written_as_pgn_move(self):
        before = chess.STARTING_FEN
        impossible = "8/8/8/8/8/8/8/4K2k w - - 0 1"
        response = _build_response(["X"], [before, impossible], [[0]], [], 1, {}, 2)
        line = response["bestMoveLists"][0]
        self.assertEqual(line["uciMoves"], ["X"])
        self.assertEqual(line["sanMoves"], ["X"])
        self.assertEqual(line["assumedFens"], [impossible])
        self.assertEqual(response["failedPlies"], [1])
        self.assertFalse(response["fullyRecovered"])
        self.assertNotIn(" X", response["pgn"])


if __name__ == "__main__":
    unittest.main()
