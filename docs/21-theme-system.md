# 21. Theme System

## Theme model

The repository uses the `next-themes` provider model, wrapped in [frontend/components/providers/theme-provider.tsx](../frontend/components/providers/theme-provider.tsx).

The app layout in [frontend/app/layout.tsx](../frontend/app/layout.tsx) mounts the provider stack globally so the rest of the UI can read a consistent theme context.

## Color-token strategy

The theme is driven by CSS variables declared in [frontend/app/globals.css](../frontend/app/globals.css):

- `--background`
- `--foreground`
- `--card`
- `--card-foreground`
- `--popover`
- `--popover-foreground`
- `--primary`
- `--primary-foreground`
- `--secondary`
- `--secondary-foreground`
- `--muted`
- `--muted-foreground`
- `--accent`
- `--accent-foreground`
- `--destructive`
- `--destructive-foreground`
- `--border`
- `--input`
- `--ring`

These variables are consumed by Tailwind utility classes through the configured color mapping.

## Dark-mode behavior

Dark mode is enabled through Tailwind class mode:

- `darkMode: ["class"]` in [frontend/tailwind.config.ts](../frontend/tailwind.config.ts)
- `.dark` variable overrides in [frontend/app/globals.css](../frontend/app/globals.css)

The app shell theme toggle in [frontend/components/layout/app-shell.tsx](../frontend/components/layout/app-shell.tsx) switches between light and dark using `resolvedTheme` from `next-themes`. It always renders one visible target-state icon: Moon in Light Mode and Sun in Dark Mode. This avoids a hidden or overlapping icon while retaining a small hover rotation and accessible label.

## Sidebar and board tokens

The theme variables also serve layout and board-specific surfaces:

- `--sidebar` and `--sidebar-border` for the left app shell canvas
- `--board-light` and `--board-dark` for standard chessboard square colors
- semantic status variables like `--state-white`, `--state-black`, and `--state-draw`

## Why this matters

This is not a custom theme engine. It is a CSS-variable-driven theme system that keeps style semantics stable across:

- app shell chrome
- board surfaces
- status and badge components
- dialogs, inputs, and accent areas

## Source-grounded summary

The theme system should be understood as:

1. Tailwind config enables class-based dark mode.
2. Global CSS declares semantic variables.
3. `next-themes` provides the runtime theme state.
4. UI components consume those variables through class names, not by setting inline theme values everywhere.
