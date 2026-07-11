# Style guide

Design tokens live in `theme.css` as CSS custom properties. Components consume
them ONLY as `var(--token)`; never hardcode a hex color or a pixel value in a
component (the design-adherence gate flags hardcoded values).

The UX Designer's `design-guide.json` is the source of truth for the token
values; when it changes, update `theme.css` to match. The defaults shipped here
follow the Databricks brand:

- **Color**: navy `#1B3139` text, warm-oat `#F9F7F4` page surface, white cards,
  brand red `#FF3621` for the primary action / active state only.
- **Semantic**: `#2E844A` success, `#FFAB00` warning, `#0176D3` info, brand red
  for error. Meaning is always carried by text as well, never color alone.
- **Typography**: DM Sans for UI, DM Mono for code/numerics.
- **Spacing**: a 4px base grid (`--space-1` .. `--space-6`).

Keep the token set small and named by role (surface, brand, text), not by raw
value, so a re-theme changes `theme.css` and nothing else.
