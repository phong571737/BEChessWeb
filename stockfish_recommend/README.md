# Stockfish Candidate Scoring API

Vietnamese request/response, binary setup, and client usage guide:
[`API_USAGE.vi.md`](API_USAGE.vi.md).

Internal FastAPI service that generates every legal move from a FEN with
`python-chess`, evaluates all candidates with Stockfish MultiPV, and returns a
ranked result.

## Production deployment

The image installs the Linux Stockfish package while building. The local
`stockfish/` source tree and Windows binary are excluded from both Git and the
Docker build context.

```powershell
docker compose build stockfish-recommend
docker compose up -d stockfish-recommend
docker compose ps
```

Run these commands from the repository root. The root Compose project binds the
container to `127.0.0.1:${STOCKFISH_RECOMMEND_PORT:-8001}` only. Nginx publishes
that loopback service at `/stockfish-api/` on the existing HTTPS website. Use
the example snippets in `deploy/nginx/`; do not open the host port in the VPS
firewall.

The public endpoints are therefore `/stockfish-api/live`,
`/stockfish-api/ready`, `/stockfish-api/v1/evaluate`, and
`/stockfish-api/v2/evaluate`. The trailing slash in the example Nginx
`proxy_pass` removes `/stockfish-api/` before forwarding to FastAPI.

## Local Windows development

Python 3.11 or newer is required. The bundled Windows binary is selected when
`STOCKFISH_PATH` is not set.

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

If the `py` launcher has not registered the installation on this machine, use
the interpreter directly for the first command:

```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe" -m venv .venv
```

Swagger UI is available at <http://127.0.0.1:8000/docs> for local testing. Do
not use `--reload` in production.

## Endpoints

- `GET /live`: confirms that the API process is running.
- `GET /ready`: checks the real UCI engine when idle and returns 503 when it is
  unavailable. During an active analysis it reports ready without interrupting
  the UCI command.
- `POST /v2/evaluate`: ordered response with mate represented separately.
- `POST /v1/evaluate`: deprecated compatibility response `{move: score}`.

Request:

```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "depth": 16
}
```

V2 response:

```json
{
  "moves": [
    {
      "rank": 1,
      "move": "e2e4",
      "scoreCp": 38,
      "mateIn": null
    }
  ],
  "depth": 16,
  "sideToMove": "white"
}
```

`scoreCp` is from the input position's side-to-move perspective. It is `null`
for mate results; `mateIn` is then a signed number of moves. The returned
`depth` is the minimum depth actually reached across the returned candidates.

Errors use a stable envelope:

```json
{
  "error": {
    "code": "ENGINE_TIMEOUT",
    "message": "Stockfish analysis exceeded the allowed time"
  }
}
```

Relevant status codes are 422 for invalid input, 429 for a full queue, 503 for
an unavailable engine or queue wait timeout, 504 for analysis timeout, 413 for
an oversized request, and 500 for unexpected internal errors.

## Configuration

| Variable | Default | Validation |
| --- | ---: | --- |
| `STOCKFISH_PATH` | platform-specific | Existing executable file |
| `STOCKFISH_THREADS` | `2` | 1 to available CPU count |
| `STOCKFISH_HASH_MB` | `128` | 16–512 MB |
| `ANALYSIS_TIMEOUT_SECONDS` | `3` | Greater than 0 |
| `ENGINE_STOP_GRACE_SECONDS` | `1` | Greater than 0 |
| `STARTUP_TIMEOUT_SECONDS` | `10` | Greater than 0 |
| `READINESS_TIMEOUT_SECONDS` | `1` | Greater than 0 |
| `QUEUE_WAIT_TIMEOUT_SECONDS` | `5` | Greater than 0 |
| `MAX_DEPTH` | `20` | 1–22 |
| `QUEUE_SIZE` | `8` | 0–10 waiting requests |
| `MAX_REQUEST_BODY_BYTES` | `2048` | 512–16384 bytes |

Invalid configuration stops the service during startup with a message naming
the invalid variable. Run exactly one Uvicorn worker per container: each worker
would otherwise create another Stockfish process and its own queue.
