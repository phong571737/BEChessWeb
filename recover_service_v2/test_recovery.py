from __future__ import annotations

import unittest

import chess

from recovery import position, preprocess, recover


class LeadingStartFenRegressionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.fens = [
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR b KQkq c6 0 1",
            "rnbqkbnr/pp1ppppp/8/2p5/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 1 1",
            "rnbqkbnr/pp1ppp1p/6p1/2p5/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 0 2",
        ]

    def test_preprocess_drops_leading_snapshot_equal_to_start_fen(self) -> None:
        viewed_fens = preprocess(self.fens, chess.STARTING_FEN)

        self.assertEqual(len(viewed_fens), 3)
        self.assertEqual(position(viewed_fens[0]), position(self.fens[1]))

    def test_recovers_two_moves_in_first_changed_snapshot(self) -> None:
        result = recover(self.fens)

        self.assertTrue(result["fullyRecovered"])
        self.assertTrue(result["continuedToEnd"])
        self.assertEqual(result["skippedXIndexes"], [])
        self.assertEqual(
            result["final_move_lists"],
            [["e2e4", "c7c5", "b1c3", "g7g6"]],
        )


if __name__ == "__main__":
    unittest.main()
