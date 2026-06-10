# Design systems and tokens

Consistency at scale comes from a shared vocabulary of reusable decisions, not from each screen re-deciding its colors and spacing. A design system is that vocabulary: tokens (the atoms) plus components (the molecules) plus the rules for using them.

## Tokens are the source of truth

A **design token** is a named design decision: `brand-red = #FF3621`, `space-5 = 20px`, `text-lg = 20px`, `radius-card = 12px`. Code references the token, never the raw value. Change the token, change every use.

In this kit, tokens live in **`design-guide.json`** (validated by `design-guide.schema.json`), and the human-readable standards live in **`design-guide.md`**. The JSON is the source of truth for tokens; the markdown explains and adds the component rules and principles. Keep the two in sync, the markdown must not state a color the JSON does not have.

Token categories to define: typography (families + scale), color (brand + semantic + surfaces), spacing (a scale, not arbitrary px), radius, shadows, breakpoints.

## Components

- **Standardize the recurring elements:** buttons (primary / secondary), form inputs, cards, badges, navbar, modals, toasts. Each has one definition and a rule for when to use it.
- **One pattern per job.** Two card styles for the same kind of content is the consistency smell (heuristic 4). Pick one; if a new one is truly needed, it joins the system, it does not live as a one-off.
- **Compose from tokens.** A component's colors, spacing, and radius come from tokens, so a token change ripples correctly.

## Why a system (not per-screen styling)

- **Consistency** the user can rely on: the same action looks the same everywhere.
- **Velocity:** new screens assemble from existing parts instead of reinventing them.
- **Enforceability:** because tokens are declared in `design-guide.json`, the rendered UI can be *checked* against them.

## Enforcement: design-adherence

The kit's **design-adherence** check renders the UI, reads its `:root` CSS variables / computed tokens, and compares them to `design-guide.json`. Off-palette colors, off-scale type sizes, and ad-hoc spacing fail the check at the E2E layer. This is what makes "adheres to the design system" a gate rather than a matter of taste, the experience analogue of the architectural fitness functions in [architectural-design-principles](../../architectural-design-principles/references/evolutionary-architecture.md).

The system defines the vocabulary; design-adherence proves the UI speaks it.
