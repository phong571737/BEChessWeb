# Code comments and configuration policy

## Function comments

Production functions should have a short English JSDoc comment when their
purpose, side effects, concurrency behavior, or failure policy is not obvious
from the signature. Comments describe behavior and invariants; they do not
repeat the implementation line by line. New backend services, controllers,
routers, persistence helpers, MQTT handlers, and non-trivial React hooks must
follow this rule. Generated bundles, third-party assets, simple JSX event
callbacks, and one-line getters do not need artificial comments.

The most important lifecycle functions document their contracts directly:

- `finishEspRestartByEvaluation` explains the Stockfish decision and the
  unconfirmed fallback.
- `GameResignService.handleUnconfirmed` records why a finalized session has
  `Result: "*"` without treating it as an active game.
- `markHistoryUnfinished` records the durable history status transition.
- `evaluatePosition` documents serialized, fixed-depth backend searches.

## Environment and secret audit

No real MongoDB URI, JWT secret, MQTT credential, bootstrap password, or VPS
credential belongs in source control. Runtime values are read from `.env`
(`.env` is ignored); `.env.example` and `frontend/.env.example` contain only
placeholders and local development examples. Docker passes the internal backend
and recovery-service addresses through Compose variables, while the browser
origin is supplied by `BACKEND_PUBLIC_URL` at build time.

Required secret settings are validated at startup (`MONGO_URI`, `JWT_SECRET`,
`URL_HIVEMQTT`, and `MQTT_PORT`). Rotate any credential that has ever been
posted in chat, screenshots, logs, or a public repository. Do not log values
from `process.env`, authorization headers, database URIs, or MQTT passwords.

The remaining literal URLs found in source are intentional: localhost
development fallbacks, same-origin discovery, documentation links, and public
social-sharing endpoints. Deployment-specific URLs must be supplied through
environment variables.
