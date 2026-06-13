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
} from "../../scripts/tdd/supersession.js";
import { isBuildRefactorRoutableSmell, SMELL_CATALOG } from "../../scripts/tdd/smells.js";

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
