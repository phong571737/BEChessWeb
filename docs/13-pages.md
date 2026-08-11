# 13. Pages

## Played history alignment

The table has a dedicated, aligned **Time control / Loại cờ** column. Blitz, rapid, and classical games use separate semantic badge colors; labels are localized through the shared locale files rather than embedded in the component.

The Played history table keeps the optional administrator action column after the duration column. Header and row cell ordering must remain identical so adding the recycle-bin icon never shifts the Date or Duration headers. Live snapshots with no final PGN result are retained in history and shown as **In progress** / **Chưa hoàn thành** once at least one ply has been accepted; setup/restart placeholders with zero plies are excluded from history. A finalized physical restart whose winner cannot be confirmed is shown separately as **Winner unconfirmed** / **Không xác nhận được bên thắng**, not as an active unfinished game. Completed results remain White win, Black win, or Draw. The view accepts both current `WhiteName`/`BlackName` records and legacy `White`/`Black` name fields. Administrators delete individual History rows by moving them to the recoverable trash; only the trash can can be permanently emptied with the localized **Delete all** / **Xóa toàn bộ** action and a separate destructive confirmation. Standard users never receive recycle-bin controls or retain loaded trash state, and the API rejects their direct deletion attempts.

When the administrator opens the recycle bin, an API/authentication failure is displayed explicitly. The UI must never represent an unavailable recycle bin as an empty one.

Moving a game to the recycle bin requires an explicit confirmation dialog. Recycle-bin rows retain and display both player names, the game date, and the move count so an administrator can identify and restore the intended game.
The recycle bin also provides a separately confirmed permanent-delete action; it applies only to records already in the bin and cannot be undone.

Move Review requests `/games/history/:id/recovered-pgn` and uses the `recover_service` PGN for both the move list and PGN notation. The persisted FEN timeline remains authoritative for board positions, including custom or partially legal physical-board games. If the sidecar is unavailable, the existing local renderer remains a compatibility fallback for legacy records. The active move stays visible by automatically scrolling the move list. Review and history duration use persisted `durationSec`, with timestamp recovery only for older records that did not store it.

## Page model

The frontend uses the Next.js App Router. Page entry points live under [frontend/app](../frontend/app).

The page tree is organized around the product’s primary user journeys:

- home
- board view
- paste/import view
- played history view
- review page

## Primary route map

### `/`

The home page renders the dashboard of active games and provides an entry point for creating or opening a game session.

### `/dashboard`

The administrator dashboard summarizes retained history for a selectable 7- or 30-day window. It shows total, active, completed, and duration metrics; board and player activity; result distribution; and a daily game chart. It derives data from the existing history and board endpoints without treating browser metrics as durable game truth. The page is available only in the administrator UI and uses the shared semantic theme tokens.

### `/board`

The board page is the main interactive experience for gameplay and game state review. An administrator can open the game settings during any live state to update player names, time control, increment, round, or location. Changing the base time preserves elapsed clock time by applying only the configured-time difference to both clocks; finished and ended games do not expose this control.

It consumes the `gameID` query parameter and loads the corresponding live data through the `useGame` hook.

### `/paste`

The paste page has separate UCI and FEN input cards. UCI tokens are parsed locally; the dedicated FEN card sends one position per line to `POST /games/recover` with strict recovery enabled, so it uses only the internal `recover-service` algorithm and reports when that service is unavailable. The general API retains a local fallback for game finalization. Its layout follows the application page standard: a compact bordered hero header, a localized three-step workflow strip, a centered `max-w-7xl` content area, and shared background/card/border/primary tokens. The input and preview cards stack on phones and become a two-column layout from the `lg` breakpoint; the preview column remains visible while scrolling on desktop. Every container, grid item, and card is explicitly shrinkable (`min-w-0`) so long controls cannot force horizontal overflow. The import, preview, copy, download, and branch-selection behavior remains unchanged.

The guide page at `/guide` gives the physical-board onboarding sequence: open the website, download the Android companion APK, use that app (not the phone camera) to scan the board QR code, enter the Wi-Fi password to connect the board, then verify the starting pieces and physical button. The board-status/button setup details are shown only to authenticated users.

### `/played`

The played page surfaces historical game sessions, including live snapshots that have moves but are not yet completed. Its client-side filters cover player name, physical board, location, inclusive date range, result, completed/unfinished status, and minimum/maximum ply count. Every filter uses the same label/control height in a responsive four-column grid so the form remains aligned at desktop sizes and collapses cleanly on smaller screens.

The review index route (`/played/review`) is a guard for malformed or legacy links without a game ID and redirects back to `/played`; individual reviews always use `/played/review/[id]`.

The History table uses a compact `920px` minimum width, matching its column budget so common laptop layouts do not show a needless horizontal scrollbar. Smaller viewports still scroll the table horizontally when required.

Active boards, History rows, and Review headers show the derived time-control badge: `Blitz`/`Cờ chớp` for up to 10 minutes, `Rapid`/`Cờ nhanh` above 10 and below 60 minutes, and `Classical`/`Cờ tiêu chuẩn` from 60 minutes. The backend persists this classification with each game and remains authoritative for legacy records.

### `/played/review`

The review page is for deeper historical analysis and branch navigation. Its Match Analysis section recalculates when the loaded game changes and derives charts from the persisted PGN, UCI history, or FEN snapshot history. Move Review requests `GET /games/history/:id/recovered-pgn`, and both the move list and PGN notation use the Python `recover-service` result whenever FEN snapshots exist; the persisted FEN timeline remains authoritative for board positions. If a recovery step has multiple compatible candidates, the move row shows a branch control and the user can select a candidate; a complete matching recovery line then replaces the PGN and FEN sequence used by the board. FEN-only review entries render on their own row. Authenticated users can run Stockfish analysis, which follows FEN snapshots first, then UCI plus the saved initial FEN, before attempting standard PGN; custom UCI notation is never parsed as PGN. Unreconstructable plies are saved as localized unavailable rows, while scoreless points are omitted from the advantage chart. The FEN Timeline keeps its native disclosure icon, has a larger heading, and same-row localized Copy FEN and Download as text file actions. Download calls `GET /games/history/:id/fen-text`, which returns a recovery-service-compatible numbered text timeline with the record ID and starting FEN headers. All recovery-related HTTP routes are defined in `backend/src/routes/recover.router.ts`. The login form includes an accessible icon-only control to show or hide the password. Empty or partial histories display an empty state instead of zero-filled broken charts.

## Page layout behavior

The pages are lightweight orchestrators. They do not contain most of the product logic themselves. Instead, they mostly:

- read route parameters,
- compose the layout shell,
- mount the relevant components,
- let hooks and the store supply the dynamic state.

This is a strong indicator of the project’s UI philosophy: pages are thin assembly points, not stateful containers.

## App router structure

Each page has its own directory under `frontend/app`, often paired with a `layout.tsx` file that defines page-level shell composition.

For example:

- `app/page.tsx` – home
- `app/board/page.tsx` – live board page
- `app/paste/page.tsx` – import workflow
- `app/played/page.tsx` – played history dashboard

## Cross references

- [11-components.md](11-components.md) lists the reusable components mounted by these pages.
- [12-hooks.md](12-hooks.md) explains the hooks used to load state into those pages.
- [15-navigation.md](15-navigation.md) explains how the layout and navigation fit together at runtime.
