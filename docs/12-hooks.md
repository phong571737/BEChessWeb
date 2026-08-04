# 12. Hooks

## Hook-layer role

The frontend relies on a small set of custom hooks to coordinate network reads, realtime subscriptions, and local state reconciliation.

The principal pattern is:

- hook fetches or subscribes,
- store is patched with new data,
- components render from the store.

## Key hooks

### `useActiveGames`

Responsible for:

- fetching the current game list from `/games/current`,
- refreshing the list on game creation or destruction,
- patching individual game cards when a move arrives,
- responding to socket events from the server.

This hook is mainly used by the home page and game card grid.

### `useGame(gameID)`

This is the most important runtime hook for the board page.

Responsibilities:

- fetch the current game definition from REST if not already in store,
- load the current board into a `Chess` instance,
- start polling `/games/:id/initcheck` until the board reports readiness,
- listen to WebSocket move events,
- compute the selected branch display PGN,
- expose restart and resign actions back to the UI.

This hook acts as the bridge between the REST API, the socket layer, and the board page UI.

Its REST requests are abortable on unmount or game change. The initialization poll keeps at most one request in flight, so a slow or unavailable backend cannot accumulate overlapping one-second requests.

### `usePhysicalBoards`

Responsible for:

- fetching the physical board list,
- reconciling board online/offline state,
- updating the store when a new board scan succeeds or a board goes offline.

Its 30-second refresh is also abortable and skips a new request while the previous refresh is still pending.

### `useStockfish`

Wraps the Stockfish worker for analysis-related UI behavior.

This is used as optional engine support for analyzing board position or evaluating move strength.

## Hook composition logic

The frontend is intentionally built around composable hooks rather than server-side page data loading. This keeps pages simple and allows the UI to remain reactive to live board events.

A common lifecycle is:

1. page mounts,
2. hook receives `gameID`,
3. hook reads the cached store,
4. hook fetches the latest game snapshot,
5. hook attaches socket listeners,
6. component renders state returned from the hook.

## Cross references

- [10-state-management.md](10-state-management.md) explains which store shapes these hooks patch.
- [11-components.md](11-components.md) describes the components that consume these hooks.
- [07-api-socket.md](07-api-socket.md) describes the socket events these hooks subscribe to.
## Restart and clock reset

`useGame` handles the room-scoped `game:reset` event by clearing browser move and branch data, returning the board to the starting FEN, and restarting init-check polling. The event carries the saved `initialTimeMs` and `incrementMs`, which `useChessClock` uses to reset both clocks without falling back to the default duration.

For every accepted move, `useChessClock` reads the active-color field of the authoritative post-move FEN. That side owns the running clock: after White's first move, the FEN turn is Black and only Black's clock starts. NFC/ESP snapshots are normalized server-side when a UCI move is present so a stale device-side FEN turn cannot reverse the active player or clock.

When the administrator updates `initialTimeMs` during a live game, `useChessClock` retains each clock's consumed time and adds or removes only the configured time difference. This update is persisted in session storage so a reload does not turn a partially used clock back into a full clock.
