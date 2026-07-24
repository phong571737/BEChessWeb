# 26. Typography

## Typography source

The typography system is defined in [frontend/app/globals.css](../frontend/app/globals.css) through CSS variables rather than hard-coded repeated type declarations.

The repository uses the following scale:

- `--fs-xs = 0.8125rem` (13px)
- `--fs-sm = 0.875rem` (14px)
- `--fs-base = 0.9375rem` (15px)
- `--fs-lg = 1.0625rem` (17px)
- `--fs-xl = 1.1875rem` (19px)

The app body also sets a base line-height of `1.55` and a letter-spacing of `0.005em`.

## Where typography is applied

The body font stack is shared by the base layer in [frontend/app/globals.css](../frontend/app/globals.css):

- `font-sans`
- `text-foreground`
- `font-size: var(--fs-base)`

Additional components use explicit small and mono styling for:

- move list text
- branch annotation labels
- evaluation values
- card metadata

## Mono and tabular uses

The move table in [frontend/components/board/pgn-table.tsx](../frontend/components/board/pgn-table.tsx) uses:

- `font-mono`
- `tabular-nums`

This helps keep SAN notation and elapsed time values visually aligned and easy to scan.

## Text helper convention

The repository adds a single utility override for `text-sm` in [frontend/app/globals.css](../frontend/app/globals.css):

- `font-size: var(--fs-sm)`
- `line-height: 1.35rem`

This means the typography system is intentionally compact and centered on a few consistent text sizes rather than a large set of bespoke classes.

## Design effect

The typography style is meant to feel:

- dense but readable
- technical and board-oriented
- consistent across controls and move lists
