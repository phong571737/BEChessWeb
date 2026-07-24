# 27. Animation and Motion

## Motion philosophy

The frontend uses restrained motion to reinforce state changes rather than to create a heavy animation system.

Most motion is expressed through:

- `transition-*` classes
- `animate-pulse` for skeleton placeholders
- `animate-spin` for loading indicators
- `duration-*` timing values for hover and panel state transitions

## Reusable motion patterns

### Hover and elevation

Components such as game cards and action buttons use small motion cues:

- `transition-all duration-150`
- `hover:-translate-y-px`
- `hover:shadow-md`
- `hover:shadow-sm`

These are used to emphasize that a control is clickable without introducing large visual movement.

### Expand/collapse and status changes

The app shell, board layout controls, and other shells rely on `transition-all duration-200` or similar timing to animate sidebar collapse and panel state shifts.

### Eval bar animation

The evaluation bar in [frontend/components/board/eval-bar.tsx](../frontend/components/board/eval-bar.tsx) uses animated width or height transitions:

- `transition-[width] duration-500 ease-out` for horizontal layouts
- `transition-[height] duration-500 ease-out` for vertical layouts

This mirrors the “live scoreboard” feeling expected from analytical chess UI.

### Loading animation

The repository uses `animate-pulse` in multiple loading states, especially for:

- board placeholders
- game cards during layout measurement
- skeleton-style content surfaces

## Ripple button behavior

There is an additional ripple-button system in [frontend/components/ui/ripple-button.tsx](../frontend/components/ui/ripple-button.tsx). It uses a custom `animate-rippling` class and a CSS-defined ripple effect.

## Motion summary

The motion system is deliberately modest:

1. use transitions to clarify interactivity
2. use pulse and spin for feedback while content is loading
3. avoid large animation libraries or complex choreography
4. keep the board review experience visually stable and predictable
