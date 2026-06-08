// Build replay (fast-forward-to-release): restoreBuildTurn restores a story's
// recorded build (code tree + GREEN/reviewed cycles + experiment) so the
// deterministic driver skips Navigator/Driver and lands on await-acceptance ,
// the (now deterministic) Release Engineer deploy. Hermetic: real fs, tmpdirs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { restoreBuildTurn } from "../../scripts/tdd/replay-build.js";
import { diskArtifactProbe } from "../../scripts/tdd/orchestrator-probe.js";

const F = "F1-file-bug";
const S = "S1-create-bug";
let corpus: string;
let proj: string;
let tdd: string;
const writeJson = (p: string, o: unknown): void => {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, JSON.stringify(o, null, 2));
};

beforeEach(() => {
  corpus = mkdtempSync(join(tmpdir(), "rb-corpus-"));
  proj = mkdtempSync(join(tmpdir(), "rb-proj-"));
  tdd = join(proj, ".tdd");

  // ── build corpus: code/ (incl. a scaffold-owned scripts/ that must NOT restore)
  const code = join(corpus, "features", F, "stories", S, "code");
  mkdirSync(join(code, "app"), { recursive: true });
  writeFileSync(join(code, "app", "main.py"), "# built by the driver\n");
  mkdirSync(join(code, "tests"), { recursive: true });
  writeFileSync(join(code, "tests", "test_app.py"), "def test_ok(): assert True\n");
  mkdirSync(join(code, "scripts"), { recursive: true });
  writeFileSync(join(code, "scripts", "lk"), "#stale snapshot lk , must NOT clobber the fresh scaffold\n");
  // ── build corpus: tdd/cycles (GREEN + reviewed) + experiment outcomes
  const cy = join(corpus, "features", F, "stories", S, "tdd", "cycles", F, S, "AC1-create-form-accessible");
  writeJson(join(cy, "cycle-001.json"), {
    cycle_id: "cycle-001", feature_id: F, story_id: S, ac_id: "AC1-create-form-accessible",
    test_id: "T1", experiment_slug: "exp1", branch_id: "experiment-s1-create-bug-exp1",
    red_at: "2026-06-08T00:00:00.000Z", green_at: "2026-06-08T00:01:00.000Z", layer: "E2E",
  });
  writeJson(join(cy, "review.json"), { reviewed_at: "2026-06-08T00:02:00.000Z", refactor_requested: false });
  writeJson(
    join(corpus, "features", F, "stories", S, "tdd", "experiments", F, S, "exp1", "outcomes.json"),
    { status: "running", by_tag: { e2e: { passed: 1, failed: 0 } } },
  );

  // ── target project: a FRESH scaffold's scripts/lk + the design artifacts the
  //    design replay + scope effect produced (per-story test-list with T1).
  mkdirSync(join(proj, "scripts"), { recursive: true });
  writeFileSync(join(proj, "scripts", "lk"), "#FRESH scaffold lk\n");
  const sdir = join(tdd, "features", F, "stories", S);
  writeJson(join(sdir, "acs", "AC1-create-form-accessible.json"), { id: "AC1-create-form-accessible", layer: "E2E" });
  writeJson(join(sdir, "test-list-per-story.json"), {
    feature_id: F, story_id: S, items: [{ id: "T1", description: "form renders", ac_id: "AC1-create-form-accessible", status: "pending" }],
  });
});
afterEach(() => {
  rmSync(corpus, { recursive: true, force: true });
  rmSync(proj, { recursive: true, force: true });
});

describe("restoreBuildTurn", () => {
  it("restores the code tree + green/reviewed cycles, skipping scaffold-owned paths", () => {
    const ok = restoreBuildTurn({ replayBuildDir: corpus, projectDir: proj, tddDir: tdd, featureId: F, story: S });
    expect(ok).toBe(true);
    // code overlaid onto the project working tree
    expect(readFileSync(join(proj, "app", "main.py"), "utf8")).toMatch(/built by the driver/);
    expect(existsSync(join(proj, "tests", "test_app.py"))).toBe(true);
    // scaffold-owned scripts/lk is NOT clobbered by the snapshot's stale copy
    expect(readFileSync(join(proj, "scripts", "lk"), "utf8")).toBe("#FRESH scaffold lk\n");
    // cycles + experiment restored into .tdd
    expect(existsSync(join(tdd, "cycles", F, S, "AC1-create-form-accessible", "cycle-001.json"))).toBe(true);
    expect(existsSync(join(tdd, "experiments", F, S, "exp1", "outcomes.json"))).toBe(true);
  });

  it("after restore the driver sees the story BUILT + reviewed (lands on await-acceptance, not navigator/driver)", () => {
    restoreBuildTurn({ replayBuildDir: corpus, projectDir: proj, tddDir: tdd, featureId: F, story: S });
    const probe = diskArtifactProbe(tdd, F);
    expect(probe.codeWritten(S)).toBe(true); // T1 has a green cycle -> all green
    expect(probe.reviewPendingAc(S)).toBeNull(); // review.json stamped reviewed
    expect(probe.refactorPendingAc(S)).toBeNull(); // no refactor requested
  });

  it("is a no-op (returns false) when the corpus lacks the story , falls back to the live build", () => {
    const ok = restoreBuildTurn({ replayBuildDir: corpus, projectDir: proj, tddDir: tdd, featureId: F, story: "S2-view-bug-detail" });
    expect(ok).toBe(false);
    expect(existsSync(join(proj, "app"))).toBe(false); // miss copies nothing
  });
});
