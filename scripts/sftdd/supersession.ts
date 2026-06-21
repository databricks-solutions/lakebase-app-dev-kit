// Cross-feature test SUPERSESSION: when a new AC intentionally changes behavior
// that PRIOR tests (often from earlier features) encode, the Navigator FLAGS
// those prior tests as superseded-by-this-AC, and the Driver is then permitted to
// PERMISSIVELY REFACTOR only those flagged tests (alongside the code) so the new
// AC's behavior can be honestly GREEN. This is the legitimate counterpart to the
// `test-list-drift` smell (an IN-SCOPE contradiction, which stays blocking): a
// new requirement supersedes an old one, and accumulated tests must follow the
// latest AC. The allowlist is the contract that bounds what the Driver may touch,
// so the honest-GREEN backstop still halts on any UNflagged regression.

import * as fs from "node:fs";
import { cycleDir } from "./sftdd-paths.js";
import { join } from "node:path";

export interface SupersededTests {
  /** Test files / node-ids the new AC supersedes; the Driver may refactor ONLY these. */
  tests: string[];
  /** Why the prior tests are superseded (the new AC + what behavior changed). */
  reason: string;
  /** True once the Driver has applied a permissive refactor for this allowlist
   *  (bounds the self-heal to one attempt before the honest-GREEN backstop escalates). */
  refactored?: boolean;
}

/** Path to the per-AC superseded-tests allowlist the Navigator writes. */
export function supersededTestsJson(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): string {
  return join(cycleDir(tdd, feature, story, ac), "superseded-tests.json");
}

/** Read the superseded-tests allowlist for an AC, or undefined when none/malformed. */
export function readSupersededTests(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): SupersededTests | undefined {
  const file = supersededTestsJson(tdd, feature, story, ac);
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as SupersededTests;
    if (!Array.isArray(parsed.tests) || parsed.tests.length === 0) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/** Write/replace the superseded-tests allowlist for an AC (the Navigator's flag). */
export function writeSupersededTests(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
  value: SupersededTests,
): void {
  const file = supersededTestsJson(tdd, feature, story, ac);
  fs.mkdirSync(join(cycleDir(tdd, feature, story, ac)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

/**
 * True when a superseded-tests allowlist exists for the AC AND a permissive
 * refactor has NOT yet been attempted. This is the gate the honest-GREEN verify
 * consults: a flagged-but-not-yet-refactored AC routes to a bounded Driver
 * permissive-refactor turn instead of escalating; an already-attempted one (or
 * one with no allowlist) escalates as a genuine regression.
 */
export function hasPendingSupersession(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): boolean {
  const s = readSupersededTests(tdd, feature, story, ac);
  return s !== undefined && s.refactored !== true;
}

/** Mark the allowlist as refactored (consume the one permissive-refactor attempt). */
export function markSupersessionRefactored(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): void {
  const s = readSupersededTests(tdd, feature, story, ac);
  if (!s) return;
  writeSupersededTests(tdd, feature, story, ac, { ...s, refactored: true });
}

// ── Green-failure assessment marker (the reactive supersession trigger) ──────
//
// When the honest-GREEN verify FAILS, the break is often UNFORESEEN (only the
// full-suite run reveals a prior test the new AC superseded). So instead of
// escalating immediately, the first failure routes a NAVIGATOR assess turn: it
// inspects the failing tests and either flag-supersedes them (-> the Driver's
// permissive green) or confirms a genuine regression (-> escalate). This marker
// records that a failure is awaiting / has had that one assessment, bounding the
// loop so a still-failing verify after the assess escalates as a real regression.

export interface GreenFailure {
  /** True once the Navigator has assessed this failure (flagged or not). */
  assessed: boolean;
  /** The verify failure summary the Navigator assesses. */
  summary: string;
  /** The Navigator's root-cause diagnosis recorded at assess time (the WHY the
   *  verify failed), so a regression escalation , and any Driver repair , carries
   *  the finding instead of the generic "verify FAILED". */
  diagnosis?: string;
  /** When the Navigator judged the regression DRIVER-FIXABLE: the concrete repair
   *  directive handed to a bounded Driver repair turn. Absent => not driver-fixable
   *  (escalate to HIL with the diagnosis). */
  fixDirective?: string;
  /** True once the Driver has consumed its one repair attempt (bounds the
   *  navigator->driver repair to a single pass before the honest-GREEN backstop
   *  escalates, symmetric to SupersededTests.refactored). */
  repairAttempted?: boolean;
}

export function greenFailureJson(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): string {
  return join(cycleDir(tdd, feature, story, ac), "green-failure.json");
}

export function readGreenFailure(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): GreenFailure | undefined {
  const file = greenFailureJson(tdd, feature, story, ac);
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as GreenFailure;
  } catch {
    return undefined;
  }
}

export function writeGreenFailure(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
  value: GreenFailure,
): void {
  fs.mkdirSync(cycleDir(tdd, feature, story, ac), { recursive: true });
  fs.writeFileSync(greenFailureJson(tdd, feature, story, ac), JSON.stringify(value, null, 2) + "\n");
}

/** Remove the marker (the verify passed, or the cycle moved on). */
export function clearGreenFailure(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): void {
  fs.rmSync(greenFailureJson(tdd, feature, story, ac), { force: true });
}

/** An AC whose GREEN verify failed and has NOT yet been assessed by the
 *  Navigator (drives the reactive assess turn). */
export function needsGreenAssess(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): boolean {
  const gf = readGreenFailure(tdd, feature, story, ac);
  return gf !== undefined && gf.assessed !== true;
}

/**
 * A genuine regression the Navigator assessed AND judged driver-fixable (it
 * recorded a `fixDirective`), whose one bounded repair attempt has not been
 * consumed. This routes a Driver REPAIR turn (the diagnosis + directive injected)
 * instead of a terminal escalation. Symmetric to {@link hasPendingSupersession}:
 * the genuine-regression counterpart that the Driver can act on. An assessed
 * regression WITHOUT a fixDirective (not driver-fixable) escalates to the HIL.
 */
export function hasPendingRegressionFix(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): boolean {
  const gf = readGreenFailure(tdd, feature, story, ac);
  return gf !== undefined && gf.assessed === true && typeof gf.fixDirective === "string" && gf.fixDirective.length > 0 && gf.repairAttempted !== true;
}

/** Mark the regression-fix as attempted (consume the one Driver repair). */
export function markRegressionFixAttempted(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): void {
  const gf = readGreenFailure(tdd, feature, story, ac);
  if (!gf) return;
  writeGreenFailure(tdd, feature, story, ac, { ...gf, repairAttempted: true });
}

// ── Navigator's regression assessment (the diagnosis hand-off) ───────────────
//
// When the Navigator assesses a green-failure as a GENUINE regression (not a
// supersession), it records its root-cause diagnosis here , and, when it judges
// the Driver can fix it, a concrete repair directive. This is the inter-agent API
// for the regression path, exactly as superseded-tests.json is for supersession:
// the Navigator WRITES it, and the deterministic `assess-green` effect READS it to
// either route a bounded Driver repair turn (fixDirective present) or escalate to
// the HIL carrying the diagnosis (absent). Without it, assess-green escalates with
// the bare verify summary (the prior, diagnosis-free behavior).

export interface RegressionAssessment {
  /** The Navigator's root-cause finding (the WHY the honest-GREEN verify failed). */
  diagnosis: string;
  /** When the Driver can fix it: what to change. Absent => not driver-fixable. */
  fixDirective?: string;
}

export function regressionAssessmentJson(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): string {
  return join(cycleDir(tdd, feature, story, ac), "regression-assessment.json");
}

export function readRegressionAssessment(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
): RegressionAssessment | undefined {
  const file = regressionAssessmentJson(tdd, feature, story, ac);
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as RegressionAssessment;
    if (typeof parsed.diagnosis !== "string" || parsed.diagnosis.length === 0) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function writeRegressionAssessment(
  tdd: string,
  feature: string,
  story: string,
  ac: string,
  value: RegressionAssessment,
): void {
  fs.mkdirSync(cycleDir(tdd, feature, story, ac), { recursive: true });
  fs.writeFileSync(regressionAssessmentJson(tdd, feature, story, ac), JSON.stringify(value, null, 2) + "\n");
}
