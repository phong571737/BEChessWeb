# Chess FEN Recovery - Bruteforce only

This is a standalone copy of the recovery source. It generates candidates only
from `python-chess` legal moves and contains no Stockfish, Berserk, Maia-3, or
Lc0 integration.

## GUI

```powershell
python gui.py
```

## CLI

```powershell
python main.py path\to\fens.txt --max-missing-fens 2
```

## API

```powershell
uvicorn api:app --reload
```
