---
author: Product Owner
---

# Design brief (StockFlow)

The PO's design intent for the StockFlow UI, the UX Designer's intake.
Recorded ahead of time so the Human Proxy can supply it in a headless
run (the same brief a human would author at the `/design` UX
interview). The UI is small (a home stock-by-location view, a SKU
detail page, an adjustment / receipt / pick form, a search), and this
brief is deliberately small.

## UI delivery

StockFlow ships as a single-page application, not server-rendered
pages. The client is a React + TypeScript app under `client/` (Vite),
talking to the backend over a JSON API; the design tokens below live in
`client/src/styles/` and are consumed as `var(--token)`. Screens are
client-side routed (home, SKU detail, the forms) with no full-page
reloads, and every state (empty, loading, success, validation error)
is a component state with a stable `data-testid` seam. The framework
choice itself is the Architect's to record (`renders_via`); this brief
states the product intent: a React SPA client plus a JSON API backend,
each tested on its own side.

## References

The design language is teased from these references; the UX Designer
extracts tokens from them and cites which decision came from which.

- **Databricks-brand default** (`client/src/styles/STYLE_GUIDE.md` and
  `theme.css`): take BRAND and COLOR from here. DM Sans typography,
  navy-900 (`#1B3139`) text, warm-oat (`#F9F7F4`) page background,
  white cards, Databricks brand red (`#FF3621`) for primary actions
  only.
- **A clean warehouse / inventory dashboard** (e.g. Cin7, Fishbowl,
  Linnworks card-and-table view): take LAYOUT and INFORMATION DENSITY
  from here. A calm, scannable table of stock-by-location on the home
  page, generous whitespace, numeric columns right-aligned with
  tabular figures, and a single narrow column for the detail page and
  the form.

## Brand constraints

- Use the Databricks brand red for the primary action / active state
  only (Receive, Pick, Save, the active link). Keep the stock table
  itself calm and high-contrast so quantities and SKUs are easy to
  scan.
- System / UI font stack from `theme.css` (DM Sans). No custom web
  font beyond what is loaded there.
- Cards are white on the warm-oat background with a soft navy-tinted
  shadow and a gentle radius. The primary button is solid brand-red
  with sharp (0px) corners. Keep these consistent across home, detail,
  and form.

## Interaction and feedback

- Every state is shown explicitly: an empty stock location shows an
  explicit empty state ("No stock at this location, receive an inbound
  shipment"), never a blank page; a SKU with no batches or serial
  detail shows a clear "not tracked", never a blank region.
- Forms never fail silently: a successful save lands on a confirmation
  view (or an inline green flash for an adjustment), and a validation
  problem (e.g. a pick that would overcommit, an unknown SKU) is shown
  inline next to the field that caused it, naming the field.
- Barcode scans are the primary input on the warehouse floor. A scan
  succeeds with a green flash and the stock row updating in place; a
  scan that fails (unknown barcode, locked SKU) flashes the scan zone
  red and shows a persistent toast.
- The home grid and the detail page are read-mostly; the
  no-silent-failure principle applies to receipt, pick, adjustment,
  and cycle-count forms.

## Accessibility

- Form inputs have visible, persistent labels (not placeholder-only).
- Tap targets on the tablet UI are at least 44x44 px.
- Quantity cells and stock-level pills use both shape and text, not
  color alone, to communicate state. An "out of stock" cell reads
  "out" AND uses the error color; a "low" cell reads "low" AND uses
  the warning color.
- Every action is keyboard-reachable and readable at 200% zoom (the
  warehouse-floor tablet defaults to large text).
- Numeric quantities use tabular figures so columns of numbers align
  visually.
