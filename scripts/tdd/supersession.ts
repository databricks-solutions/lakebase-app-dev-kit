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
import { cycleDir } from "./tdd-paths.js";
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
