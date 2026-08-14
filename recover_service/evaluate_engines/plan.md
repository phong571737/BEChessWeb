# Engine evaluation architecture

## Goal

Run recovery evaluation from one entrypoint on a Linux VM/Kaggle:

```bash
python evaluate_engines/run_evaluation.py --dataset /path/games.jsonl --models bruteforce,stockfish,leela,maia_1900,maia3_79m
```

The runner is intentionally sequential so CPU/GPU measurements from different
engines do not overlap. Results are checkpointed after every game and a rerun
skips completed `(game, model)` pairs.

## Components

```text
evaluate_engines/
|-- run_evaluation.py       Single CLI entrypoint
|-- prepare_dataset.py      Raw numbered .fen to normalized JSONL
|-- dataset.py              JSON/JSONL input normalization
|-- evaluator.py            Recovery loop and baseline comparison
|-- generators/
|   |-- base.py             Ranked candidate contract
|   |-- bruteforce.py       Existing exhaustive baseline
|   `-- uci.py              Stockfish, LCZero, Maia 1900 and Maia3 adapter
|-- metrics/
|   |-- ranking.py          Hit@K, hit rank, MRR and recovery accuracy
|   `-- resources.py        Process CPU/RAM and optional NVIDIA telemetry
`-- outputs/                Generated at runtime
```

All selected neural engines use a UCI process. Maia 1900 runs its LCZero
network through an LCZero binary. Maia3 79M uses the official `maia3-uci`
command with the `79m` preset, so no model-specific Python inference is mixed
into the evaluator.

## Dataset contract

One JSON object per line (a JSON array is also accepted):

```json
{
  "id": "game-1",
  "fenHistory": ["..."],
  "targetUciMoves": ["e2e4", "e7e5"],
  "startFen": "optional",
  "headers": {}
}
```

Put one game per `.fen` file under `data/raw/`, then prepare it with:

```bash
python evaluate_engines/prepare_dataset.py --input evaluate_engines/data/raw --output evaluate_engines/data/prepared/games.jsonl
```

`targetUciMoves` is recommended. Without it, `exactRecoveryAccuracy` is not
reported; `baselineCompatibleRecoveryRate` indicates whether the model
produced at least one complete line compatible with the exhaustive baseline.
Ranking metrics use the best baseline-compatible next move for the same
recovered prefix.

## Metrics

- Hit@1, Hit@3 and Hit@5 over missing-move proposal events.
- Mean/median hit rank and MRR. Misses remain visible through miss rate.
- Exact recovery accuracy for games with target moves.
- Baseline-compatible recovery rate for raw FEN-only games.
- Wall latency, throughput, process CPU, peak RSS RAM, NVIDIA GPU utilization
  and peak VRAM when NVML is available.

## Runtime configuration

Paths can be CLI flags or environment variables:

- `STOCKFISH_PATH`
- `LEELA_PATH`, `LEELA_WEIGHTS`
- `MAIA_1900_PATH`, `MAIA_1900_WEIGHTS`
- `MAIA3_PATH` (defaults to `maia3-uci`), `MAIA3_CHECKPOINT`, `MAIA3_ELO`

The script never installs packages or explicitly downloads weights. VM/Kaggle
images must already contain `python-chess`, engine binaries, checkpoints, and
optionally `psutil`/`pynvml` for complete telemetry. If `MAIA3_CHECKPOINT` is
omitted, the official Maia3 UCI process may download and cache its 79M preset on
first use; provide a mounted checkpoint for a strictly offline run.

## Outputs

- `checkpoint.jsonl`: resumable per-game records.
- `baseline_cache/*.json.gz`: exhaustive lines reused on resumed runs.
- `per_game.jsonl`: consolidated records for the current run.
- `summary.json` and `summary.csv`: aggregate comparison.
- `failures.jsonl`: isolated engine/game failures.
