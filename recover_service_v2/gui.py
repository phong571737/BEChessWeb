from __future__ import annotations

import json
import re
import sys

import chess
from PyQt6.QtWidgets import (
    QApplication,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

try:
    from .recovery import recover
except ImportError:
    from recovery import recover


SAMPLE = """1. rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1
2. rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"""


def parse_fens(text: str) -> list[str]:
    fens = []
    for line in text.splitlines():
        line = re.sub(r"^\s*\d+\s*\.\s*", "", line).strip()
        if line and not line.startswith("#"):
            fens.append(line)
    return fens


class Window(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Recovery V2 Test")
        self.resize(900, 650)

        self.start_fen = QLineEdit(chess.STARTING_FEN)
        self.input_text = QPlainTextEdit(SAMPLE)
        self.output_text = QPlainTextEdit()
        self.output_text.setReadOnly(True)

        button = QPushButton("Recover")
        button.clicked.connect(self.run_recovery)

        layout = QVBoxLayout()
        layout.addWidget(QLabel("Start FEN"))
        layout.addWidget(self.start_fen)
        layout.addWidget(QLabel("FEN history - mỗi dòng có thể bắt đầu bằng 1., 2., ..."))
        layout.addWidget(self.input_text)
        layout.addWidget(button)
        layout.addWidget(QLabel("Result"))
        layout.addWidget(self.output_text)

        container = QWidget()
        container.setLayout(layout)
        self.setCentralWidget(container)

    def run_recovery(self) -> None:
        try:
            fens = parse_fens(self.input_text.toPlainText())
            if not fens:
                raise ValueError("Không có FEN nào trong input")
            result = recover(fens, self.start_fen.text().strip())
            self.output_text.setPlainText(
                json.dumps(result, indent=2, ensure_ascii=False)
            )
        except Exception as exc:
            QMessageBox.critical(self, "Error", str(exc))


def main() -> None:
    app = QApplication(sys.argv)
    window = Window()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
