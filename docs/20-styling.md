# 20 — Styling System

---

## Framework

The frontend styling stack is based on:

- Tailwind CSS 3.4.19
- `class-variance-authority` (CVA) for reusable component variants
- `next-themes` for root theme-class management

This is the actual implementation present in the repo's frontend package and the global CSS token layer.

---

## Light and dark visual themes

The application supports both Light Mode and Dark Mode through `next-themes`. The existing switcher changes the root `dark` class immediately; `disableTransitionOnChange` prevents an unwanted palette transition during the switch. All values are defined centrally in [frontend/app/globals.css](../frontend/app/globals.css) as HSL tokens, which preserves Tailwind opacity modifiers such as `bg-primary/10`.

| Token group | Light palette | Dark palette | Purpose |
| --- | --- | --- |
| Canvas | `#f7f8fc`, soft blue-gray | `#111111`, `#171717` | Application and secondary backgrounds |
| Surfaces | `#ffffff`, `#f3f4f6` | `#1c1c1c`, `#242424` | Cards, popovers, hover states, and dialogs |
| Text | `#1f2430`, `#72798b` | `#f5f5f5`, `#a3a3a3` | Primary and muted text |
| Primary | `#6757f5` → `#5847e8` | `#f5b800` → `#d99f00` | Primary actions, focus ring, and selected emphasis |
| Accent | `#6d5dfc` → `#5b4be8` | `#6d5dfc` → `#5b4be8` | Supporting accent states |
| Status | green, amber, red, sky | green, amber, red, sky | Success, warning, error, and info feedback |

Tailwind exposes these central values as semantic utilities through [frontend/tailwind.config.ts](../frontend/tailwind.config.ts), including `bg-surface`, `bg-surface-hover`, `text-foreground-muted`, `bg-primary`, `bg-accent`, `bg-success`, `bg-warning`, `bg-info`, and the branch-menu tokens used by the move table. Shared Button, Card, Input, Dialog, Navbar, and Sidebar components consume these semantic tokens rather than page-specific color values. Ghost and outline button hover states retain `text-foreground`, ensuring icons remain legible over both light and dark hover surfaces.

---

## Font system

The repository does not currently use a self-hosted Aptos font pipeline. The actual frontend layout in [frontend/app/layout.tsx](../frontend/app/layout.tsx) only applies the default HTML/body structure and wraps the page with providers.

So the effective font behavior is:

- `font-sans` → the browser/system sans stack provided by Tailwind
- `font-mono` → the default monospace stack used for move notation and small technical labels

In practice, the repo relies on the Tailwind default font family behavior rather than a custom local-font import.

---

## CSS variable: `--header-h`

The shared header height token is declared in [frontend/app/globals.css](../frontend/app/globals.css) as:

```css
--header-h: 56px;
```

It is consumed by UI layout and board viewport sizing logic, especially in [frontend/components/board/board-view-slot.tsx](../frontend/components/board/board-view-slot.tsx), where the page uses the header height in `calc(100vh - var(--header-h))`-style layout calculations.

---

## Chess board colors

Board squares read CSS custom properties so they adapt with the current theme without duplicating component styles.

| Square type | Color |
|---|---|
| Light squares | `--board-light` (`#e8e8e8` light / `#d8c8a2` dark) |
| Dark squares | `--board-dark` (`#7b6040` light / `#6d5136` dark) |
| Last move highlight | `rgba(245, 184, 0, 0.50)` |
| Board border | `hsl(var(--border))` |

This is visible in [frontend/components/board/chess-board-view.tsx](../frontend/components/board/chess-board-view.tsx) and [frontend/components/home/game-card.tsx](../frontend/components/home/game-card.tsx), where `react-chessboard` receives `var(--board-dark)` and `var(--board-light)` for its square styles.

---

## Tailwind config highlights

The Tailwind configuration maps the global semantic tokens for backgrounds, surfaces, foreground tiers, cards, popovers, primary/secondary/accent actions, destructive feedback, and success/warning/info status. The visual system remains token-driven: individual pages should prefer semantic utilities such as `bg-card`, `bg-surface`, `text-foreground-muted`, and `border-border` over literal colors.

---

## Component variant pattern (CVA)

The reusable component variant system is implemented in the UI primitives under [frontend/components/ui](../frontend/components/ui).

Example from [frontend/components/ui/button.tsx](../frontend/components/ui/button.tsx):

```ts
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/85",
        outline: "border border-input bg-background hover:bg-surface-hover hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-surface-hover hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-4 py-2",
        sm: "h-7 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)
```

The badge component in [frontend/components/ui/badge.tsx](../frontend/components/ui/badge.tsx) adds special variants such as `white`, `black`, and `draw` for status/result display.

---

## Responsive breakpoints

The project uses the standard Tailwind breakpoint scale.

| Prefix | Min width |
|---|---|
| `sm:` | 640 px |
| `md:` | 768 px |
| `lg:` | 1024 px |
| `xl:` | 1280 px |

This is visible in board and home layouts where the UI switches from single-column mobile arrangements to multi-column desktop composition.
