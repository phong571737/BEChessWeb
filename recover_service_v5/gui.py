"""Desktop test UI for the FEN recovery pipeline.

This module calls :func:`pipeline.run_pipeline` directly.  It does not start or
send requests to the FastAPI application.
"""

from __future__ import annotations

import re
import sys
import time
import traceback
from dataclasses import dataclass
import chess
from PyQt6.QtCore import QObject, QRectF, Qt, QThread, pyqtSignal, pyqtSlot
from PyQt6.QtGui import QColor, QCloseEvent, QFont, QFontDatabase, QPainter, QPen
from PyQt6.QtWidgets import (
    QApplication,
    QDialog,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QSpinBox,
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from FEN_utils import deduplicate, infer_initial_move_sequence, normalize_fen_turns
from pipeline import PipelineResult, run_pipeline


SAMPLE_FENS = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
]

NUMBERED_LINE_PREFIX = re.compile(r"^\s*\d+\s*[.):]\s*")
CASTLING_FIELD = re.compile(r"(?:[KQkq]+|-)")


@dataclass(frozen=True)
class PathStep:
    """One visualizable move between two board states."""

    before_fen: str
    move_uci: str
    move_san: str
    after_fen: str
    resolved: bool = True


def _same_position(first_fen: str, second_fen: str) -> bool:
    return first_fen.split()[0] == second_fen.split()[0]


def _push_visual_move(before_fen: str, move_uci: str) -> PathStep | None:
    """Replay one move, correcting a stale sensor side-to-move when possible."""
    try:
        board = chess.Board(before_fen)
        move = chess.Move.from_uci(move_uci)
    except ValueError:
        return None

    moving_piece = board.piece_at(move.from_square)
    if moving_piece is None:
        return None
    board.turn = moving_piece.color
    if move not in board.legal_moves:
        return None

    normalized_before = board.fen()
    san = board.san(move)
    board.push(move)
    return PathStep(normalized_before, move_uci, san, board.fen())


def build_path_steps(observed_fens: list[str], moves: list[str]) -> list[PathStep]:
    """Build a complete trace while retaining observed FENs as anchors."""
    if not observed_fens:
        return []

    anchors = deduplicate(observed_fens)
    initial_moves = infer_initial_move_sequence(anchors)
    anchors = normalize_fen_turns(anchors, initial_moves)
    steps: list[PathStep] = []
    cursor = 0

    for index, original_move in enumerate(initial_moves):
        if cursor >= len(moves):
            break
        before_anchor = anchors[index]
        after_anchor = anchors[index + 1]

        if original_move != "X":
            move_uci = moves[cursor]
            replayed = _push_visual_move(before_anchor, move_uci)
            steps.append(
                replayed
                if replayed is not None
                else PathStep(before_anchor, move_uci, "?", after_anchor, False)
            )
            cursor += 1
            continue

        if moves[cursor] == "X":
            steps.append(PathStep(before_anchor, "X", "?", after_anchor, False))
            cursor += 1
            continue

        segment: list[PathStep] = []
        current_fen = before_anchor
        while cursor < len(moves):
            replayed = _push_visual_move(current_fen, moves[cursor])
            if replayed is None:
                break
            segment.append(replayed)
            current_fen = replayed.after_fen
            cursor += 1
            if _same_position(current_fen, after_anchor):
                break

        steps.extend(segment)
        if not segment:
            steps.append(PathStep(before_anchor, moves[cursor], "?", after_anchor, False))
            cursor += 1

    current_fen = steps[-1].after_fen if steps else anchors[0]
    while cursor < len(moves):
        move_uci = moves[cursor]
        replayed = _push_visual_move(current_fen, move_uci)
        if replayed is None:
            steps.append(PathStep(current_fen, move_uci, "?", current_fen, False))
        else:
            steps.append(replayed)
            current_fen = replayed.after_fen
        cursor += 1
    return steps


class ChessBoardWidget(QWidget):
    """Small dependency-free chessboard renderer for a FEN position."""

    PIECES = {
        "K": "♔", "Q": "♕", "R": "♖", "B": "♗", "N": "♘", "P": "♙",
        "k": "♚", "q": "♛", "r": "♜", "b": "♝", "n": "♞", "p": "♟",
    }

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._board = chess.Board()
        self.setMinimumSize(300, 300)

    def set_fen(self, fen: str) -> None:
        try:
            self._board = chess.Board(fen)
        except ValueError:
            self._board = chess.Board.empty()
        self.update()

    def paintEvent(self, _event: object) -> None:
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        side = min(self.width(), self.height())
        square = side / 8
        left = (self.width() - side) / 2
        top = (self.height() - side) / 2
        light, dark = QColor("#f0d9b5"), QColor("#b58863")
        painter.setFont(QFont("Segoe UI Symbol", max(14, int(square * 0.66))))

        for display_rank in range(8):
            rank = 7 - display_rank
            for file_index in range(8):
                rect = QRectF(left + file_index * square, top + display_rank * square, square, square)
                painter.fillRect(rect, light if (file_index + rank) % 2 else dark)
                piece = self._board.piece_at(chess.square(file_index, rank))
                if piece is not None:
                    painter.setPen(QPen(QColor("#111")))
                    painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, self.PIECES[piece.symbol()])


class PathVisualizerDialog(QDialog):
    """Inspect a ranked path as move-by-move FEN transitions."""

    def __init__(self, rank: object, moves: list[str], observed_fens: list[str], parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.steps = build_path_steps(observed_fens, moves)
        self.setWindowTitle(f"Visualize path #{rank}")
        self.resize(1180, 760)

        layout = QVBoxLayout(self)
        layout.addWidget(QLabel("Full path (UCI):"))
        full_path = QPlainTextEdit(" ".join(moves))
        full_path.setReadOnly(True)
        full_path.setMaximumHeight(72)
        full_path.setLineWrapMode(QPlainTextEdit.LineWrapMode.WidgetWidth)
        full_path.setFont(QFontDatabase.systemFont(QFontDatabase.SystemFont.FixedFont))
        layout.addWidget(full_path)

        self.transition_table = QTableWidget(len(self.steps), 3)
        self.transition_table.setHorizontalHeaderLabels(["Step", "Move (UCI)", "Move (SAN)"])
        self.transition_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.transition_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.transition_table.verticalHeader().setVisible(False)
        header = self.transition_table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        for row, step in enumerate(self.steps):
            for column, value in enumerate((str(row + 1), step.move_uci, step.move_san)):
                self.transition_table.setItem(row, column, QTableWidgetItem(value))
        self.transition_table.itemSelectionChanged.connect(self._show_selected_step)
        layout.addWidget(self.transition_table, 1)

        boards = QHBoxLayout()
        before_column = QVBoxLayout()
        before_column.addWidget(QLabel("FEN before"))
        self.before_fen = QPlainTextEdit()
        self.before_fen.setReadOnly(True)
        self.before_fen.setMaximumHeight(60)
        before_column.addWidget(self.before_fen)
        self.before_board = ChessBoardWidget()
        before_column.addWidget(self.before_board, 1)
        boards.addLayout(before_column, 1)

        after_column = QVBoxLayout()
        self.transition_label = QLabel("Select a transition")
        self.transition_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.transition_label.setStyleSheet("font-size: 16px; font-weight: 600;")
        after_column.addWidget(self.transition_label)
        self.after_fen = QPlainTextEdit()
        self.after_fen.setReadOnly(True)
        self.after_fen.setMaximumHeight(60)
        after_column.addWidget(self.after_fen)
        self.after_board = ChessBoardWidget()
        after_column.addWidget(self.after_board, 1)
        boards.addLayout(after_column, 1)
        layout.addLayout(boards, 3)

        close_button = QPushButton("Close")
        close_button.clicked.connect(self.accept)
        footer = QHBoxLayout()
        footer.addStretch()
        footer.addWidget(close_button)
        layout.addLayout(footer)
        if self.steps:
            self.transition_table.selectRow(0)

    def _show_selected_step(self) -> None:
        row = self.transition_table.currentRow()
        if row < 0 or row >= len(self.steps):
            return
        step = self.steps[row]
        self.before_fen.setPlainText(step.before_fen)
        self.after_fen.setPlainText(step.after_fen)
        self.before_board.set_fen(step.before_fen)
        self.after_board.set_fen(step.after_fen)
        status = "unresolved" if not step.resolved else step.move_san
        self.transition_label.setText(f"{step.move_uci}  →  {status}   (FEN before → FEN after)")


def normalize_fen_lines(text: str) -> tuple[list[str], int]:
    """Normalize pasted FEN lines and report missing en-passant repairs.

    A five-field row shaped as ``board turn castling halfmove fullmove`` is
    treated as a six-field FEN with a missing en-passant field. Other malformed
    rows are left untouched so that normal FEN validation can report them.
    """
    normalized: list[str] = []
    repaired_en_passant = 0
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        line = NUMBERED_LINE_PREFIX.sub("", line, count=1).strip()
        if not line:
            continue

        fields = line.split()
        if (
            len(fields) == 5
            and fields[1] in {"w", "b"}
            and CASTLING_FIELD.fullmatch(fields[2]) is not None
            and fields[3].isdigit()
            and fields[4].isdigit()
        ):
            fields.insert(3, "-")
            repaired_en_passant += 1

        normalized.append(" ".join(fields))
    return normalized, repaired_en_passant


def moves_to_san(start_fen: str, moves: list[str]) -> str:
    """Convert a recovered UCI path to SAN for easier visual inspection."""
    board = chess.Board(start_fen)
    san_moves: list[str] = []
    for index, uci in enumerate(moves):
        if uci == "X":
            return "(không khả dụng)"
        try:
            move = chess.Move.from_uci(uci)
        except ValueError:
            return "(không khả dụng)"
        moving_piece = board.piece_at(move.from_square)
        if index == 0 and moving_piece is not None:
            board.turn = moving_piece.color
        if move not in board.legal_moves:
            return "(không khả dụng)"
        san_moves.append(board.san(move))
        board.push(move)
    return " ".join(san_moves)


class PipelineWorker(QObject):
    succeeded = pyqtSignal(object, float)
    failed = pyqtSignal(str, str, float)
    finished = pyqtSignal()

    def __init__(
        self,
        fens: list[str],
        max_missing_fens: int,
    ) -> None:
        super().__init__()
        self.fens = fens
        self.max_missing_fens = max_missing_fens

    @pyqtSlot()
    def run(self) -> None:
        started = time.perf_counter()
        try:
            result = run_pipeline(
                raw_fens=self.fens,
                max_missing_fens=self.max_missing_fens,
            )
        except Exception as exc:  # Surface service failures in the test UI.
            self.failed.emit(
                str(exc) or type(exc).__name__,
                traceback.format_exc(),
                time.perf_counter() - started,
            )
        else:
            self.succeeded.emit(
                result, time.perf_counter() - started,
            )
        finally:
            self.finished.emit()


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self._thread: QThread | None = None
        self._worker: PipelineWorker | None = None
        self._start_fen = ""
        self._input_fens: list[str] = []
        self._normalization_count = 0
        self._run_engine_label = "Python-chess Bruteforce"
        self._result_paths: list[tuple[object, list[str]]] = []

        self.setWindowTitle("Chess FEN Recovery — Direct Pipeline Tester")
        self.resize(1180, 760)
        self._build_ui()
        self._load_sample()

    def _build_ui(self) -> None:
        root = QWidget()
        self.setCentralWidget(root)
        page = QVBoxLayout(root)

        title = QLabel("Chess FEN Recovery")
        title.setStyleSheet("font-size: 22px; font-weight: 600;")
        subtitle = QLabel("Gọi trực tiếp pipeline.run_pipeline — không sử dụng API/HTTP")
        subtitle.setStyleSheet("color: #666;")
        page.addWidget(title)
        page.addWidget(subtitle)

        splitter = QSplitter()
        splitter.setChildrenCollapsible(False)
        page.addWidget(splitter, 1)

        input_group = QGroupBox("Đầu vào")
        input_layout = QVBoxLayout(input_group)
        input_layout.addWidget(
            QLabel(
                "Danh sách FEN (mỗi dòng một FEN; chấp nhận tiền tố như 1., 2), 3:):"
            )
        )
        self.fen_input = QPlainTextEdit()
        self.fen_input.setPlaceholderText("Nhập các FEN theo thứ tự sensor ghi nhận...")
        self.fen_input.setLineWrapMode(QPlainTextEdit.LineWrapMode.NoWrap)
        self.fen_input.setFont(QFontDatabase.systemFont(QFontDatabase.SystemFont.FixedFont))
        input_layout.addWidget(self.fen_input, 1)

        options = QHBoxLayout()
        self.max_missing_input = QSpinBox()
        self.max_missing_input.setRange(0, 2)
        self.max_missing_input.setValue(2)
        self.max_missing_input.setToolTip("Số FEN thiếu tối đa được phép phục hồi")
        options.addWidget(QLabel("Max missing FEN:"))
        options.addWidget(self.max_missing_input)
        options.addStretch()
        input_layout.addLayout(options)

        buttons = QHBoxLayout()
        sample_button = QPushButton("Nạp dữ liệu mẫu")
        sample_button.clicked.connect(self._load_sample)
        clear_button = QPushButton("Xóa")
        clear_button.clicked.connect(self.fen_input.clear)
        self.run_button = QPushButton("Chạy pipeline")
        self.run_button.setDefault(True)
        self.run_button.setStyleSheet("padding: 7px 18px; font-weight: 600;")
        self.run_button.clicked.connect(self._start_pipeline)
        buttons.addWidget(sample_button)
        buttons.addWidget(clear_button)
        buttons.addStretch()
        buttons.addWidget(self.run_button)
        input_layout.addLayout(buttons)
        splitter.addWidget(input_group)

        result_group = QGroupBox("Kết quả đã xếp hạng")
        result_layout = QVBoxLayout(result_group)
        self.summary = QLabel("Chưa chạy")
        result_layout.addWidget(self.summary)
        self.result_table = QTableWidget(0, 3)
        self.result_table.setHorizontalHeaderLabels(
            ["Rank", "Final moves (UCI)", "Moves (SAN)"]
        )
        self.result_table.setAlternatingRowColors(True)
        self.result_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.result_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.result_table.verticalHeader().setVisible(False)
        header = self.result_table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        result_layout.addWidget(self.result_table, 1)
        self.visualize_button = QPushButton("Visualize selected path")
        self.visualize_button.setEnabled(False)
        self.visualize_button.clicked.connect(self._visualize_selected_path)
        self.result_table.itemSelectionChanged.connect(self._result_selection_changed)
        self.result_table.cellDoubleClicked.connect(
            lambda _row, _column: self._visualize_selected_path()
        )
        result_layout.addWidget(self.visualize_button)
        splitter.addWidget(result_group)
        splitter.setSizes([510, 670])

        self.log_output = QPlainTextEdit()
        self.log_output.setReadOnly(True)
        self.log_output.setMaximumHeight(125)
        self.log_output.setPlaceholderText("Log lỗi/tiến trình sẽ hiện ở đây")
        self.log_output.setFont(QFontDatabase.systemFont(QFontDatabase.SystemFont.FixedFont))
        page.addWidget(self.log_output)

        self.statusBar().showMessage("Sẵn sàng")

    def _load_sample(self) -> None:
        self.fen_input.setPlainText("\n".join(SAMPLE_FENS))

    def _validate_inputs(self) -> tuple[list[str], int] | None:
        fens, normalization_count = normalize_fen_lines(
            self.fen_input.toPlainText()
        )
        if not fens:
            QMessageBox.warning(self, "Thiếu dữ liệu", "Hãy nhập ít nhất một FEN.")
            return None

        for index, fen in enumerate(fens, start=1):
            try:
                chess.Board(fen)
            except (TypeError, ValueError) as exc:
                QMessageBox.warning(
                    self,
                    "FEN không hợp lệ",
                    f"Dòng FEN {index} không hợp lệ:\n{exc}",
                )
                return None

        return fens, normalization_count

    def _start_pipeline(self) -> None:
        if self._thread is not None:
            return
        validated = self._validate_inputs()
        if validated is None:
            return
        fens, normalization_count = validated
        self._start_fen = fens[0]
        self._input_fens = fens
        self._normalization_count = normalization_count
        self.result_table.setRowCount(0)
        self._result_paths = []
        self.visualize_button.setEnabled(False)
        self.log_output.clear()
        self.log_output.appendPlainText(f"Engine: {self._run_engine_label}")
        self.log_output.appendPlainText(
            "Bruteforce: duyệt toàn bộ nước hợp lệ; "
            f"tối đa {self.max_missing_input.value() + 1} nước cho mỗi X còn lại."
        )
        if normalization_count:
            self.log_output.appendPlainText(
                f"Đã bổ sung trường en-passant '-' cho {normalization_count} dòng FEN."
            )
        self.summary.setText(f"{self._run_engine_label} — Đang xử lý…")
        self.statusBar().showMessage("Pipeline đang chạy…")
        self.run_button.setEnabled(False)

        thread = QThread(self)
        worker = PipelineWorker(
            fens,
            self.max_missing_input.value(),
        )
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.succeeded.connect(self._show_results)
        worker.failed.connect(self._show_error)
        worker.finished.connect(thread.quit)
        worker.finished.connect(worker.deleteLater)
        thread.finished.connect(self._worker_finished)
        thread.finished.connect(thread.deleteLater)
        self._thread = thread
        self._worker = worker
        thread.start()

    @pyqtSlot(object, float)
    def _show_results(
        self,
        result: PipelineResult,
        elapsed: float,
    ) -> None:
        results = result.get("results", [])
        self._result_paths = []
        for result_item in results:
            moves = result_item.get("moves", [])
            rank = result_item.get("rank", "")
            if not isinstance(moves, list):
                continue
            self._result_paths.append((rank, list(moves)))
            row = self.result_table.rowCount()
            self.result_table.insertRow(row)
            values = [
                str(rank),
                " ".join(moves),
                moves_to_san(self._start_fen, moves),
            ]
            for column, value in enumerate(values):
                item = QTableWidgetItem(value)
                item.setToolTip(value)
                self.result_table.setItem(row, column, item)

        if self.result_table.rowCount():
            self.result_table.selectRow(0)

        self.summary.setText(
            f"{self._run_engine_label} • {len(results)} path • {elapsed:.2f} giây"
        )
        normalization_log = (
            f"Đã bổ sung trường en-passant '-' cho {self._normalization_count} dòng FEN.\n"
            if self._normalization_count
            else ""
        )
        self.log_output.setPlainText(
            f"Engine: {self._run_engine_label}\n"
            + normalization_log + "Pipeline hoàn tất thành công."
            + "\nBruteforce: rank candidate = -1; Rank trong bảng chỉ là số thứ tự kết quả."
        )
        self.statusBar().showMessage("Hoàn tất")

    def _result_selection_changed(self) -> None:
        row = self.result_table.currentRow()
        self.visualize_button.setEnabled(0 <= row < len(self._result_paths))

    def _visualize_selected_path(self) -> None:
        row = self.result_table.currentRow()
        if row < 0 or row >= len(self._result_paths):
            return
        rank, moves = self._result_paths[row]
        dialog = PathVisualizerDialog(rank, moves, self._input_fens, self)
        dialog.exec()

    @pyqtSlot(str, str, float)
    def _show_error(self, message: str, details: str, elapsed: float) -> None:
        self.summary.setText(f"{self._run_engine_label} — Pipeline lỗi sau {elapsed:.2f} giây")
        normalization_log = (
            f"Đã bổ sung trường en-passant '-' cho {self._normalization_count} dòng FEN.\n\n"
            if self._normalization_count
            else ""
        )
        self.log_output.setPlainText(
            f"Engine: {self._run_engine_label}\n" + normalization_log + details
        )
        self.statusBar().showMessage("Có lỗi")
        QMessageBox.critical(self, "Pipeline thất bại", message)

    @pyqtSlot()
    def _worker_finished(self) -> None:
        self.run_button.setEnabled(True)
        self._thread = None
        self._worker = None

    def closeEvent(self, event: QCloseEvent) -> None:
        if self._thread is not None and self._thread.isRunning():
            QMessageBox.information(
                self,
                "Pipeline đang chạy",
                "Hãy đợi pipeline chạy xong trước khi đóng cửa sổ.",
            )
            event.ignore()
            return
        event.accept()


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("Chess FEN Recovery Tester")
    window = MainWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
