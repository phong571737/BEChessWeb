# 23. Stateful UI Patterns

## Overview

Several UI surfaces are not purely decorative. They encode interactive state through classes that change when the game lifecycle or branch selection changes.

## Move table and branch logic

The PGN table in [frontend/components/board/pgn-table.tsx](../frontend/components/board/pgn-table.tsx) is a stateful review surface that reflects:

- the active move cursor
- hovered or selected branch
- branch-specific line rendering
- whether the move list is trailing a branch extension

Its visual state uses combinations of:

- `bg-accent`
- `font-semibold`
- `hover:bg-accent/70`
- `rounded-sm`
- `transition-colors`

## Branch picker UI

The branch picker uses a small pill and a dropdown panel:

- active branch button gets a tinted background and border in a lavender palette
- the drop-down has a soft filled background and subtle divider lines
- the selected branch line is emphasized with a visible vertical accent bar

This is one of the most visually distinct interactive areas in the UI and is intentionally more custom than the generic `ui` primitives.

## Board analysis states

The board and related review surfaces also encode state through control states such as:

- `loading` feedback with pulsing skeletons
- disabled board-card states
- error or warning accent borders for scan failures
- different hover and active affordances on candidate actions

## Match Analysis data state

The Move Review Match Analysis surface is derived from the selected history record's persisted `analysis.moves`. It recalculates classification totals whenever those saved Stockfish moves change, assigns White/Black by the one-based ply number, and renders the comparison as a grouped vertical bar chart. It does not reparse PGN/FEN to invent engine classifications. If no saved analysis exists, the summary is deliberately replaced with an empty state.

## Administrator game actions

The restart and resign controls in [frontend/components/board/game-actions.tsx](../frontend/components/board/game-actions.tsx) use the shared Button and Dialog primitives and expose each action's consequence before it is sent.

- The compact action buttons have press-scale feedback and animated icons.
- Restart uses a blue visual treatment; resign uses the destructive red treatment.
- The confirmation dialog has a semantic icon surface, a bordered header/footer, and a loading state that prevents duplicate submissions or accidental dismissal.
- Branch and resignation-side choices use selected borders, tinted backgrounds, a check indicator, and a short press-scale transition. White, black, and draw resignation choices use light, dark, and amber selected colors respectively.

These controls are shown to signed-in users; the backend accepts restart and resign from either authenticated role. Setup and History recycle-bin controls use the stricter `isAdmin` frontend check as well as backend authorization.

## Interaction tone

The visual language emphasizes:

- subtle elevation on hover
- minimal motion for everyday state changes
- strong enough contrast for branch and result differences
- consistency across repeated interaction components

## Source-grounded interpretation

This document should be understood as a map of how the frontend expresses runtime state through appearance. The actual state is still managed in the store and hooks; the visual layer only translates that state into a tangible interface signal.

## Multi-board evaluation and raw FEN review

When the board page is configured for two or four slots, each `BoardViewSlot`
owns its Stockfish worker, search state, evaluation bar, and suggestion toggle.
There is no global evaluation-bar switch in Settings; one board can be analysed
or hidden without changing another board. Its header
contains independent controls for the evaluation bar and best-move arrow.

The `FEN gốc` review source is deliberately different from recovered branches:
it renders the persisted `fenHistory` snapshots verbatim. It does not replay a
custom PGN, attach Stockfish classification markers, or show recovery notes.
Recovered branches continue to use the recovery service's legal move line and
may include branch metadata.
