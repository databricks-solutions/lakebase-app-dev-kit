# Bug Tracker Design Guide

## Design Philosophy

- **Clarity over decoration:** every element earns its space.
- **Explicit state:** never leave the user guessing; unowned reads "unowned", empty states show a message, every status is named as text.
- **Scannable and compact:** single-column lists where identifier, title, status, and owner are visible at a glance (GitHub Issues layout principle).
- **Warm and professional:** navy and warm neutrals, consistent with the Databricks ecosystem.

**Provenance:** Brand and color from Databricks-brand default; layout and information density from GitHub Issues; explicit-state principle from design brief.

## UI Framework and Templating

This project uses React for component rendering. All UI is built from stable, testable components using semantic HTML and CSS custom properties. Each interactive element and region carries a stable test selector (`data-testid` or semantic role), never a brittle CSS path. The design tokens are defined as CSS custom properties on `:root`, enabling runtime validation and theme consistency. No hand-assembled HTML strings. Rendering lives in the boundary layer.

## Typography

- **Font family:** `"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif`
- **Monospace:** `"DM Mono", ui-monospace, monospace`
- **Type scale:**
  - `text-xs`: 10px
  - `text-sm`: 13px
  - `text-base`: 15px
  - `text-md`: 16px
  - `text-lg`: 20px
  - `text-xl`: 24px
  - `text-xxl`: 29px
- **Line heights:** body 1.5, headings 1.25

**Provenance:** Databricks-brand default.

## Color Palette

- **Brand:** `brand-red` #FF3621 (primary CTAs, active states); `brand-red-hover` #EB1600 (hover state).
- **Navy (text + dark surfaces):** `navy-900` #1B3139, `navy-800` #2A3E4E, `navy-700` #384B5C, `navy-300` #C5D3DF, `navy-200` #DDE5ED, `navy-100` #EDF2F8.
- **Surfaces:** `bg-white` #FFFFFF, `bg-warm` #F9F7F4 (page background), `bg-cool` #F0F2F5 (secondary background).
- **Semantic:** `success` #2E844A, `warning` #FFAB00, `info` #0176D3, `error` #FF3621.

Keep the list itself calm and high-contrast for readability; reserve brand-red for primary actions and active states only.

**Provenance:** Databricks-brand default.

## Spacing

8px base grid; tokens derive from multiples of 4:
- `space-1`: 4px
- `space-2`: 8px
- `space-3`: 12px
- `space-4`: 16px
- `space-5`: 20px
- `space-6`: 24px
- `space-8`: 32px
- `space-12`: 48px
- `space-16`: 64px

Standard gaps: card padding `space-5`, section gaps `space-8`, form field gaps `space-3`, max content width 960px centered.

## Components

### Buttons
- **Primary:** brand-red (#FF3621) background, white text, sharp corners (radius 0), full-width in forms, hover state (#EB1600).
- **Secondary:** white background, navy-200 border, navy-900 text, 8px radius.

### Form Inputs
- White background, navy-300 border, 4px radius, info-blue (#0176D3) focus ring (2px solid), padding `space-3`, font-size `text-base`.
- Label: navy-900 text, `text-sm`, displayed above the input, margin-bottom `space-2`.
- Placeholder text: navy-300; never rely on placeholder for instruction.
- Full-width in forms.
- Each required field is prevented from empty submission.

### Status Badge
- Pill-shaped (radius 12px), uppercase text, `text-xs`, padding 4px 8px, semantic color backgrounds.
- States: open (navy-100 background, navy-900 text), closed (navy-200 background, navy-900 text).
- **Never convey status by color alone; always include the state name as text.**

### Bug Detail Display
- Navy-900 heading (h1 or h2, `text-lg`), navy-900 body text (`text-base`), navy-300 labels (`text-sm`).
- Identifier, title, description, status displayed in reading order.
- Each field labeled explicitly (e.g., "Identifier:", "Status:", "Owner:").
- Unowned bugs read "unowned", never a blank cell.

### Cards
- White background, 1px navy-200 border, 12px radius, soft shadow (0 2px 8px rgba(27, 49, 57, 0.08)).
- Padding: `space-5` (20px).

### Empty States
- Centered message, navy-300 text, `text-base`, with a brief explanation.
- Example: "No bugs to display" or "No results found".
- Never show a blank page.

## User Feedback Principles

- **No silent failures.** Every action that changes data shows success and failure feedback.
- **No unacknowledged success.** Navigation, a toast, a flash, or other visible confirmation means the action worked.
- **Explicit states prevent confusion.** Form submission provides feedback: disabled button during submission, success message on creation, error message if submission fails.
- **Empty states teach.** When a view is empty, an explicit message appears; never a blank page.
- **Keyboard and zoom support.** All interactive elements are keyboard-reachable (tab order) and the layout remains readable at 200% zoom.

**Provenance:** Design brief (interaction and feedback, accessibility sections).
