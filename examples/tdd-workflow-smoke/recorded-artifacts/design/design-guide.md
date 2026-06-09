# Bug Tracker Design Guide

## Design Philosophy

- **Clarity over decoration**, every element earns its space. *[Source: Databricks-brand baseline]*
- **High contrast and scannable**, list-first interface inspired by GitHub Issues; users find bugs at a glance. *[Source: github.com issue list]*
- **Explicit states, never silent**, every status is named (unowned, not blank; empty list shows a message, not a blank page). *[Source: design brief constraint]*
- **Warm and professional**, navy + warm neutrals, consistent with the Databricks ecosystem. *[Source: Databricks-brand baseline]*

## Typography

Font family: `"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif`. Mono: `"DM Mono", ui-monospace, monospace`.

Type scale:
- `text-xs` 10px (labels, badges)
- `text-sm` 13px (captions, hints)
- `text-base` 15px (body copy)
- `text-md` 16px (standard UI)
- `text-lg` 20px (subheadings)
- `text-xl` 24px (section headings)
- `text-xxl` 29px (page title)

Line heights: body 1.5, headings 1.25.

## Color Palette

**Brand:** `brand-red` `#FF3621` (primary CTA, active state), `brand-red-hover` `#EB1600`.

**Navy (text + dark surfaces):** `navy-900` `#1B3139` (text), `navy-800` `#334455`, `navy-700` `#4D5F70`, `navy-600` `#666D7A`, `navy-500` `#7F8590`, `navy-400` `#99A1AA`, `navy-300` `#B2B9C2`, `navy-200` `#CCCEDB` (borders), `navy-100` `#EDF2F8` (backgrounds).

**Surfaces:** `bg-white` `#FFFFFF` (cards, inputs), `bg-page` `#F9F7F4` (page background), `bg-cool` `#F0F2F5` (alternate sections).

**Semantic:** `success` `#2E844A`, `warning` `#FFAB00`, `info` `#0176D3`, `error` `#FF3621`. All semantic colors are applied as pill backgrounds with text labels; color alone never conveys state.

## Spacing

8px base grid; all spacing derives from multiples of 4.

- `space-1` 4px (inline, tight)
- `space-2` 8px (standard gap)
- `space-3` 12px (input padding)
- `space-4` 16px (section margin)
- `space-5` 20px (card padding)
- `space-6` 24px (heading margin)
- `space-8` 32px (major section gap)
- `space-12` 48px (vertical rhythm)
- `space-16` 64px (page margins)

Max content width 960px, centered. Navbar height 64px.

## Components

**Navbar:** navy-900 background, 64px height, 2px brand-red bottom border. [Source: Databricks-brand baseline]

**Bug list rows:** single-column layout, one bug per row. Columns (left to right): identifier, title (grows), status pill, owner. Row padding space-4; row-to-row gap space-2. Horizontal borders navy-200 between rows. Hover state: bg-cool. [Source: GitHub Issues layout]

**Status pill:** pill radius (9999px), text-xs uppercase, semantic color background with navy-900 text. Always shows state name (e.g., "Open", "Closed", "In Progress"). [Source: design brief, accessibility constraint]

**Owner pill:** text-sm, gray background (navy-100), navy-900 text. Shows owner name or "Unowned" (never blank). [Source: design brief, explicit-state constraint]

**Cards:** white, 1px navy-200 border, 12px radius, soft navy shadow (md). Padding space-5. [Source: Databricks-brand baseline]

**Buttons:** Primary = brand-red, sharp corners (radius 0), navy-900 text, hover = brand-red-hover. Secondary = white background, navy-200 border, navy-900 text, 8px radius, hover = bg-cool.

**Form inputs:** white background, navy-300 border, 4px radius, navy-900 text. Focus: info-blue (0176D3) 2px outline. [Source: Databricks-brand baseline]

**Form labels:** text-md, navy-900, uppercase, space-2 below the input.

**Empty state:** full-width card, center-aligned, navy-400 icon (48px), navy-600 heading (text-lg), navy-500 description (text-base, space-2 margin).

## User Feedback Principles

- **No silent failures.** Every form submission shows success (navigation to list or detail) or failure (inline error message under the field, red border on input, error color text). [Source: design brief, no-silent-failure principle]
- **No unacknowledged success.** File a bug > navigate to detail view and show the bug immediately. Success is the state change itself, not a toast.
- **No layout shifts from feedback.** Error messages are inline; do not grow the form or shift content.
- **Loading states are mandatory** for any action over 200ms (e.g., form submission). Show a spinner next to the button or in place of it.
- **Empty list is explicit.** Do not show a blank page; show a centered empty-state card with an icon, heading ("No bugs filed yet"), and description ("Create the first bug using the button above").
