# StockFlow Design Guide

## Design Philosophy

- **Clarity over decoration.** Every element earns its space; the stock
  table and forms stay calm and high-contrast so quantities and SKUs
  scan at a glance (`design-brief.md`, references section).
- **Guide the user, never leave them guessing.** Empty states teach
  ("No stock at this location, receive an inbound shipment") rather
  than show a blank page; untracked detail (par level) reads "not
  tracked" rather than a blank region (`design-brief.md`, Interaction
  and feedback).
- **Warm and professional.** Navy text and warm-oat surfaces, not cold
  corporate grey; consistent with the wider Databricks ecosystem so a
  user coming from another Databricks surface feels at home
  (`product-overview.md`, Design guidelines > Principles; carried
  forward unchanged from the Databricks-brand default since the brief
  names it as the BRAND/COLOR source).
- **Calm density, scannable layout.** Layout and information density
  are teased from a clean warehouse/inventory dashboard reference
  (Cin7/Fishbowl/Linnworks card-and-table pattern): a scannable table
  on the home screen, generous whitespace, numeric columns
  right-aligned with tabular figures, a single narrow column for
  detail and form screens (`design-brief.md`, References).
- **Tablet-first, scan-driven.** The warehouse floor tablet and its
  barcode scanner are the primary input device; tap targets, zoom
  tolerance, and scan feedback are designed for that context first,
  desktop second (`design-brief.md`, Accessibility;
  `product-overview.md`, Who it is for).

## UI Framework and Templating

- StockFlow ships as a client-side routed **React 18 + TypeScript
  single-page application** (Vite), talking to a JSON-only API; the
  server never renders HTML (`product-overview.md`, How it is
  delivered / Stack; `design-brief.md`, UI delivery).
- Rendering lives at the layer boundary the Architect names
  `client/src/pages/`: pages compose presentational
  `client/src/components/` and wire in `client/src/hooks/` for data.
  Components never call `fetch` or a data-fetching hook directly
  (`product-overview.md`, Client-side layered architecture). This
  guide's component rules apply to what `components/` renders and
  `pages/` assembles.
- No hand-assembled HTML strings; every component is a typed React
  component. No full-page reloads between screens, client-side routing
  only.
- Every screen state (empty, loading, success, validation error, scan
  success, scan failure) is its own component state carrying a stable
  `data-testid` (or ARIA role) seam, not a CSS class alone, so the
  E2E layer can select it deterministically. The exact seam names each
  screen must render are declared in `ia.md` and enforced by the
  adherence gate's `checkRequiredSeams`.
- Design tokens are consumed exclusively as `var(--token)` from
  `client/src/styles/theme.css`; no hardcoded hex or raw px in a
  component's inline `style=` or `<style>` block (the one exception is
  the token *definitions* themselves in `theme.css`).

## Typography

Source: Databricks-brand default (`client/src/styles/theme.css`,
`client/src/styles/STYLE_GUIDE.md`), named directly by the brief as
the BRAND source; unchanged by the warehouse-dashboard reference,
which was cited for layout/density only.

| Token | Value | Use |
|---|---|---|
| `font_family` | `'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | All UI text |
| `font_mono` | `'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace` | Tracking codes, quantities, anything numeric or code-like |
| `text-xs` | 10px | Micro labels |
| `text-sm` | 13px | Table meta, badge text |
| `text-base` | 15px | Body copy |
| `text-md` | 16px | Form labels, table cell default |
| `text-lg` | 20px | Section headings |
| `text-xl` | 24px | Screen title |
| `text-xxl` | 29px | Rare hero-scale use only |
| `line_heights.body` | 1.5 | Paragraph and cell text |
| `line_heights.heading` | 1.25 | Headings |
| `font_weights.regular` / `medium` / `semibold` / `bold` | 400 / 500 / 600 / 700 | Body / emphasis / headings / rare strong emphasis |

Numeric quantities and tracking codes (`inventory_code`) always render
in `font_mono` with tabular figures so columns of numbers align
visually (`design-brief.md`, Accessibility).

## Color Palette

Source: Databricks-brand default (`theme.css`), the brief's explicit
BRAND/COLOR reference. Brand red is reserved for primary action /
active state only, per the brief's Brand constraints, so the stock
table itself reads calm and high-contrast.

| Group | Token | Value | Use |
|---|---|---|---|
| brand | `brand-red` | `#FF3621` | Primary action only: Receive, Pick, Save, the active link |
| brand | `brand-red-hover` | `#EB1600` | Hover/active state of the above |
| semantic | `success` | `#2E844A` | Save/scan success, "ok" stock pill |
| semantic | `warning` | `#FFAB00` | "low" stock pill |
| semantic | `info` | `#0176D3` | Informational banners |
| semantic | `error` | `#FF3621` | Validation errors, "out" stock pill, failed scan |
| surface | `page` | `#F9F7F4` | Page background (warm-oat) |
| surface | `card` | `#FFFFFF` | Cards, table surface, on warm-oat |
| text | `primary` | `#1B3139` | Primary text (navy) |

Meaning is never carried by color alone (`design-brief.md`,
Accessibility): a stock-level pill or cell always pairs its semantic
color with its name as text ("out", "low", "ok"), never the color in
isolation.

## Spacing

Source: Databricks-brand default 4px grid (`STYLE_GUIDE.md`,
`theme.css`), extended to the fuller `space-1`..`space-16` range the
product overview names.

| Token | Value |
|---|---|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-12` | 48px |
| `space-16` | 64px |

Radius: `sm` (4px, inputs), `md` (8px, cards), `lg` (12px, modals/hero
cards), `pill` (999px, badges), `button` (0px). The `button` override
is a StockFlow-specific brand constraint from the brief: the primary
button keeps the Databricks brand red fill but takes sharp (0px)
corners rather than the default `md` radius, to read as a distinct,
deliberate action against the softly-rounded cards
(`design-brief.md`, Brand constraints).

Shadows are navy-tinted, never black, at three levels (`sm`, `md`,
`lg`); cards use a soft `sm`/`md` navy-tinted shadow on the warm-oat
background (`design-brief.md`, Brand constraints; `STYLE_GUIDE.md`).

Content max width 960px; single content column on detail and form
screens, a table/grid on the home screen (`STYLE_GUIDE.md`, Layout;
`design-brief.md`, References).

## Components

- **Stock table** (home screen): calm, high-contrast rows; SKU and
  location as text columns, quantity right-aligned in `font_mono` with
  tabular figures. Row is the row-level `data-testid` seam and the
  click target that opens SKU detail. An empty table state renders an
  explicit message ("No stock at this location, receive an inbound
  shipment") in place of the table, never a blank page.
- **Stock-level pill/cell**: uses `radius.pill`, a semantic color, AND
  its status name as text ("out", "low", "ok"). Never color alone.
- **Card**: white (`colors.surface.card`) on warm-oat page background,
  `radius.md`, `shadows.sm` (or `shadows.md` for emphasis), consistent
  across home, detail, and form.
- **Primary button**: solid `colors.brand.brand-red` fill, white text,
  `radius.button` (0px, sharp corners), hover to
  `colors.brand.brand-red-hover`. Reserved for the primary action per
  screen (Save, Receive, Pick, the active nav link). Minimum 44x44px
  tap target on the tablet UI (`design-brief.md`, Accessibility).
- **Form input**: visible, persistent label above the field (never
  placeholder-only); `radius.sm`; inline validation error rendered
  directly beneath the field it belongs to, naming the field, on
  `colors.semantic.error`.
- **Detail view**: single narrow column (per the warehouse-dashboard
  reference's density guidance), tracking code (`inventory_code`) in
  `font_mono`; an untracked optional field (par level) renders a clear
  "not tracked" label, never a blank region.
- **Scan zone**: the primary input surface on the warehouse floor. A
  successful scan flashes `colors.semantic.success` and the affected
  stock row updates in place; a failed scan (unknown barcode, locked
  SKU) flashes `colors.semantic.error` and raises a persistent toast
  that must be dismissed, not one that auto-clears silently
  (`design-brief.md`, Interaction and feedback).
- **Toast**: persistent until dismissed for scan failure; used
  sparingly, reserved for feedback that must not be missed on a
  warehouse floor.

All controls are keyboard-reachable and remain legible/usable at 200%
browser zoom (the tablet defaults to large text)
(`design-brief.md`, Accessibility).

## User Feedback Principles

No silent failure, no unacknowledged success, anywhere a user acts:

- **Save/record**: a successful save lands on an explicit confirmation
  view (or an inline `success` flash for a lighter-weight adjustment).
- **Validation**: a problem (an overcommitted pick, an unknown SKU) is
  shown inline, directly next to the field that caused it, and names
  that field. Never a generic top-of-page error with no field
  association.
- **Barcode scan**: success is a `success`-colored flash plus the
  affected row updating in place; failure is an `error`-colored flash
  on the scan zone plus a persistent toast (does not silently vanish).
- **Empty and untracked states**: always explicit and worded to teach
  ("No stock at this location, receive an inbound shipment"; "not
  tracked" for an untracked optional field), never a blank page,
  blank region, or crash.
- Read-mostly screens (home grid, SKU detail) still apply the
  empty/untracked-state rule above; the no-silent-failure rule for
  actions applies fully to the record/adjustment/receipt/pick/
  cycle-count forms (`design-brief.md`, Interaction and feedback).
