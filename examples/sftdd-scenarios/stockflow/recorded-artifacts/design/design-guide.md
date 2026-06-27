# StockFlow Design Guide

## Design Philosophy

StockFlow is a warehouse operations tool. The UI must be fast to scan on a rugged tablet, instantly readable under poor lighting, and operable with gloves. Every element earns its place; decoration is eliminated.

**Principles:**

- **Clarity over decoration.** No element exists purely for visual richness.
- **Guide the user.** Empty states teach; they do not scold or blank.
- **Warm and professional.** Navy + warm oat, never cold corporate grey.
- **Consistent with the Databricks ecosystem.** Tokens and type match Databricks brand standards so the product feels native to that platform.

*Source: design-brief.md "Brand constraints" + STYLE_GUIDE.md "Design Philosophy" + product-overview.md "Design guidelines / Principles".*

---

## UI Framework and Templating

- **Framework:** React 18 + TypeScript (SPA), built with Vite. No server-side HTML rendering; the server returns JSON only.
- **Component authoring:** plain React functional components + CSS custom properties. No component library (MUI, Tailwind, etc.) -- tokens from `theme.css` plus handcrafted CSS modules cover every pattern.
- **Testable seams:** every interactive surface carries a `data-testid` attribute matching the seam names declared in `ia.md`. Seams are stable identifiers, never derived from dynamic content. Role attributes (`role="alert"`, `aria-live`) supplement testids for feedback regions.
- **Rendering boundary:** UI components live in `client/src/components/` and `client/src/pages/`; they never issue `fetch` directly. Data flows through `client/src/hooks/` -> `client/src/api/`.
- **Icon library:** Lucide React (tree-shakable, line-icon style).

---

## Typography

*Source: STYLE_GUIDE.md "Typography" + theme.css typography tokens.*

**Font families:**
- `--font-family`: `"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif` (loaded from Google Fonts, weights 400/500/600/700)
- `--font-mono`: `"DM Mono", ui-monospace, monospace` (used for numeric quantities, tabular figures)

**Scale:**

| Token | Size | Weight | Use |
|---|---|---|---|
| `--text-xs` | 10px (0.625rem) | 600-700 | Stock-state pill labels, tags, badges |
| `--text-sm` | 13px (0.8125rem) | 400-500 | Secondary labels, metadata, helper text |
| `--text-base` | 15px (0.9375rem) | 400 | Body, form inputs, table cells |
| `--text-md` | 16px (1rem) | 500 | Buttons, nav items |
| `--text-lg` | 20px (1.25rem) | 700 | Card titles, section headings |
| `--text-xl` | 24px (1.5rem) | 700 | Page titles |
| `--text-xxl` | 29px (1.8125rem) | 700 | Hero / welcome headings |

**Line heights:** `--leading-tight: 1.25` (headings); `--leading-normal: 1.5` (body).

**Numeric cells:** use `--font-mono` + `font-variant-numeric: tabular-nums`; right-aligned. This applies to every quantity column in the stock table.

---

## Color Palette

*Source: design-brief.md "Brand constraints" + STYLE_GUIDE.md "Color Palette" + theme.css color tokens.*

### Brand

| Token | Value | Use |
|---|---|---|
| `--color-brand-red` | `#FF3621` | Primary CTAs (Receive, Pick, Save), active nav indicator, scan-zone focus |
| `--color-brand-red-hover` | `#EB1600` | Primary button hover |
| `--color-brand-red-light` | `rgba(255,54,33,0.08)` | Error field background tint, scan failure flash |

### Navy (text + dark surfaces)

| Token | Value | Use |
|---|---|---|
| `--color-navy-900` | `#1B3139` | Primary text, navbar background, page headings |
| `--color-navy-700` | `#1B5162` | Secondary headings |
| `--color-navy-500` | `#618794` | Tertiary text, icon default, filter labels |
| `--color-navy-400` | `#90A5B1` | Placeholder text, disabled states |
| `--color-navy-300` | `#C4CCD6` | Borders, dividers, scan-zone dashed border |
| `--color-navy-200` | `#E5EAF1` | Subtle borders, input borders, table row separator |
| `--color-navy-100` | `#EDF2F8` | Row hover, filter panel background |

### Backgrounds

| Token | Value | Use |
|---|---|---|
| `--color-bg-white` | `#FFFFFF` | Cards, modals, form surfaces |
| `--color-bg-warm` | `#F9F7F4` | Page background (the oat background the brief specifies) |
| `--color-bg-cool` | `#F0F2F5` | Table header row, filter panels |

### Semantic

| Token | Value | Use |
|---|---|---|
| `--color-success` | `#2E844A` | Success badges, in-stock indicators, scan-success flash, inline success message |
| `--color-success-light` | `rgba(46,132,74,0.1)` | Success pill background, success toast background |
| `--color-warning` | `#FFAB00` | Low-stock indicator |
| `--color-warning-light` | `rgba(255,171,0,0.12)` | Warning pill background |
| `--color-info` | `#0176D3` | Links, informational icons, focus ring |
| `--color-info-light` | `rgba(1,118,211,0.1)` | Info pill background |
| `--color-error` | `#FF3621` | Error text, validation messages, out-of-stock |
| `--color-error-light` | `rgba(255,54,33,0.08)` | Error field background |

### Stock-state pills (color + text, never color alone)

| State | Background | Text color | Label text |
|---|---|---|---|
| In stock | `--color-success-light` | `--color-success` | "in stock" |
| Low | `--color-warning-light` | `#E65100` | "low" |
| Out of stock | `--color-brand-red-light` | `--color-brand-red` | "out" |
| On order | `--color-info-light` | `--color-info` | "on order" |
| Quarantined | `--color-navy-100` | `--color-navy-500` | "quarantined" |

State is always conveyed by both color AND text. Pill shape reinforces state, not color alone.

---

## Spacing

*Source: STYLE_GUIDE.md "Spacing" + theme.css spacing tokens. 4px base grid.*

| Token | Value | Typical use |
|---|---|---|
| `--space-1` | 4px | Label-to-input gap, icon margin |
| `--space-2` | 8px | Inline button padding (vertical) |
| `--space-3` | 12px | Table cell padding (vertical), toast padding |
| `--space-4` | 16px | Form field gap, table cell padding (horizontal) |
| `--space-5` | 20px | Card padding |
| `--space-6` | 24px | Page horizontal padding (mobile), section sub-gap |
| `--space-8` | 32px | Section gap |
| `--space-10` | 40px | Page horizontal padding (desktop), scan-zone vertical padding |
| `--space-12` | 48px | Large vertical spacing |
| `--space-16` | 64px | Navbar height |

**Layout constants:** `--content-max-width: 960px` (centered); `--navbar-height: 64px`.

---

## Breakpoints

*Source: STYLE_GUIDE.md "Responsive breakpoints".*

| Token | Value | Behavior |
|---|---|---|
| `--bp-mobile` | 480px | Single column, full-width cards. Rugged tablet portrait (warehouse floor default). |
| `--bp-tablet` | 768px | Single column, wider margins. |
| `--bp-desktop` | 1024px | Two- to three-column card grids; 960px max content width enforced. |

Tap targets: minimum 44x44px on all interactive controls to support tablet glove use.

---

## Components

### Navbar

- Background: `--color-navy-900`
- Height: `--navbar-height` (64px)
- Bottom border: 2px solid `--color-brand-red`
- Shadow: `--shadow-navbar`
- Logo: Databricks spark mark SVG, 28x30px, `#FF3621`, inline in `App.tsx`
- Title text: white, `--text-lg`, weight 700
- Nav links: white, `--text-sm`, weight 500; hover background `rgba(255,255,255,0.1)`, `--radius-md`; active link uses brand-red underline or indicator

### Page layout

- Background: `--color-bg-warm`
- Content: max-width `--content-max-width`, centered; `--space-10` top/bottom padding; `--space-6` horizontal (mobile), `--space-10` (desktop)
- Page title: `--text-xl`, `--color-navy-900`, weight 700, `--space-6` bottom margin

### Cards

- Background: `--color-bg-white`
- Border: 1px solid `--color-navy-200`
- Border-radius: `--radius-lg` (12px)
- Shadow: `--shadow-sm`
- Padding: `--space-5`
- Hover: `--shadow-md`, `translateY(-2px)`, transition `--transition-base`

### Buttons

**Primary (CTA: Receive, Pick, Save, Submit):**
- Background: `--color-brand-red`; hover: `--color-brand-red-hover`
- Color: white; border: none
- Border-radius: `--radius-none` (0px -- Databricks brand signature; do not round)
- Padding: 12px 32px; font: `--text-md`, weight 500
- Disabled: opacity 0.5, `cursor: not-allowed`

**Secondary:**
- Background: `--color-bg-white`; color: `--color-navy-500`
- Border: 2px solid `--color-navy-200`; border-radius: `--radius-md`
- Padding: 10px 24px; hover: `--color-navy-100` background

**Ghost / text:**
- Background: transparent; color: `--color-navy-500`; no border
- Hover: `--color-navy-100` background, `--radius-md`

### Form inputs

- Background: `--color-bg-white`; border: 1px solid `--color-navy-300`; border-radius: `--radius-sm`
- Padding: 10px 14px; font: `--text-base`; placeholder: `--color-navy-400`
- Focus: 2px solid `--color-info`, no outline
- Error state: border `--color-error`, background `--color-error-light`
- Label: `--text-sm`, weight 600, `--color-navy-700`, `--space-1` margin-bottom; label is always visible (never placeholder-only)

### Tables and stock lists

- Header row: `--color-bg-cool`, `--text-sm` weight 600 uppercase, `--color-navy-500`
- Body rows: `--color-bg-white`, `--text-base`, `--color-navy-900`; row border: 1px solid `--color-navy-200`; hover: `--color-navy-100`
- Cell padding: `--space-3` vertical, `--space-4` horizontal
- Numeric cells (qty, count): right-aligned, `--font-mono`, `font-variant-numeric: tabular-nums`

### Status badges (stock-state pills)

- Border-radius: `--radius-pill`
- Padding: 4px 12px
- Font: `--text-xs`, weight 700, uppercase, letter-spacing 0.5px
- Colors and label text: per Stock-state pills table above

### Scan / input zone

- Border: 2px dashed `--color-navy-300`; border-radius: `--radius-lg`; background: `--color-bg-warm`
- Padding: `--space-10` vertical; text: `--color-navy-500`, centered
- Scan-active: border-color `--color-brand-red`, background `--color-brand-red-light`
- Icon: `Scan` or `Barcode` from Lucide React, 48px, `--color-navy-400`

### Empty states

- Centered in content area; icon: 64px, `--color-navy-300`
- Heading: `--text-lg`, `--color-navy-900`
- Description: `--text-base`, `--color-navy-500`, max-width 400px
- CTA button below description

Standard empty-state copy for stock location: "No stock at this location / Receive an inbound shipment to start tracking stock here, or pick a different location."

### Toasts (action feedback)

Delivered via shared `<Toast />` component + `useToast()` hook. Fixed-position (top-right, below navbar), never shifts page layout.

- Position: fixed top-right, `z-index: 100`; border-radius: `--radius-md`; padding: `--space-3` `--space-4`; shadow: `--shadow-md`
- Animation: slide in from right 0.2s, slide out on dismiss 0.3s
- **Success:** auto-dismiss after 3s; background `--color-success-light`, text `--color-success`
- **Error:** persistent until dismissed (X button required); background `--color-brand-red-light`, text `--color-brand-red`

### Inline alerts

Used only for page-load errors and form validation (never for action feedback). Background: semantic light color; text: semantic dark color; border-radius: `--radius-md`; padding: `--space-3` `--space-4`.

### Inline validation messages

Shown directly below the offending field. Text: `--color-error`, `--text-sm`. Names the field explicitly (e.g. "Quantity: only 3 available at A-12").

### Shadows

```
--shadow-sm:     0px 2px 8px rgba(27, 49, 57, 0.06)
--shadow-md:     0px 4px 16px rgba(27, 49, 57, 0.08)
--shadow-lg:     0px 4px 8px rgba(27,49,57,0.04),
                 0px 16px 24px rgba(27,49,57,0.04),
                 0px 32px 40px rgba(27,49,57,0.05)
--shadow-navbar: 0px 4px 20px rgba(27, 49, 57, 0.3)
```

All shadows use navy-tinted rgba; never pure black.

---

## User Feedback Principles

*Source: design-brief.md "Interaction and feedback" + STYLE_GUIDE.md "User feedback principles".*

**No silent failures. No unacknowledged success.**

| Action | Success | Failure |
|---|---|---|
| Form submit (create/edit) | Navigate to confirmation view (navigation IS feedback) | Inline alert within form, field-level messages via `describeError()` |
| Barcode scan | Stock row updates in place + green flash on scan zone | Red flash on scan zone + persistent error toast |
| Inline mutation (adjustment, status change) | Auto-dismiss success toast (3s) | Persistent error toast (user must dismiss) |
| Delete/remove | Success toast + optimistic local state update | Persistent toast + local state revert |
| Page load failure | n/a | Inline alert replaces content area |
| Button action (any) | Disabled + spinner while processing | Re-enabled + error message shown |

**Additional rules:**
- Feedback causes no layout shifts: toasts are fixed-position; inline alerts for page-load only.
- Every form submit button shows a spinner/disabled state while the request is in flight (>200ms implies visible loading state).
- Optimistic deletes revert on failure.
- SPA state: after successful mutations, update local React state in place; do not re-fetch the whole list.
- "Not tracked" data (e.g. par level not yet set) shows explicit "not tracked" text, never null or a blank region.
- "No results" shows an explicit empty state, never a blank page.

**Error messages** go through `describeError()` in `client/src/api/errors.ts` and map status codes to actionable text. Every message includes the status code.
