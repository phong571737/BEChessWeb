# FEN Recovery Service
Run a small REST wrapper around the FEN recovery service.

API (concise)
- Endpoint: `POST /recover`

## Recovery v2 options

The service preprocesses observations before recovery. Consecutive FENs with
the same piece placement are collapsed by the standalone
`service/preprocessing.py` module; non-consecutive repetitions are preserved.

Optional request fields:

- `deduplicatePositions` (`true` by default): enable consecutive-position deduplication.
- `nRetry` (`5` by default): maximum wildcard padding count tried at each broken gap; use `0` to disable retry.
- `maxBranches`: fail rather than silently truncate compatible branches.
- The standalone `index.html` visualizer sends `maxBranches: 10000` and aborts after 60 seconds so a damaged history cannot leave the browser waiting indefinitely. The backend timeout remains configurable through `RECOVERY_TIMEOUT_MS`.
- `maxRepairGaps` (`10` by default): maximum repaired boundaries.
- `maxTotalPadding` (`20` by default): maximum wildcard FENs for the request.
- `finalOnly`: omit per-step candidate deltas.

Responses use `schemaVersion: 2`. `steps[].candidates` contains one-move deltas
with `id` and `parentId`; complete histories remain in `finalMoveLists` and
`bestMoveLists`.
- Method: POST
- Request payload (JSON):
  - `fenHistory`: array[string] — required, ordered FEN snapshots (one per observed ply)
  - `startFen`: string — optional, initial FEN before first observed ply
  - `headers`: object — optional PGN headers
  - `maxBranches`: integer — optional limit to avoid combinatorial explosion
  - `finalOnly`: boolean — optional, when true omit per-ply `steps` in response
- Response (JSON): `RecoveryResult.to_dict()` with keys such as:
  - `originalPgn`, `failedPlies`, `detections`, `fullyRecovered`, `longestRecoveredPly`, `finalMoveLists`, (optional) `steps`

Setup (minimal)
1. Create an environment and install deps:

```bash
pip install -r requirements.txt
```

2. Run server from the repository root so package imports resolve:

```bash
uvicorn main.app:app --reload --port 8000
```



That is all — endpoint, method, payload, result, and minimal setup.

API Usage
---------

- Endpoint: `POST /recover` (JSON)

- Request JSON fields:
  - `fenHistory` (array[string], required): ordered FEN snapshots (one per ply observed).
  - `startFen` (string, optional): initial FEN before the first observed ply. Defaults to standard start.
  - `headers` (object, optional): PGN headers to include in the converted PGN.
  - `maxBranches` (int, optional): fail if more than this number of compatible branches are produced.
  - `finalOnly` (bool, optional): when true the response omits per-ply `steps` and returns only final move lists.

- Example curl:

```bash
curl -s -X POST http://127.0.0.1:8000/recover \
  -H "Content-Type: application/json" \
  -d '{"fenHistory":["rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1"], "maxBranches":1000}'
```

- Example Python (requests):

```py
import requests

resp = requests.post(
    "http://127.0.0.1:8000/recover",
    json={"fenHistory": ["rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1"]},
)
print(resp.json())
```

- Example (truncated) response JSON keys:
  - `originalPgn`: reconstructed PGN text (with X tokens for unknown moves).
  - `failedPlies`: list of ply indices where detection failed.
  - `detections`: per-ply detection results (move or X).
  - `fullyRecovered`: boolean — whether at least one branch survived through all observed FENs.
  - `longestRecoveredPly`: last ply that had any surviving branches.
  - `finalMoveLists`: array of recovered move lists (each with `uciMoves`, `sanMoves`, `moveSources`, `assumedFens`).
  - `steps`: (omitted when `finalOnly=true`) per-ply `RecoveryStep` objects with candidate branches.

Quick test
----------

The repository includes a smoke-test script that POSTs the example 76-FEN history to the running server:

```bash
# run server from repo root so package imports resolve
uvicorn recover_service.app:app --reload --port 8000

# in another terminal
python recover_service/test_run.py
```

When I ran this test against the local server, the service returned:

```
fullyRecovered: True
longestRecoveredPly: 76
finalMoveLists count: 1
```

Notes
-----
- The service treats observed FENs as piece-placement snapshots: side-to-move, castling and counters are ignored for compatibility checks.
- If you run Uvicorn from inside `recover_service` use the module path `app.main:app`; if you run from the workspace root prefer `recover_service.app:app` so package imports resolve correctly.

