# 23. Layout Shell

## Main shell

The global application layout is implemented in [frontend/components/layout/app-shell.tsx](../frontend/components/layout/app-shell.tsx).

It is responsible for:

- the desktop sidebar
- the mobile slide-over sidebar
- the sticky top header
- breadcrumb navigation
- locale switching
- theme toggling

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
- locale switch control
- theme toggle button

## Breadcrumb behavior

The breadcrumb trail uses dynamic path parsing to create a contextual label stack. It is derived from the current route and translated where the route string has a known label.

## Theme switcher detail

The theme button uses two icon layers:

- `Sun` for the light state
- `Moon` for the dark state

The icon transitions are driven by Tailwind dark-mode classes:

- `dark:-rotate-90 dark:scale-0`
- `dark:rotate-0 dark:scale-100`

## Overlay behavior

The mobile sidebar is opened by a fixed overlay dialog-like layer using:

- `bg-black/50`
- `backdrop-blur-sm`
- `z-50`

This keeps the shell coherent across desktop and mobile sizes.
