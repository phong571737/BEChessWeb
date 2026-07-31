# 13. Pages

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

### `/board`

The board page is the main interactive experience for gameplay and game state review.

It consumes the `gameID` query parameter and loads the corresponding live data through the `useGame` hook.

### `/paste`

The paste page is used to convert UCI move input to PGN and review generated branches. Its layout follows the application page standard: a compact bordered page header, a centered `max-w-7xl` content area, and shared background/card/border/primary tokens. The input and preview cards stack through phone, tablet, and standard desktop widths, then become matched-height columns only on wide screens where the app sidebar still leaves adequate room. Every container, grid item, and card is explicitly shrinkable (`min-w-0`) so long controls cannot force content beneath the shell's clipped edge. Compact controls, shorter mobile input/output areas, wrapping actions, and adaptive preset cards prevent horizontal overflow. The import, preview, copy, download, and branch-selection behavior remains unchanged.

The guide page at `/guide` gives the physical-board onboarding sequence: open the website, download the Android companion APK, use that app (not the phone camera) to scan the board QR code, enter the Wi-Fi password to connect the board, then verify the starting pieces and physical button. The board-status/button setup details are shown only to authenticated users.

### `/played`

The played page surfaces historical or previously completed game sessions.

### `/played/review`

The review page is for deeper historical analysis and branch navigation. Its Match Analysis section recalculates when the loaded game changes and derives charts from the persisted PGN, UCI history, or FEN snapshot history. PGN notation is rebuilt from UCI for legacy header-only records, including the standard Event/Site/Date/Round/White/Black/Result headers; missing UCI tokens fall back to a FEN diff and are displayed as `x` when still unknown. FEN-only review entries render on their own row. The FEN Timeline has a larger expandable heading and a same-row copy action that copies the complete numbered timeline. Empty or partial histories display an empty state instead of zero-filled broken charts.

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
