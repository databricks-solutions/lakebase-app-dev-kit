# Visual hierarchy

Guiding the eye: how a user knows, without reading a word, what matters most and where to look next. Built from size, weight, color, spacing, and position, the tools the project `design-guide.json` tokens make consistent.

## The principle

Importance maps to prominence. The single most important action is the most prominent thing on the screen. If everything is bold, nothing is.

- **One primary action per view.** The primary button (brand color, highest weight) is unique; secondary actions are visibly subordinate. Three primary buttons means zero.
- **Size and weight encode rank.** Headings step down a type scale (not arbitrary sizes); body text is one size. A number that matters can be large; chrome is small.
- **Color directs, doesn't decorate.** Reserve the brand/accent color for the action you want taken. Semantic colors (success / warning / error / info) each mean exactly one thing.
- **Space groups and separates.** Related things sit close; unrelated things get whitespace. Proximity is grouping; a gap is a boundary. Use the spacing scale, not eyeballed margins.
- **Alignment creates calm.** Line up to a grid. A consistent left edge and a max content width read as ordered; ragged alignment reads as broken.

## Heuristics

- **The squint test.** Squint until detail blurs; the thing still standing out should be the thing that matters most. If not, the hierarchy is wrong.
- **Reading order.** Western users scan top-left to bottom-right in an F or Z. Put the first decision top-left, the primary action where the scan lands.
- **Contrast for emphasis, not for everything.** Spend high contrast on what deserves attention. (Contrast also has an accessibility floor, see [accessibility](accessibility.md).)

## Enforcement

Partly testable: **design-adherence** compares rendered tokens (type scale, colors, spacing) to `design-guide.json`, so off-scale sizes and off-palette colors fail. The judgment part (is the primary action the most prominent?) is caught in the UX adherence review. Tokens make "consistent" enforceable; the review makes "well-ranked" a gate.
