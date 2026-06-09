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
