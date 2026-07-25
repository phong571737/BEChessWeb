# 23. Layout Shell

## Main shell

The global application layout is implemented in [frontend/components/layout/app-shell.tsx](../frontend/components/layout/app-shell.tsx).

It is responsible for:

- the desktop sidebar
- the mobile slide-over sidebar
- the sticky top header
- breadcrumb navigation
- account menu and logout action
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
- authenticated username button; its logout action is disclosed only after the username is clicked

## Breadcrumb behavior

The breadcrumb trail uses dynamic path parsing to create a contextual label stack. It is derived from the current route and translated where the route string has a known label.

## Theme switcher detail

The theme button always shows one visible target-state icon: Moon while the current theme is light and Sun while it is dark. This prevents hidden or overlapping icon layers and keeps the action clear on hover.

## Account menu detail

When authenticated, the header displays the username rather than an always-visible logout control. Clicking the username opens a small popover menu containing the logout button; the menu closes before logout clears the authentication state.

## Overlay behavior

The mobile sidebar is opened by a fixed overlay dialog-like layer using:

- `bg-black/50`
- `backdrop-blur-sm`
- `z-50`

This keeps the shell coherent across desktop and mobile sizes.
