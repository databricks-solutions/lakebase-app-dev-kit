# Default Design Guide (Databricks-brand baseline)

The UX Designer uses this as the starting point when the HIL supplies no
design brief and the project has no existing guide. It is the Databricks-brand
baseline; adapt it to the brief when one exists. It satisfies the
`design-guide.md` conformance contract (the required sections below). The
machine-checkable tokens live alongside it as `design-guide.json`
(`design-guide.schema.json`).

## Design Philosophy

- **Clarity over decoration** , every element earns its space.
- **Guide the user** , the interface explains itself; empty states teach, not scold.
- **Warm and professional** , navy + warm neutrals, not cold corporate gray.
- **Consistent with the Databricks ecosystem** , a user moving between Databricks
  surfaces and this app should feel at home.

## Typography

- Font family: `"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif`.
- Mono: `"DM Mono", ui-monospace, monospace`.
- Scale (token : size): `text-xs` 10px, `text-sm` 13px, `text-base` 15px,
  `text-md` 16px, `text-lg` 20px, `text-xl` 24px, `text-xxl` 29px.
- Line heights: body 1.5, headings 1.25.

## Color Palette

- **Brand:** `brand-red` `#FF3621` (primary CTA), `brand-red-hover` `#EB1600`.
- **Navy (text + dark surfaces):** `navy-900` `#1B3139` through `navy-100` `#EDF2F8`.
- **Surfaces:** `bg-white` `#FFFFFF`, `bg-warm` `#F9F7F4` (page), `bg-cool` `#F0F2F5`.
- **Semantic:** `success` `#2E844A`, `warning` `#FFAB00`, `info` `#0176D3`, `error` `#FF3621`.

## Spacing

8px base grid; tokens derive from multiples of 4: `space-1` 4px through
`space-16` 64px. Card padding `space-5`; section gaps `space-8`; max content
width 960px centered; navbar height 64px.

## Components

- **Navbar:** navy-900 background, 64px, 2px brand-red bottom border.
- **Cards:** white, 1px navy-200 border, 12px radius, soft navy-tinted shadow.
- **Buttons:** primary = brand-red, sharp corners (`radius 0`, a Databricks
  signature); secondary = white with navy-200 border, 8px radius.
- **Form inputs:** white, navy-300 border, 4px radius, info-blue focus ring.
- **Status badges:** pill radius, `text-xs`, uppercase, semantic colors.

## User Feedback Principles

- **No silent failures.** Every action that changes data shows success AND
  failure feedback (`describeError()` for API errors).
- **No unacknowledged success.** Navigation, a toast, a flash, or a checkmark ,
  something visible confirms the action worked.
- **No layout shifts from feedback.** Action feedback uses fixed-position
  toasts, never inline alerts that push content around.
- **Loading states are mandatory** for any action over 200ms.
