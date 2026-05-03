# 17 — Styling System

---

## Framework

**Tailwind CSS 3.4.17** + `class-variance-authority` (CVA) for component variants.

---

## Dark / light theme

Managed by `next-themes`. The theme class (`dark` or `light`) is applied to `<html>`. All colors use CSS variables defined in `app/globals.css`:

```css
/* Light mode (default) */
:root {
  --background:   0 0% 100%;
  --foreground:   222.2 84% 4.9%;
  --card:         0 0% 100%;
  --border:       214.3 31.8% 91.4%;
  --muted:        210 40% 96.1%;
  --accent:       210 40% 96.1%;
  --primary:      222.2 47.4% 11.2%;
  /* ... full Shadcn variable set */
}

/* Dark mode */
.dark {
  --background:   222 47% 6%;
  --foreground:   210 40% 96%;
  --card:         217 33% 10%;
  --border:       217 33% 17%;
  --muted:        218 31% 12%;
  --accent:       217 33% 17%;
  /* ... */
}
```

Tailwind maps these via `tailwind.config.ts`:

```ts
colors: {
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  border:     "hsl(var(--border))",
  muted:      { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
  // etc.
}
```

---

## Font — Aptos

Self-hosted from `client/public/fonts/aptos/`. Loaded via `next/font/local` in `app/layout.tsx`:

```ts
const aptos = localFont({
  src: [
    { path: "../public/fonts/aptos/Aptos-Regular.ttf",    weight: "400", style: "normal" },
    { path: "../public/fonts/aptos/Aptos-Bold.ttf",       weight: "700", style: "normal" },
    { path: "../public/fonts/aptos/Aptos-Italic.ttf",     weight: "400", style: "italic" },
    { path: "../public/fonts/aptos/Aptos-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-aptos",
  display:  "swap",
});
```

Applied to `<html>` via `className={aptos.variable}`.

Mapped in `tailwind.config.ts`:

```ts
fontFamily: {
  sans: ["var(--font-aptos)", "Aptos", "system-ui", "sans-serif"],
  mono: ["ui-monospace", "Consolas", "monospace"],
}
```

`font-sans` (default body font) → Aptos.  
`font-mono` → system monospace (used for PGN display, FEN strings, terminal-style headers).

---

## CSS variable: `--header-h`

Defined in the navbar component. Set on `:root` to the actual rendered navbar height. Used throughout for viewport-minus-navbar calculations:

```css
/* Set by Navbar component */
:root { --header-h: 56px; }
```

Used in:
```ts
// Board page wrapper max height:
"max-w-[min(92vw,calc(100vh-var(--header-h)-170px),920px)]"

// Eval bar height:
"h-[min(calc(100vh-var(--header-h)-140px),840px)]"
```

---

## Chess board colors

Board squares use inline hex values (not Tailwind classes):

| Square type | Color |
|---|---|
| Light squares | `#e8e8e8` |
| Dark squares | `#7b6040` |
| Last move highlight | `rgba(236, 243, 116, 0.75)` (yellow, 75% opacity) |
| Board border | `hsl(var(--border))` |

Set via `react-chessboard` props in `<ChessBoardView>`:

```ts
customDarkSquareStyle  = {{ backgroundColor: "#7b6040" }}
customLightSquareStyle = {{ backgroundColor: "#e8e8e8" }}
customBoardStyle       = {{ borderRadius: "2px", border: "1px solid hsl(var(--border))" }}
customSquareStyles     = { [lastMove.from]: { background: "rgba(236,243,116,0.75)" },
                           [lastMove.to]:   { background: "rgba(236,243,116,0.75)" } }
```

---

## Tailwind config highlights

```ts
// tailwind.config.ts
module.exports = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: { sm: "calc(var(--radius) - 4px)", ... },
      fontFamily: {
        sans: ["var(--font-aptos)", "Aptos", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "Consolas", "monospace"],
      },
      // colors mapped to CSS variables (see above)
    },
  },
  plugins: [require("tailwindcss-animate")],
};
```

---

## Component variant pattern (CVA)

Used by Shadcn UI components like `<Button>` and `<Badge>`:

```ts
const buttonVariants = cva(
  "inline-flex items-center justify-center ...",
  {
    variants: {
      variant: {
        default:   "bg-primary text-primary-foreground ...",
        outline:   "border border-input ...",
        ghost:     "hover:bg-accent ...",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm:      "h-8 px-3 text-xs",
        icon:    "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);
```

`<Badge>` has custom variants `white`, `black`, `draw` for game result display.

---

## Responsive breakpoints

Standard Tailwind:

| Prefix | Min width |
|---|---|
| `sm:` | 640 px |
| `md:` | 768 px |
| `lg:` | 1024 px |
| `xl:` | 1280 px |

Board page uses `lg:` to switch from single-column (mobile) to three-column (board + eval bar + panel) layout.
