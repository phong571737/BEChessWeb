# 22. Visual Primitives

## Purpose

The shared primitive layer lives under [frontend/components/ui](../frontend/components/ui). These components provide the visual vocabulary used in the rest of the app.

## Button primitive

Defined in [frontend/components/ui/button.tsx](../frontend/components/ui/button.tsx), the button is generated with `class-variance-authority`.

Included variants:

- `default`
- `destructive`
- `outline`
- `secondary`
- `ghost`
- `link`

Included sizes:

- `default`
- `sm`
- `lg`
- `icon`

The base class includes:

- rounded corners
- centered content layout
- focus-visible ring styling
- disabled opacity handling
- SVG sizing alignment

## Badge primitive

Defined in [frontend/components/ui/badge.tsx](../frontend/components/ui/badge.tsx), the badge component is also CVA-based.

Variants include:

- `default`
- `secondary`
- `destructive`
- `outline`
- `white`
- `black`
- `draw`

This is the main primitive for state/result chips and tinted status labels.

## Card primitive

In [frontend/components/ui/card.tsx](../frontend/components/ui/card.tsx), the card is a structural shell with:

- `rounded-sm`
- `border`
- `bg-card`
- `text-card-foreground`
- helper subcomponents such as `CardHeader`, `CardTitle`, `CardContent`, and `CardFooter`

This makes playlists, dialogs, and feature summary surfaces visually consistent.

## Dialog primitive

Defined in [frontend/components/ui/dialog.tsx](../frontend/components/ui/dialog.tsx), the dialog system uses Radix primitives and applies:

- a dark overlay with `backdrop-blur-sm`
- centered content with a max width of `max-w-2xl`
- `border`, `bg-background`, and `rounded` surface treatment
- close button emphasis via opacity and ring focus treatment

## Input primitive

The input primitive in [frontend/components/ui/input.tsx](../frontend/components/ui/input.tsx) gives the app standard form treatment:

- `h-9`
- `rounded-md`
- `border border-input`
- `bg-transparent`
- `px-3 py-1`
- `shadow-sm`
- `focus-visible:ring-1`

## Skeleton and scroll primitives

The repository also includes:

- [frontend/components/ui/skeleton.tsx](../frontend/components/ui/skeleton.tsx) for pulsing placeholder surfaces
- [frontend/components/ui/scroll-area.tsx](../frontend/components/ui/scroll-area.tsx) for clipped, scrollable containers

## Design-system summary

The reusable UI layer is small but consistent:

- one visual contract for repeated controls
- layout consistency across modalities
- minimal reliance on one-off style declarations
