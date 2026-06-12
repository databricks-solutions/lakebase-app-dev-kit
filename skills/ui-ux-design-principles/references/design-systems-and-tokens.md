# Design systems and tokens

Consistency at scale comes from a shared vocabulary of reusable decisions, not each screen re-deciding its colors and spacing. A design system is that vocabulary: tokens (atoms) + components (molecules) + the rules for using them.

## Tokens are the source of truth

A **design token** is a named design decision: `brand-red = #FF3621`, `space-5 = 20px`, `text-lg = 20px`, `radius-card = 12px`. Code references the token, never the raw value. Change the token, change every use.

Here, tokens live in **`design-guide.json`** (validated by `design-guide.schema.json`); the human-readable standards live in **`design-guide.md`**. The JSON is the source of truth for tokens; the markdown explains and adds component rules and principles. Keep the two in sync: the markdown must not state a color the JSON lacks.

Token categories to define: typography (families + scale), color (brand + semantic + surfaces), spacing (a scale, not arbitrary px), radius, shadows, breakpoints.

## Components

- **Standardize recurring elements:** buttons (primary / secondary), inputs, cards, badges, navbar, modals, toasts. Each has one definition and a rule for when to use it.
- **One pattern per job.** Two card styles for the same content is the consistency smell (heuristic 4). Pick one; a genuinely new one joins the system, it doesn't live as a one-off.
- **Compose from tokens** so a token change ripples correctly.

## Why a system (not per-screen styling)

- **Consistency:** the same action looks the same everywhere.
- **Velocity:** new screens assemble from existing parts.
- **Enforceability:** because tokens are declared in `design-guide.json`, the rendered UI can be *checked* against them.

## Enforcement: design-adherence

The kit's **design-adherence** check renders the UI, reads its `:root` CSS variables / computed tokens, and compares them to `design-guide.json`. Off-palette colors, off-scale type sizes, and ad-hoc spacing fail at the E2E layer. This makes "adheres to the design system" a gate, not a matter of taste, the experience analogue of the architectural fitness functions in [evolutionary-architecture](../../architectural-design-principles/references/evolutionary-architecture.md).

The system defines the vocabulary; design-adherence proves the UI speaks it.
