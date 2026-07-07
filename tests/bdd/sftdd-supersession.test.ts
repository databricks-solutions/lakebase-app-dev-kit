// Cross-feature test SUPERSESSION: the Navigator flags PRIOR tests a new AC
// supersedes; the Driver's GREEN turn may then permissively refactor ONLY those.
// These pin the allowlist store + its one-attempt bound + the smell taxonomy so
// the honest-GREEN backstop stays intact for genuine (unflagged) regressions.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  readSupersededTests,
  writeSupersededTests,
  hasPendingSupersession,
  markSupersessionRefactored,
  supersededTestsJson,
  writeGreenFailure,
  readGreenFailure,
  readRegressionAssessment,
  writeRegressionAssessment,
  hasPendingRegressionFix,
  markRegressionFixAttempted,
  composeAssessedGreenFailure,
  MAX_REGRESSION_FIX_ATTEMPTS,
} from "../../scripts/sftdd/supersession.js";
import { isBuildRefactorRoutableSmell, SMELL_CATALOG } from "../../scripts/sftdd/smells.js";

let tdd: string;
const F = "F5-review-submissions";
const S = "S1-hold-submissions-out";
const AC = "AC1-submitted-absent-from-home";

beforeEach(() => {
  tdd = fs.mkdtempSync(path.join(os.tmpdir(), "supersession-"));
});
afterEach(() => {
  fs.rmSync(tdd, { recursive: true, force: true });
});

describe("supersession allowlist store", () => {
  it("round-trips a written allowlist", () => {
    writeSupersededTests(tdd, F, S, AC, {
      tests: ["tests/e2e/test_S1_browse_recipes.py"],
      reason: "submissions default to held-for-review; browse seeds must be approved",
    });
    const got = readSupersededTests(tdd, F, S, AC);
    expect(got?.tests).toEqual(["tests/e2e/test_S1_browse_recipes.py"]);
    expect(got?.reason).toMatch(/held-for-review/);
    // It lands in the per-AC cycle dir.
    expect(fs.existsSync(supersededTestsJson(tdd, F, S, AC))).toBe(true);
  });

  it("returns undefined when absent, empty, or malformed", () => {
    expect(readSupersededTests(tdd, F, S, AC)).toBeUndefined();
    writeSupersededTests(tdd, F, S, AC, { tests: [], reason: "x" });
    expect(readSupersededTests(tdd, F, S, AC)).toBeUndefined(); // empty list => no allowlist
    fs.writeFileSync(supersededTestsJson(tdd, F, S, AC), "{ not json");
    expect(readSupersededTests(tdd, F, S, AC)).toBeUndefined();
  });

  it("is pending until refactored (bounds the self-heal to one attempt)", () => {
    expect(hasPendingSupersession(tdd, F, S, AC)).toBe(false); // none yet
    writeSupersededTests(tdd, F, S, AC, { tests: ["t.py"], reason: "r" });
    expect(hasPendingSupersession(tdd, F, S, AC)).toBe(true);
    markSupersessionRefactored(tdd, F, S, AC);
    // Allowlist still readable (audit), but no longer PENDING -> a second
    // verify failure escalates as a genuine regression.
    expect(readSupersededTests(tdd, F, S, AC)?.refactored).toBe(true);
    expect(hasPendingSupersession(tdd, F, S, AC)).toBe(false);
  });
});

describe("superseded-tests smell taxonomy", () => {
  it("is build-refactor-routable (self-heals in-loop, does not hard-halt)", () => {
    expect(isBuildRefactorRoutableSmell("superseded-tests")).toBe(true);
  });
  it("has a catalog entry distinguishing it from test-list-drift", () => {
    const entry = SMELL_CATALOG.find((s) => s.name === "superseded-tests");
    expect(entry).toBeTruthy();
    expect(entry?.level).toBe("build");
    expect(entry?.description).toMatch(/supersed/i);
  });
});

// ── Navigator->Driver regression-diagnosis handoff ───────────────────────────
// The genuine-regression counterpart of supersession: the Navigator records a
// root-cause diagnosis (and, when driver-fixable, a repair directive) so it
// reaches the Driver / the human instead of being lost to a generic "verify
// FAILED". These pin the store + the one-attempt bound.
describe("regression assessment + driver-fix handoff", () => {
  it("records the Navigator's diagnosis + fix directive (regression-assessment.json)", () => {
    writeRegressionAssessment(tdd, F, S, AC, { diagnosis: "review_state model default is 'submitted'", fixDirective: "default it to 'approved'" });
    const r = readRegressionAssessment(tdd, F, S, AC);
    expect(r?.diagnosis).toMatch(/review_state/);
    expect(r?.fixDirective).toMatch(/approved/);
  });

  it("ignores a diagnosis-less assessment (empty diagnosis => undefined)", () => {
    writeRegressionAssessment(tdd, F, S, AC, { diagnosis: "" });
    expect(readRegressionAssessment(tdd, F, S, AC)).toBeUndefined();
  });

  it("hasPendingRegressionFix is true only for an ASSESSED green-failure carrying a fixDirective, not yet repaired", () => {
    // not assessed yet -> not pending
    writeGreenFailure(tdd, F, S, AC, { assessed: false, summary: "x", fixDirective: "do y" });
    expect(hasPendingRegressionFix(tdd, F, S, AC)).toBe(false);
    // assessed + fixDirective -> pending (routes the Driver repair)
    writeGreenFailure(tdd, F, S, AC, { assessed: true, summary: "x", diagnosis: "why", fixDirective: "do y" });
    expect(hasPendingRegressionFix(tdd, F, S, AC)).toBe(true);
    // assessed but NO fixDirective (not driver-fixable) -> not pending (escalates instead)
    writeGreenFailure(tdd, F, S, AC, { assessed: true, summary: "x", diagnosis: "why" });
    expect(hasPendingRegressionFix(tdd, F, S, AC)).toBe(false);
  });

  it("markRegressionFixAttempted consumes the one repair (pending -> not pending)", () => {
    writeGreenFailure(tdd, F, S, AC, { assessed: true, summary: "x", diagnosis: "why", fixDirective: "do y" });
    expect(hasPendingRegressionFix(tdd, F, S, AC)).toBe(true);
    markRegressionFixAttempted(tdd, F, S, AC);
    expect(hasPendingRegressionFix(tdd, F, S, AC)).toBe(false);
    expect(readGreenFailure(tdd, F, S, AC)?.repairAttempted).toBe(true);
    // diagnosis + directive are preserved (the escalation still carries the WHY)
    expect(readGreenFailure(tdd, F, S, AC)?.diagnosis).toBe("why");
  });
});

describe("composeAssessedGreenFailure preserves the self-heal counter across the assess turn", () => {
  it("carries fixAttempts (so the refactor-until-clean cap actually accumulates)", () => {
    const prior = { assessed: false, summary: "verify FAILED", fixAttempts: 2 };
    const out = composeAssessedGreenFailure(prior, { diagnosis: "orphan file", fixDirective: "git rm app/models.py" });
    expect(out.assessed).toBe(true);
    expect(out.fixAttempts).toBe(2); // NOT reset , the bug that made the loop unbounded
    expect(out.summary).toBe("verify FAILED");
    expect(out.diagnosis).toBe("orphan file");
    expect(out.fixDirective).toBe("git rm app/models.py");
  });
  it("across a full round-trip the counter reaches the cap and then exhausts", () => {
    // Simulate rounds: each round = assess (compose, preserving count) -> repair (increment).
    let gf = { assessed: false, summary: "x" } as ReturnType<typeof composeAssessedGreenFailure>;
    for (let round = 1; round <= MAX_REGRESSION_FIX_ATTEMPTS; round++) {
      gf = composeAssessedGreenFailure(gf, { fixDirective: "fix" });
      gf = { ...gf, fixAttempts: (gf.fixAttempts ?? 0) + 1 }; // markRegressionFixAttempted
    }
    expect(gf.fixAttempts).toBe(MAX_REGRESSION_FIX_ATTEMPTS); // reaches the cap (was stuck at 1 before the fix)
  });
  it("omits fixAttempts when the prior record had none (first assess)", () => {
    const out = composeAssessedGreenFailure({ assessed: false, summary: "x" });
    expect(out.fixAttempts).toBeUndefined();
  });
});
