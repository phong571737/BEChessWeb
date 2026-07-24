# 20 — Styling System

---

## Framework

The frontend styling stack is based on:

- Tailwind CSS 3.4.19
- `class-variance-authority` (CVA) for reusable component variants
- `next-themes` for light/dark mode switching

This is the actual implementation present in the repo's frontend package and the global CSS token layer.

---

## Dark / light theme

Theme switching is managed by `next-themes`. The theme class is applied to the root document, and the design system is driven by CSS variables declared in [frontend/app/globals.css](../frontend/app/globals.css).

```css
/* Light mode (default) */
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 240 5.9% 10%;
  --radius: 0.375rem;
}

/* Dark mode */
.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --card: 240 8% 5.5%;
  --card-foreground: 0 0% 98%;
  --popover: 240 8% 5.5%;
  --popover-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 5.9% 10%;
  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 3.7% 13%;
  --muted-foreground: 240 5% 60%;
  --accent: 240 3.7% 13%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 3.7% 13%;
  --input: 240 3.7% 13%;
  --ring: 240 4.9% 83.9%;
}
```

Tailwind maps these CSS variables in [frontend/tailwind.config.ts](../frontend/tailwind.config.ts):

```ts
const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
      },
    },
  },
  plugins: [],
}
```

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

Board squares use explicit inline hex colors in the board component rather than Tailwind utility classes.

| Square type | Color |
|---|---|
| Light squares | `#e8e8e8` |
| Dark squares | `#7b6040` |
| Last move highlight | `rgba(236, 243, 116, 0.75)` |
| Board border | `hsl(var(--border))` |

This is visible in [frontend/components/board/chess-board-view.tsx](../frontend/components/board/chess-board-view.tsx) and [frontend/components/home/game-card.tsx](../frontend/components/home/game-card.tsx) where `react-chessboard` is handed `customDarkSquareStyle`, `customLightSquareStyle`, and `customSquareStyles`.

---

## Tailwind config highlights

The repo's Tailwind configuration is intentionally small:

```ts
// frontend/tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
      },
    },
  },
  plugins: [],
}
```

This means the visual system is mostly driven by the global CSS variable file rather than by a large Tailwind extension map.

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
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
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
