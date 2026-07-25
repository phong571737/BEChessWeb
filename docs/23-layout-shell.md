# 23. Layout Shell

## Main shell

The global application layout is implemented in [frontend/components/layout/app-shell.tsx](../frontend/components/layout/app-shell.tsx).

It is responsible for:

- the desktop sidebar
- the mobile slide-over sidebar
- the sticky top header
- breadcrumb navigation
- account menu with identity and logout action
- settings menu for locale, theme, board-layout, orientation, and evaluation controls

## Sidebar structure

The sidebar is a responsive layout container with two display modes:

- expanded width: `220px`
- collapsed width: `64px`

It uses:

- `bg-[hsl(var(--sidebar))]`
- `border-[hsl(var(--sidebar-border))]`
- `transition-all duration-200`

The collapsed state keeps icon-only navigation, while the expanded state shows labels and the left-active-indicator accent.

## Header structure

The header is a sticky surface with:

- `h-14`
- `border-b border-border`
- `bg-background/80`
- `backdrop-blur-sm`

It includes:

- a mobile menu button
- a desktop collapse toggle
- a breadcrumb trail
- settings icon with locale, theme, and multi-board layout controls
- authenticated identity button; its logout action is disclosed only after the identity button is clicked

## Breadcrumb behavior

The breadcrumb trail uses dynamic path parsing to create a contextual label stack. It is derived from the current route and translated where the route string has a known label.

## Settings menu detail

The header keeps locale and theme controls in one Settings menu. It provides explicit English and Vietnamese choices plus explicit Light and Dark choices, marking the active selection with a check icon while retaining hydration-safe theme rendering.

The same menu contains the multi-board layout picker and board-display preferences. Flip board changes every rendered chessboard between White and Black orientation; Evaluation bar toggles the engine advantage bar without changing game data. Both preferences persist in browser storage.

Both the Settings and account menus close after a selection and when the user clicks outside their popover.

## Account menu detail

When authenticated, the header displays an identity icon and username without exposing a role label. Clicking it opens a small popover showing the username, email address, and an icon-labelled logout action; the menu closes before logout clears the authentication state.

## Overlay behavior

The mobile sidebar is opened by a fixed overlay dialog-like layer using:

- `bg-black/50`
- `backdrop-blur-sm`
- `z-50`

This keeps the shell coherent across desktop and mobile sizes.
