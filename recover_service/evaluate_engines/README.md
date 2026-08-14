# FEN recovery engine evaluation

This folder evaluates candidate generation for recovering chess games from an
observed FEN history. The supported generators are:

- `bruteforce`: exhaustive legal-move baseline.
- `stockfish`: Stockfish through UCI.
- `leela`: LCZero with a selected Leela network.
- `maia_1900`: Maia 1900 weights loaded by LCZero.
- `maia3_79m`: Maia3 79M (Chessformer) through its official UCI command.

The evaluation runs models sequentially, caches exhaustive baseline lines, and
checkpoints every completed `(game, model)` pair.

## 1. Expected directory layout

Keep binaries, model weights, raw data, and generated results separate:

```text
evaluate_engines/
|-- data/
|   |-- raw/                       One .fen file per game
|   `-- prepared/games.jsonl       Generated input dataset
|-- runtime/                       Create on the VM; do not commit large files
|   |-- engines/
|   |   |-- stockfish
|   |   `-- lc0
|   `-- models/
|       |-- leela/network.pb.gz
|       |-- maia/maia-1900.pb.gz
|       `-- maia3/maia3-79m.pt
|-- outputs/                       Generated evaluation results
|-- prepare_dataset.py
`-- run_evaluation.py
```

The exact filenames may differ. Environment variables below provide the real
paths. Do not add downloaded binaries, checkpoints, or generated outputs to Git.

## 2. Python environment

Maia3 requires Python 3.10 or newer. Python 3.11 is the recommended common
version for a Linux VM.

Create and activate an environment:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install psutil nvidia-ml-py numpy huggingface-hub
```

`psutil` supplies process CPU/RAM telemetry. `nvidia-ml-py` supplies the
`pynvml` import used for NVIDIA GPU/VRAM telemetry. Evaluation still runs if
these optional telemetry packages are absent, but the corresponding values are
`null`.

### PyTorch and CUDA

Kaggle normally provides a CUDA-enabled PyTorch environment. Do not reinstall
PyTorch there unless the check below fails. For another VM, install the PyTorch
wheel matching its NVIDIA driver using the official selector:

https://pytorch.org/get-started/locally/

Verify CUDA before installing Maia3:

```bash
nvidia-smi
python -c "import torch; print(torch.__version__); print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
```

Install the official Maia3 package after PyTorch is ready:

```bash
python -m pip install "maia3 @ git+https://github.com/CSSLab/maia3.git"
maia3-uci --help
```

For reproducible experiments, pin the Maia3 Git commit and PyTorch version in
the VM image or notebook instead of tracking the moving `main` branch.

## 3. Prepare the raw dataset

### Raw format

Store exactly one game in each `.fen` file under `evaluate_engines/data/raw/`.
For example, `game_0001.fen`:

```text
# id: game_0001
# start_fen: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1

1. rnbqkbnr/pppppppp/8/8/8/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1
2. rnbqkbnr/ppp1pppp/8/3p4/8/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2
3. rnbqkbnr/ppp1pppp/8/3p4/8/5N2/PPP1PPPP/RNBQKB1R b KQkq - 1 2
```

Rules:

- One non-empty FEN line represents one observed ply.
- Numeric prefixes such as `1.` and `2.` are optional.
- Empty lines and lines beginning with `#` are ignored.
- `# id` is optional; the filename is used when omitted.
- `# start_fen` is optional; standard chess starting FEN is used when omitted.
- Files must be UTF-8. UTF-8 BOM is accepted.

If the raw files are mounted as a Kaggle Dataset, they can remain under
`/kaggle/input/...`; pass that directory directly to `--input`. There is no
automatic raw-dataset downloader in this repository.

### Convert raw files to JSONL

From the repository root:

```bash
python evaluate_engines/prepare_dataset.py \
  --input evaluate_engines/data/raw \
  --output evaluate_engines/data/prepared/games.jsonl
```

For a Kaggle-mounted directory:

```bash
python evaluate_engines/prepare_dataset.py \
  --input /kaggle/input/my-fen-dataset \
  --output evaluate_engines/data/prepared/games.jsonl
```

The prepared file contains one JSON object per line:

```json
{"id":"game_0001","fenHistory":["..."],"startFen":"...","targetUciMoves":null,"sourceFile":"game_0001.fen","groundTruthAvailable":false,"recoveryAccuracyMode":"baseline_compatible"}
```

Rejected files are written to
`evaluate_engines/data/prepared/prepare_failures.jsonl`. Fix them and run the
prepare command again; the output is rebuilt atomically.

### Optional ground truth

Raw FEN-only data cannot prove which original game was correct. It supports
baseline-compatible metrics but not exact recovery accuracy. If original moves
are available, add their complete UCI sequence to the JSONL record:

```json
{
  "id": "game_0001",
  "fenHistory": ["..."],
  "targetUciMoves": ["d2d4", "d7d5", "g1f3"],
  "groundTruthAvailable": true
}
```

## 4. Install engines and model weights

### Stockfish

Download the Linux binary appropriate for the VM CPU from:

https://stockfishchess.org/download/

Store it as `evaluate_engines/runtime/engines/stockfish` and make it executable:

```bash
chmod +x evaluate_engines/runtime/engines/stockfish
```

Stockfish runs on CPU; it does not use CUDA.

### LCZero / Leela

Download an LCZero build from:

https://lczero.org/play/download/

For recent NVIDIA RTX GPUs, use the official CUDA 12 build. A CPU-only LCZero
build works but produces different performance measurements. Store the binary
as `evaluate_engines/runtime/engines/lc0` and make it executable.

The LCZero package may include a default network. For reproducible evaluation,
select one fixed network, preserve its filename/checksum, and store it at:

```text
evaluate_engines/runtime/models/leela/network.pb.gz
```

The `leela` generator is not usable without both the LCZero binary and weights.

### Maia 1900

Download `maia-1900.pb.gz` from the official Maia repository:

https://github.com/CSSLab/maia-chess/tree/master/maia_weights

Store it at:

```text
evaluate_engines/runtime/models/maia/maia-1900.pb.gz
```

Maia 1900 uses the same LCZero binary. The Maia authors evaluate move policy
with search disabled (`nodes=1`). The current evaluator has one shared UCI
limit for all selected UCI engines, so use `--uci-nodes 1` when performing the
Maia policy experiment.

### Maia3 79M / Chessformer

Official code and model documentation:

- https://github.com/CSSLab/maia3
- https://huggingface.co/UofTCSSLab/Maia3-79M

Pre-cache the official preset when internet is available:

```bash
maia3-cache --model maia3-79m
```

Alternatively, mount/download `maia3-79m.pt` into
`evaluate_engines/runtime/models/maia3/` and set `MAIA3_CHECKPOINT`. Supplying a
local checkpoint avoids a model download when the evaluation starts.

## 5. Runtime environment variables

From the repository root, configure paths for the current VM:

```bash
export CUDA_VISIBLE_DEVICES=0
export STOCKFISH_PATH="$PWD/evaluate_engines/runtime/engines/stockfish"
export LEELA_PATH="$PWD/evaluate_engines/runtime/engines/lc0"
export LEELA_WEIGHTS="$PWD/evaluate_engines/runtime/models/leela/network.pb.gz"
export MAIA_1900_PATH="$PWD/evaluate_engines/runtime/engines/lc0"
export MAIA_1900_WEIGHTS="$PWD/evaluate_engines/runtime/models/maia/maia-1900.pb.gz"
export MAIA3_PATH="maia3-uci"
export MAIA3_CHECKPOINT="$PWD/evaluate_engines/runtime/models/maia3/maia3-79m.pt"
export MAIA3_ELO=1900
```

`CUDA_VISIBLE_DEVICES=0` exposes only physical GPU 0 to CUDA applications. It
does not limit GPU utilization or VRAM. Omit `MAIA3_CHECKPOINT` when using the
pre-cached Maia3 preset.

Optional UCI options can be supplied as JSON objects:

```bash
export LEELA_OPTIONS='{}'
export MAIA_1900_OPTIONS='{}'
export MAIA3_OPTIONS='{"Elo":1900,"Temperature":0,"TopP":1.0}'
```

Only use option names advertised by the corresponding engine's UCI handshake.

## 6. Run evaluation

Run all generators:

```bash
python evaluate_engines/run_evaluation.py \
  --dataset evaluate_engines/data/prepared/games.jsonl \
  --models bruteforce,stockfish,leela,maia_1900,maia3_79m \
  --top-k 5 \
  --uci-time 0.1
```

Useful arguments:

```text
--models          Comma-separated model list
--top-k           Candidate count requested from each ranked engine
--max-branches    Fail a game if compatible branches exceed this limit
--uci-time        Shared UCI time limit in seconds
--uci-depth       Optional shared depth limit
--uci-nodes       Optional shared node limit
--output-dir      Result/checkpoint directory
--maia3-elo       Maia3 player/opponent Elo context
```

For a Maia 1900 policy-only run:

```bash
python evaluate_engines/run_evaluation.py \
  --dataset evaluate_engines/data/prepared/games.jsonl \
  --models bruteforce,maia_1900 \
  --top-k 5 \
  --uci-nodes 1 \
  --output-dir evaluate_engines/outputs/maia_1900
```

Use different output directories when experiments use different limits or
engine versions. This prevents an older checkpoint from being mistaken for the
current experiment.

## 7. Outputs and resume behavior

The default output directory is `evaluate_engines/outputs/`:

```text
outputs/
|-- baseline_cache/*.json.gz   Exhaustive final lines keyed by input
|-- checkpoint.jsonl           Completed game/model pairs
|-- per_game.jsonl             Per-game metrics and performance
|-- summary.json               Metadata and aggregate model metrics
|-- summary.csv                Flat aggregate table
`-- failures.jsonl             Setup and per-game failures
```

Rerunning the same command reuses compatible baseline cache files and skips
successful `(game, model)` records already present in the checkpoint. Failed
records are retried. Delete or select a new output directory when changing the
dataset, engine binary, weights, UCI limit, or model configuration.

## 8. Metrics

- `Hit@1`, `Hit@3`, `Hit@5`: baseline-compatible target move appears within K
  ranked proposals at a missing-move event.
- `MeanHitRank`, `MedianHitRank`: rank of the first target hit; lower is better.
- `MRR`: mean reciprocal rank; higher is better.
- `missRate`: proportion of ranked events without a target hit.
- `exactRecoveryAccuracy`: complete target UCI sequence recovered; only for
  records with ground truth.
- `baselineCompatibleRecoveryRate`: at least one complete recovered line
  intersects exhaustive baseline lines; used for raw FEN-only data.
- Performance: latency, proposals/second, CPU, RSS RAM, GPU utilization, and
  VRAM when telemetry is available.

## 9. Current GPU limitations

GPU setup is not automatic. The runner assumes the NVIDIA driver, compatible
PyTorch CUDA wheel, CUDA-capable LCZero binary, and model files already exist.
It also currently reports device-wide GPU utilization/used VRAM rather than
strict per-process GPU metrics. Engine initialization and first model load may
affect the first measured game, so keep the same warm/cold-start policy when
comparing experiments.

