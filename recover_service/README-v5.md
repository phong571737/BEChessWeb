# FEN recovery V5 integration

The website continues to call `POST /recover` on `recover_service.app.main:app`.
The adapter prepends `startFen` (standard start by default), collapses adjacent
duplicate piece placements, invokes the standalone V5 brute-force pipeline, and
returns only `results[0]`. V5's ordinal `rank` is not a quality score.

The response uses `schemaVersion: 5` and `engineVersion: recover_service_v5`.
`bestMoveLists` contains exactly one line. Its UCI and SAN lists preserve any
unresolved `X`. At an `X`, the displayed board uses the next observed FEN; it
does not claim a legal move between those positions. The PGN and movetext are
the continuous legal prefix before the first `X` (or other replay failure),
because PGN cannot encode an unknown move. `failedPlies` identifies unresolved
input observations. Raw FEN history is not changed.

`paddingScores` and `scoreSides` are empty; V5 does not use Stockfish. The
single-path UI does not show the V4 recovery-choice explorer. Stockfish in
unrelated game analysis remains available.

Each request runs in a child process with a default 50-second wall-clock limit
and at most two concurrent requests (`RECOVERY_WORKER_TIMEOUT_SECONDS` and
`RECOVERY_CONCURRENCY`). A timeout returns HTTP 504. V5 currently generates
all paths before the adapter selects the first one; these process limits do not
bound intermediate search memory. `maxBranches` and `stockfishDepth` remain
accepted for older callers but do not configure V5.

Verify locally from the repository root:

```sh
python -m pip install -r recover_service/requirements.txt
python -m unittest recover_service.test_v5_integration -v
python -m uvicorn recover_service.app.main:app --host 127.0.0.1 --port 8014
```

With the service running, run `npm run build` and
`node --experimental-strip-types tools/verify-v5-client.ts`.
Build and deploy the backend, frontend, and recovery service together.
