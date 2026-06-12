// e2e-regex-clean: a deterministic, model-independent static lint that catches
// Playwright text/URL matchers built from a Python regex carrying INLINE FLAGS
// (`(?i)`/`(?s)`/`(?m)`/`(?x)`/`(?a)` and combinations like `(?is)`).
//
// Why this exists: Playwright forwards a compiled pattern's `.pattern` string
// verbatim into the browser's JavaScript regex engine. JS regex does NOT support
// Python's inline-flag syntax, so `re.compile(r"(?i)summary")` becomes the
// invalid JS regex `/(?i)summary/i` and the assertion can NEVER match the
// running app. The test is structurally un-greenable: the honest-GREEN verify
// rejects it and the Driver must raise it to the HIL with a generic
// "GREEN verify FAILED" message that does not name the cause.
//
// This lint names the cause precisely + cheaply (no browser run), so the
// escalation, or an earlier check, points straight at the fix: pass the flag as
// a kwarg, `re.compile("summary", re.IGNORECASE)`, which emits the valid `/summary/i`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** A Python inline-flag group at the START of a regex: `(?i)`, `(?ims)`, `(?-i)`,
 *  `(?a)`, etc. (the scoped form `(?i:...)` is valid JS and NOT matched). */
const INLINE_FLAG_RE = /\(\?[aiLmsux]*[-]?[aiLmsux]+\)/;

/** A `re.compile(<string-literal>, ...)` call, capturing the literal's body.
 *  Handles optional r/R/b/u/f prefixes and single or double quotes. Multi-flag
 *  or kwarg-flag forms (`re.compile("x", re.I)`) put their flags OUTSIDE the
 *  literal, so they never match INLINE_FLAG_RE , exactly the correct form. */
const RE_COMPILE_RE = /re\.compile\(\s*[rRbuf]*(["'])((?:\\.|(?!\1).)*)\1/g;

export interface E2eRegexViolation {
  /** Project-relative file path. */
  file: string;
  /** 1-based line number of the offending `re.compile(...)`. */
  line: number;
  /** The offending regex literal body (e.g. `(?i)summary`). */
  pattern: string;
}

export interface E2eRegexCleanResult {
  clean: boolean;
  violations: E2eRegexViolation[];
  /** Remediation pointing at the fix when `clean` is false. */
  remediation?: string;
}

export const E2E_REGEX_REMEDIATION =
  "A Playwright matcher uses a Python regex with inline flags (e.g. re.compile(r\"(?i)summary\")). " +
  "Playwright forwards the pattern verbatim to the browser's JavaScript engine, which does not support " +
  "inline-flag syntax , the assertion can never match. Pass the flag as a kwarg instead: " +
  "re.compile(\"summary\", re.IGNORECASE). See the E2E rule in the Navigator role + the " +
  "e2e-inline-regex-flag bad smell.";

/** Scan one Python source for `re.compile(<literal-with-inline-flags>)`. */
export function findInlineFlagRegexes(source: string, file: string): E2eRegexViolation[] {
  const violations: E2eRegexViolation[] = [];
  let m: RegExpExecArray | null;
  RE_COMPILE_RE.lastIndex = 0;
  while ((m = RE_COMPILE_RE.exec(source)) !== null) {
    const body = m[2];
    if (!INLINE_FLAG_RE.test(body)) continue;
    // 1-based line of the match start.
    const line = source.slice(0, m.index).split("\n").length;
    violations.push({ file, line, pattern: body });
  }
  return violations;
}

function pythonFilesUnder(dir: string, rootForRel: string): Array<{ abs: string; rel: string }> {
  const out: Array<{ abs: string; rel: string }> = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "__pycache__" || name === ".pytest_cache") continue;
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...pythonFilesUnder(abs, rootForRel));
    } else if (name.endsWith(".py")) {
      out.push({ abs, rel: abs.slice(rootForRel.length + 1) });
    }
  }
  return out;
}

/**
 * Lint the project's E2E Playwright tests for inline-flag regex matchers.
 * Scans `tests/e2e/**` (where the kit places browser tests) by convention; a
 * project without that dir is trivially clean. Deterministic + model-independent.
 */
export function checkE2eRegexClean(args: { projectDir: string; e2eDir?: string }): E2eRegexCleanResult {
  const e2eRoot = join(args.projectDir, args.e2eDir ?? join("tests", "e2e"));
  const files = pythonFilesUnder(e2eRoot, args.projectDir);
  const violations: E2eRegexViolation[] = [];
  for (const f of files) {
    let src: string;
    try {
      src = readFileSync(f.abs, "utf8");
    } catch {
      continue;
    }
    violations.push(...findInlineFlagRegexes(src, f.rel));
  }
  if (violations.length === 0) return { clean: true, violations: [] };
  return { clean: false, violations, remediation: E2E_REGEX_REMEDIATION };
}

/** One-line human summary of the violations (for a verify-failure diagnostic). */
export function summarizeE2eRegexViolations(violations: E2eRegexViolation[]): string {
  return violations
    .map((v) => `${v.file}:${v.line} inline-flag regex \`${v.pattern}\` (invalid in Playwright/JS)`)
    .join("; ");
}
