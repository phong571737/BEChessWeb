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

The paste page is used to import or annotate game content through a PGN or notation-based workflow.

### `/played`

The played page surfaces historical or previously completed game sessions.

### `/played/review`

The review page is for deeper historical analysis and branch navigation.

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
