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

The paste page is used to convert UCI move input to PGN and review generated branches. Its layout follows the application page standard: a compact bordered page header, a centered `max-w-7xl` content area, responsive two-column cards, and shared background/card/border/primary tokens. Presets show their selected state, while matched-height input and preview panels give the import workflow a clear visual rhythm. The import, preview, copy, download, and branch-selection behavior remains unchanged.

### `/played`

The played page surfaces historical or previously completed game sessions.

### `/played/review`

The review page is for deeper historical analysis and branch navigation. Its Match Analysis section recalculates when the loaded game changes and derives charts from the persisted PGN, UCI history, or FEN snapshot history. PGN notation is rebuilt from UCI for legacy header-only records, including the standard Event/Site/Date/Round/White/Black/Result headers; missing UCI tokens fall back to a FEN diff and are displayed as `x` when still unknown. FEN-only review entries render on their own row. Empty or partial histories display an empty state instead of zero-filled broken charts.

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
