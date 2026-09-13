# FEN recovery V4 integration

The website uses `recover_service.app.main:app` on internal port 8000.
Its `/recover` adapter calls the V4 pipeline. V4 recovery and ranking are
unchanged; only package imports in `recover_service_v4` were adjusted.
The standalone V4 API remains available as `recover_service_v4.api:app`
at `/v1/recover`, but does not provide the website's presentation metadata.

## Request

`POST /recover` accepts:

```json
{
  "fenHistory": ["rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"],
  "startFen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "headers": {"White": "White", "Black": "Black", "Result": "*"},
  "maxBranches": 10000,
  "maxMissingFens": 2,
  "stockfishDepth": 15
}
```

The history contains 1–500 observations. The adapter prepends `startFen`
(standard starting position by default), collapses adjacent duplicate piece
placements and keeps the mapping to original observation indices. The separate
initial position does not consume the 500-observation allowance.
Legacy V3 noise-cleaning and retry options no longer configure the engine.

## Response and selection

The response has `schemaVersion: 4`, `engineVersion: recover_service_v4`,
`pgn`, `bestPgn`, `fullyRecovered`, `failedPlies`, `longestRecoveredPly`,
`bestMoveLists`, `finalMoveLists`, `recoveryGroups` and `preprocessing`.
Each recovery line contains UCI, SAN, replayed FENs, normalized `startFen`, PGN,
its own `steps`, `groupId`, `rank`, `paddingIndices`, `paddingScores` and `scoreSides`.
Padding indices are zero-based move indices; `originalPly` is a one-based
observation index and is null only for inserted intermediate positions.

Groups are ordered by padding count, with stable engine order for ties.
Within each group V4 ranks score vectors lexicographically, descending.
Scores are from the perspective of the mover, evaluated after each padding move.
They are suggestions, not confidence estimates. The UI shows conventional
centipawn scores in pawn units; extreme integer scores retain their encoded form
because V4's response does not explicitly distinguish mate from centipawn values.
No scores are fabricated for unscored moves.

The UI groups complete paths by their selected prefix. Choosing a move filters
the continuations to existing V4 paths, never splicing incompatible paths or
mixing groups. Compatible subsequent choices are preserved as far as possible.
PGN export uses the selected full path, including correct initial turn and move number.

## Partial recovery and limits

The adapter first checkpoints the directly inferred prefix using V4, attempts
the complete history, and, if no complete paths exist, tries successively shorter
prefixes until V4 returns a path. This produces a continuous partial PGN, never
a PGN with gaps or fabricated moves. The raw history is never overwritten.
On a deadline, a checkpointed prefix is returned if available, otherwise HTTP 504.
Errors in input, branch limits and unavailable Stockfish remain explicit errors.

Each request runs in a separate worker process. The default wall-clock budget
is 50 seconds and concurrency is 2. Linux process-group cleanup terminates
Stockfish descendants as well. The branch limit is checked after V4 generates
results, not inside its unchanged search algorithm.

Environment:

- `STOCKFISH_PATH`: engine executable; Docker installs Debian's Stockfish at `/usr/games/stockfish`.
- `RECOVERY_WORKER_TIMEOUT_SECONDS=50`: worker budget; keep below backend `RECOVERY_TIMEOUT_MS=60000`.
- `RECOVERY_CONCURRENCY=2`: simultaneous recovery workers per API process.

For reproducible ranking across deployments, use the same Stockfish binary and
depth. The bundled Windows engine can be used for local testing; distributions
may package a different Stockfish version.

## Run and verify

From the repository root:

```sh
python -m pip install -r recover_service/requirements.txt httpx
python -m unittest recover_service.test_v4_integration -v
python -m uvicorn recover_service.app.main:app --host 127.0.0.1 --port 8014
```

With that test service running:

```sh
npm run build
node --experimental-strip-types tools/verify-v4-client.ts
node --experimental-strip-types frontend/scripts/verify-recovery-tree.ts
```

## Deploy

Deploy backend, recovery and frontend together: the V4 response contract replaces V3.
Use the existing private `.env`; do not copy development credentials to production.

```sh
docker compose config --quiet
docker compose build recover-service ttlab-chess-app frontend
docker compose up -d recover-service ttlab-chess-app frontend
docker compose ps
docker compose exec -T recover-service python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())"
```

Verify importing FENs, switching groups and recovery choices, PGN downloads,
history review and finalization of a game. Keep the previous images for rollback;
roll all three services back together. No MongoDB schema migration is required.
