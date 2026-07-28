# 15. Navigation

## Navigation model

The UI is a small, task-oriented app with clear navigational boundaries:

- home dashboard
- board page
- import/paste page
- played history page
- review page

The primary navigation harness is the app shell in [frontend/components/layout/app-shell.tsx](../frontend/components/layout/app-shell.tsx).

## Navigation intent

The navigation structure is designed around a simple user story:

1. discover or create a current game,
2. open a board page to monitor or review it,
3. inspect historical results in the played workflow.

## Client-side navigation

The app uses the Next.js App Router and route-based navigation. A few interactions leverage router state and query parameters:

- the board page uses `gameID` from the query string,
- game cards route to the board page or review context,
- branch selection uses session storage for continuity.

## Layout-level responsibilities

The app shell provides a shared frame that includes:

- top-level navigation,
- theme toggle,
- language toggle,
- control header used on board-specific views.

This centralizes the cross-cutting UI concerns and reduces duplication across individual pages.

## Branch selection and review continuity

The app does not rely purely on route changes for branch context. Some branch state is persisted in session storage so a user can return to a selected branch without redoing the lookup.

This is a small but important UX decision because the app supports both active play and historical review.

## Cross references

- [13-pages.md](13-pages.md) identifies the major routes.
- [11-components.md](11-components.md) lists the layout and board components used by these routes.
- [12-hooks.md](12-hooks.md) shows how the hooks and store drive the navigation experience.
## Guide navigation

The sidebar includes `/guide`, and the Settings menu links to both the guide and `/downloads/TTLab_v1.1.apk`. The APK is a frontend static asset so users can download it without an API request. Vietnamese navigation uses short labels: `Dán` for `/paste` and `Hướng dẫn` for `/guide`; breadcrumbs use the same localized labels.
