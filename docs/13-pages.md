# 13. Pages

## Played history alignment

The table has a dedicated, aligned **Time control / Loại cờ** column. Blitz, rapid, and classical games use separate semantic badge colors; labels are localized through the shared locale files rather than embedded in the component.

The Played history table keeps the optional administrator action column after the duration column. Header and row cell ordering must remain identical so adding the recycle-bin icon never shifts the Date or Duration headers. Live snapshots with no final PGN result are retained in history and shown as **In progress** / **Chưa hoàn thành** once at least one ply has been accepted; setup/restart placeholders with zero plies are excluded from history. A finalized physical restart whose winner cannot be confirmed is shown separately as **Winner unconfirmed** / **Không xác nhận được bên thắng**, not as an active unfinished game. Completed results remain White win, Black win, or Draw. The view accepts both current `WhiteName`/`BlackName` records and legacy `White`/`Black` name fields. Administrators delete individual History rows by moving them to the recoverable trash; only the trash can can be permanently emptied with the localized **Delete all** / **Xóa toàn bộ** action and a separate destructive confirmation. Standard users never receive recycle-bin controls or retain loaded trash state, and the API rejects their direct deletion attempts.

When the administrator opens the recycle bin, an API/authentication failure is displayed explicitly. The UI must never represent an unavailable recycle bin as an empty one.

Moving a game to the recycle bin requires an explicit confirmation dialog. Recycle-bin rows retain and display both player names, the game date, and the move count so an administrator can identify and restore the intended game.
The recycle bin also provides a separately confirmed permanent-delete action; it applies only to records already in the bin and cannot be undone.

Move Review requests `/games/history/:id/recovered-pgn`. Its original source preserves `fenHistory` exactly and uses those snapshots to drive the board. The original source is always available from the history record: while recovery is loading or if the service fails, its notation falls back to the persisted `game.pgn` and its FEN navigation remains enabled. Each recovered branch is independent of that original timeline: the UI generates branch PGN from the recovered legal moves and rebuilds the branch board from that PGN. Original and recovered sources use the same full-width move-row layout. Recovery move rows show the compact labels `PADDED`, `Assumed`, and `duplicate clean {count} FEN`, derived from the service's move sources, `steps`, and `preprocessing` metadata. Persisted UCI and frontend inference are never used as a second recovery algorithm. If recovery is unavailable, times out, or exceeds the branch limit, the page keeps the original source visible and shows the corresponding localized error. The active move stays visible by automatically scrolling the move list. The review surface retains its standard page width while the move panel grows vertically to 420 pixels on smaller layouts and 520 pixels beside the board; its list remains independently scrollable. Move targets are larger, and the navigation controls use a 40-pixel height. Each original move row shows its persisted `moveDurationsMs` value; recovered steps use the service mapping and synthetic padding has no inferred duration. Legacy games without this field show an em dash. Stockfish marks appear only on the destination square to avoid duplicate icons. Review and history duration use persisted `durationSec`, with timestamp recovery only for older records that did not store it.

The Move Review panel follows a fixed vertical order: review header, navigation controls, compact branch/source selector, then the independently scrollable PGN move list. This keeps controls accessible even when recovery returns many branches.

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

The Start Game dialog includes an Excel import icon beside the player-name fields. Selecting a `.xlsx` pairing workbook parses the first worksheet in the browser without uploading the file. The importer maps column A (or a detected board header) to the board number, columns E and K to White and Black names, and reads the tournament title and scheduled time when present. Chess-Results exports may store the venue as a metadata line such as `Địa điểm: ...` in column A (for example cell A8); that header is mapped to the playing-location field too. A dedicated `Địa điểm`, `Location`, or `Venue` column is also supported. A localized row selector is shown when the workbook contains multiple pairings; choosing a row fills the board, player names, and optional location. Missing names remain editable, while location, round, and time-control fields stay available for manual confirmation. Invalid workbooks produce a localized validation message.

The same Excel picker is available in the in-game **Cài đặt trận / Game settings** dialog, so an administrator can replace the names of an active board by selecting another pairing without leaving the board page. The start-game and live-game settings dialogs share one base-clock option list, including the 45-minute tournament choice.

### `/dashboard`

The administrator dashboard summarizes retained history for a selectable 7- or 30-day window. It shows total, active, completed, and duration metrics; board and player activity; result distribution; and a daily game chart. It derives data from the existing history and board endpoints without treating browser metrics as durable game truth. The page is available only in the administrator UI and uses the shared semantic theme tokens.

### `/board`

The board page is the main interactive experience for gameplay and game state review. Its evaluation bar uses the same `sm` breakpoint as the board/control-panel grid, so any viewport that can show the main two-column layout keeps the bar vertically beside the board; the horizontal bar is reserved for phones. In split-board mode, each board card displays its own countdown (60:00 + 15 seconds by default), centered White-vs-Black names in the header, and the player order and active clock follow that card's flip setting. Split-board mode also works on phones: the direct two-board selection gesture first requests fullscreen and then locks the Screen Orientation API to landscape, preserving the two-column grid. Browsers that do not expose or permit orientation locking keep the layout usable and show a localized instruction to rotate the phone manually. Returning to one board releases the orientation lock and exits fullscreen when the application entered it. Each compact board keeps flip, evaluation, and suggestion controls in a per-board settings menu; selecting an action closes that menu. Changing the layout mode from the application settings applies the default board slots and closes the settings menu immediately. Selecting the already-active layout keeps its slot picker available, and that picker closes after applying a new board selection. An administrator can open the game settings during any live state to update player names, time control, increment, round, or location. Changing the base time preserves elapsed clock time by applying only the configured-time difference to both clocks; finished and ended games do not expose this control.

For split-board player placement, an unflipped board renders Black's name and clock above the board and White's below it. Flipping an individual board reverses both player edges together with the rendered pieces, while the active-clock highlight continues to follow the matching side.

It consumes the `gameID` query parameter and loads the corresponding live data through the `useGame` hook.

### `/paste`

The paste page has separate UCI and FEN input cards. UCI tokens are parsed locally; the dedicated FEN card sends one position per line to `POST /games/recover` with strict recovery enabled, so it uses only the internal `recover-service` algorithm and reports when that service is unavailable. The general API retains a local fallback for game finalization. Its layout follows the application page standard: a compact bordered hero header, a localized three-step workflow strip, a centered `max-w-7xl` content area, and shared background/card/border/primary tokens. The input and preview cards stack on phones and become a two-column layout from the `lg` breakpoint; the preview column remains visible while scrolling on desktop. Every container, grid item, and card is explicitly shrinkable (`min-w-0`) so long controls cannot force horizontal overflow. The import, preview, copy, download, and branch-selection behavior remains unchanged.

The guide page at `/guide` gives the physical-board onboarding sequence: open the website, download the Android companion APK, use that app (not the phone camera) to scan the board QR code, enter the Wi-Fi password to connect the board, then verify the starting pieces and physical button. The board-status/button setup details are shown only to authenticated users.

### `/played`

The played page surfaces historical game sessions, including live snapshots that have moves but are not yet completed. Its client-side filters cover player name, physical board, location, inclusive date range, result, completed/unfinished status, and game type (Blitz, Rapid, or Classical). Every filter uses the same label/control height in a responsive four-column grid so the form remains aligned at desktop sizes and collapses cleanly on smaller screens.

The review index route (`/played/review`) is a guard for malformed or legacy links without a game ID and redirects back to `/played`; individual reviews always use `/played/review/[id]`.

The History table uses a compact `920px` minimum width, matching its column budget so common laptop layouts do not show a needless horizontal scrollbar. Smaller viewports still scroll the table horizontally when required.

Active boards, History rows, and Review headers show the derived time-control badge using the FIDE 60-move equivalent (`initial time + 60 × increment`): `Blitz`/`Cờ chớp` through 10 minutes, `Rapid`/`Cờ nhanh` above 10 and below 60 minutes, and `Classical`/`Cờ tiêu chuẩn` from 60 minutes. Stored labels remain a fallback only for legacy records without clock metadata; otherwise the frontend and backend recompute the classification from `initialTimeMs` and `incrementMs`. Move Review can independently show or hide a responsive evaluation bar driven by the selected ply's saved Stockfish score. Its persisted preference is separate from the live Board evaluation setting.

### `/played/review`

The review page is for deeper historical analysis and branch navigation. Its Match Analysis section reads the saved Stockfish move analysis and summarizes Brilliant, Best, Excellent, Good, Inaccuracy, Mistake, and Blunder classifications by side. It does not label capture/check counters as engine analysis; an unanalyzed game displays an empty state until Stockfish results are saved. Move Review requests `GET /games/history/:id/recovered-pgn`; the original source navigates the returned FEN snapshots, while every recovered candidate is treated as a new PGN-backed board line that need not match the original timeline one-for-one. The source header uses one compact native selector with a source count rather than rendering every recovery branch as a button; even a large candidate set therefore cannot displace the move list, PGN, or navigation controls. The full PGN presentation pairs both plies beneath one conventional move number (`1. e4 e5`). If a recovery step has multiple compatible candidates, the move row shows a branch control and the user can select a candidate. Recovery rows annotate generated and collapsed observations with text such as `f5 (PADDED)`, `e4 (Assumed)`, and `e4 (duplicate clean 3 FEN)`. FEN-only review entries render on their own row. Authenticated users can run Stockfish analysis, which follows FEN snapshots first, then UCI plus the saved initial FEN, before attempting standard PGN; custom UCI notation is never parsed as PGN. Unreconstructable plies are saved as localized unavailable rows, while scoreless points are omitted from the advantage chart. The FEN Timeline keeps its native disclosure icon, has a larger heading, and same-row localized Copy FEN and Download as text file actions. Download calls `GET /games/history/:id/fen-text`, which returns a recovery-service-compatible numbered text timeline with the record ID and starting FEN headers. All recovery-related HTTP routes are defined in `backend/src/routes/recover.router.ts`. The login form includes an accessible icon-only control to show or hide the password. Empty or partial histories display an empty state instead of zero-filled broken charts.

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
