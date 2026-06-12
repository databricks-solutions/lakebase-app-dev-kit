// / UX adherence: machine-enforce that the running UI matches the
// design guide. The design guide (design-guide.json) is the declared contract;
// this checks the IMPLEMENTED design system against it.
//
// Mechanism: the app defines its design tokens as CSS custom properties on
// :root (the convention in the real partner-asset-tracker STYLE_GUIDE.md ,
// tokens in theme.css :root, "accessible in Playwright tests"). We read those
// rendered :root variables and compare them to the tokens in design-guide.json.
// A primary button that renders blue or rounded when the guide says red + sharp
// fails the check, because the underlying --color-brand-red / --radius-none vars
// would not match.
//
// This is token-level adherence (does the implemented design SYSTEM match the
// declared one). Element-level usage adherence (does each component actually
// USE the tokens) is a future extension; the token check is the load-bearing
// first gate and is app/framework-agnostic.
//
// The pure comparison (designGuideToCssVars + checkTokenAdherence) is unit
// tested hermetically; assertDesignAdherence takes a minimal page-like reader
// so the kit core needs no hard @playwright/test dependency.

export interface DesignGuide {
  typography: { font_family: string; font_mono?: string; scale: Record<string, string> };
  colors: Record<string, Record<string, string>>;
  spacing: Record<string, string>;
  radius?: Record<string, string>;
  shadows?: Record<string, string>;
  breakpoints?: Record<string, string>;
}

/**
 * Flatten a design guide to the CSS custom properties the app is expected to
 * define on :root. Convention (matches the real theme.css token namespace):
 *   typography.font_family       -> --font-family
 *   typography.font_mono         -> --font-mono
 *   typography.scale[k]          -> --<k>          (text-base -> --text-base)
 *   colors[group][k]             -> --color-<k>    (brand-red -> --color-brand-red)
 *   spacing[k] / radius[k] /
 *   shadows[k] / breakpoints[k]  -> --<k>          (space-4 -> --space-4)
 * Token keys are stored WITHOUT the leading "--"; colors additionally drop the
 * group and gain a "color-" prefix on the leaf key.
 */
export function designGuideToCssVars(guide: DesignGuide): Record<string, string> {
  const vars: Record<string, string> = {};
  vars["--font-family"] = guide.typography.font_family;
  if (guide.typography.font_mono !== undefined) {
    vars["--font-mono"] = guide.typography.font_mono;
  }
  for (const [k, v] of Object.entries(guide.typography.scale)) {
    vars[`--${k}`] = v;
  }
  for (const group of Object.values(guide.colors)) {
    for (const [k, v] of Object.entries(group)) {
      vars[`--color-${k}`] = v;
    }
  }
  for (const map of [guide.spacing, guide.radius, guide.shadows, guide.breakpoints]) {
    if (!map) continue;
    for (const [k, v] of Object.entries(map)) {
      vars[`--${k}`] = v;
    }
  }
  return vars;
}

export interface TokenMismatch {
  cssVar: string;
  expected: string;
  /** The rendered value; undefined when the app does not define the variable. */
  actual?: string;
}

export interface AdherenceResult {
  ok: boolean;
  mismatches: TokenMismatch[];
}

/** Normalize for comparison: trim, collapse internal whitespace, lowercase. */
function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Compare the declared CSS-var tokens (from a design guide) against the values
 * the app actually rendered on :root. A declared token that is absent or
 * differs is a mismatch. Extra rendered vars the guide does not declare are
 * ignored (the guide is the contract, not an exhaustive inventory).
 */
export function checkTokenAdherence(
  declared: Record<string, string>,
  rendered: Record<string, string>,
): AdherenceResult {
  const mismatches: TokenMismatch[] = [];
  for (const [cssVar, expected] of Object.entries(declared)) {
    const actual = rendered[cssVar];
    if (actual === undefined || actual === "") {
      mismatches.push({ cssVar, expected, actual: undefined });
      continue;
    }
    if (normalize(actual) !== normalize(expected)) {
      mismatches.push({ cssVar, expected, actual });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * Minimal Playwright-Page-like reader: just the `evaluate` seam we use to read
 * computed :root custom-property values in the browser. Typed loosely so the
 * kit core takes no hard @playwright/test dependency.
 */
export interface CssVarReader {
  evaluate(
    fn: (names: string[]) => Record<string, string>,
    names: string[],
  ): Promise<Record<string, string>>;
}

/**
 * Read the app's rendered :root CSS variables for every token the guide
 * declares, compare, and THROW with the mismatches when the UI has drifted.
 * Call this from a project's Playwright E2E suite against the paired-branch
 * app endpoint; it is the runner that makes "ensures adherence" automatic.
 */
export async function assertDesignAdherence(reader: CssVarReader, guide: DesignGuide): Promise<void> {
  const declared = designGuideToCssVars(guide);
  const names = Object.keys(declared);
  const rendered = await reader.evaluate((vars: string[]): Record<string, string> => {
    // Runs in the browser: read each custom property off the document root.
    const root = globalThis as unknown as {
      getComputedStyle: (e: unknown) => { getPropertyValue: (n: string) => string };
      document: { documentElement: unknown };
    };
    const style = root.getComputedStyle(root.document.documentElement);
    const out: Record<string, string> = {};
    for (const name of vars) out[name] = style.getPropertyValue(name);
    return out;
  }, names);

  const result = checkTokenAdherence(declared, rendered);
  if (!result.ok) {
    const lines = result.mismatches.map(
      (m) => `  ${m.cssVar}: expected ${m.expected}, got ${m.actual ?? "(not defined)"}`,
    );
    throw new Error(`design adherence failed: UI does not match design-guide.json\n${lines.join("\n")}`);
  }
}

// ─── Element-level adherence (increment B) ───────────────────────
// The token check above proves the design SYSTEM matches the guide (the right
// :root vars exist). It cannot prove each component actually USES those tokens:
// a UI may define --color-brand-red on :root yet hardcode #FF3621 everywhere, or
// omit the data-testid seams the IA declared, or ship a form that never tells the
// user the action succeeded/failed. These element-level checks close that gap.
// They are pure + injectable (take plain rendered markup/styles, the way
// checkTokenAdherence takes plain rendered vars) so they unit-test hermetically
// without a real browser. A failure is the `ux-adherence` smell.

export interface ElementAdherenceResult {
  ok: boolean;
  violations: string[];
  remediation?: string;
}

// A `:root{...}` declaration block is where tokens are DEFINED (e.g.
// `--color-brand-red: #FF3621`); a hardcoded value there is correct, not a
// violation. Strip those blocks before scanning for hardcoded literals.
const ROOT_BLOCK = /:root\s*\{[^}]*\}/gi;
// A value inside `var(...)` is the consumed token, not a hardcoded literal.
const VAR_CALL = /var\(\s*--[A-Za-z0-9-]+[^)]*\)/g;
// Hardcoded design literals: a hex color, or a raw px length (font-size/spacing).
const HEX_COLOR = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g;
const RAW_PX = /\b\d+(?:\.\d+)?px\b/g;

const HARDCODED_REMEDIATION =
  "The UI hardcodes design values instead of consuming the design-guide tokens. " +
  "Replace each hex color / raw px with the matching var(--token) (defined on :root); " +
  "the design system is the single source of truth. See the `ux-adherence` smell.";

/**
 * Flag hardcoded design values (hex colors, raw px font-sizes/spacing) in inline
 * `style=` attributes or `<style>` blocks that should be a `var(--token)` instead.
 * Values inside `var(...)` are exempt (that IS token use) and `:root{...}` token
 * DEFINITIONS are exempt (that is where tokens live). Returns the offending
 * snippets so the build knows what to replace.
 */
export function checkHardcodedValues(stylesOrHtml: string): ElementAdherenceResult {
  // Remove token-definition blocks + token consumptions so neither registers as a
  // hardcoded literal; what remains is genuine hardcoding.
  const scannable = stylesOrHtml.replace(ROOT_BLOCK, " ").replace(VAR_CALL, " ");
  const violations: string[] = [];
  for (const m of scannable.match(HEX_COLOR) ?? []) {
    violations.push(`hardcoded color ${m} (use a var(--color-*) token)`);
  }
  for (const m of scannable.match(RAW_PX) ?? []) {
    violations.push(`hardcoded length ${m} (use a var(--text-*/--space-*) token)`);
  }
  return violations.length === 0
    ? { ok: true, violations: [] }
    : { ok: false, violations, remediation: HARDCODED_REMEDIATION };
}

const SEAM_REMEDIATION =
  "The IA's screens/flows declare these data-testid seams; the rendered UI must " +
  "expose each one so the E2E layer can select it. Render the missing seam (do not " +
  "rename an existing one out from under a test). See the `ux-adherence` smell.";

/**
 * Every required `data-testid` (derived from `ia.md` screens/flows, passed in)
 * must appear in the rendered HTML. A missing seam is a violation: the IA said
 * the element exists but the UI did not render it (or rendered it under a
 * different id). An empty requirement list is trivially clean.
 */
export function checkRequiredSeams(html: string, requiredTestids: string[]): ElementAdherenceResult {
  const violations: string[] = [];
  for (const id of requiredTestids) {
    // Match data-testid="id" / 'id' tolerant of quote style + surrounding space.
    const present = new RegExp(`data-testid\\s*=\\s*["']${escapeRe(id)}["']`).test(html);
    if (!present) violations.push(`missing required data-testid "${id}" (declared in the IA, not rendered)`);
  }
  return violations.length === 0
    ? { ok: true, violations: [] }
    : { ok: false, violations, remediation: SEAM_REMEDIATION };
}

/** Escape a string for safe inclusion in a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// An action surface: a form, or a submit control. A feedback affordance: a
// live/alert region, or a data-testid that names error/success/message/status.
const ACTION_SURFACE = /<form\b|type\s*=\s*["']submit["']|<button\b(?![^>]*type\s*=\s*["'](?:button|reset)["'])/i;
const FEEDBACK_AFFORDANCE = /role\s*=\s*["']alert["']|aria-live\s*=|data-testid\s*=\s*["'][^"']*(?:error|success|message|status)[^"']*["']/i;

const FEEDBACK_REMEDIATION =
  "An action surface (form/submit) renders with no feedback affordance. Give every " +
  "action a result the user can perceive: a role=\"alert\" / aria-live region, or a " +
  "data-testid naming error/success/message/status. No silent failure, no unacknowledged " +
  "success (design-guide User Feedback Principles). See the `ux-adherence` smell.";

/**
 * Heuristic: an action surface (a `<form>` or submit control) must have a feedback
 * affordance somewhere in the rendered HTML (a `role="alert"` / `aria-live` region,
 * or a `data-testid` containing error/success/message/status), per the design-guide
 * "User Feedback Principles". Conservative: only flags when an action surface exists
 * with NO feedback affordance anywhere; HTML with no action surface is clean.
 */
export function checkFeedbackPresent(html: string): ElementAdherenceResult {
  if (!ACTION_SURFACE.test(html)) return { ok: true, violations: [] };
  if (FEEDBACK_AFFORDANCE.test(html)) return { ok: true, violations: [] };
  return {
    ok: false,
    violations: ["an action surface (form/submit) has no feedback affordance (role=alert / aria-live / a *error/success/message/status* data-testid)"],
    remediation: FEEDBACK_REMEDIATION,
  };
}
