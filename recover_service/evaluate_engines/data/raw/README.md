# Raw FEN input

Put one game in each `.fen` file in this directory. Example `game_0001.fen`:

```text
# id: game_0001
# start_fen: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1

1. rnbqkbnr/pppppppp/8/8/8/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1
2. rnbqkbnr/ppp1pppp/8/3p4/8/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2
3. rnbqkbnr/ppp1pppp/8/3p4/8/5N2/PPP1PPPP/RNBQKB1R b KQkq - 1 2
```

Blank lines and `#` comments are ignored. If `# id` is omitted, the filename
becomes the game id. If `# start_fen` is omitted, the standard chess starting
position is used.

Prepare all files with:

```bash
python evaluate_engines/prepare_dataset.py --input evaluate_engines/data/raw --output evaluate_engines/data/prepared/games.jsonl
```

