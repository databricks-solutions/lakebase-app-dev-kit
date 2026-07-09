// Phase 4 BDD coverage: design-spec-gate refuses phase 4 when
// E2E rows are present but no playwright.config exists, and the new
// e2e-row-perma-red smell fires after N consecutive cycles without GREEN
// on an E2E-tagged AC. Hermetic: tmpdir-based .tdd/ trees, no shell-outs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  analyzeForGate,
  checkE2eGate,
} from "../../scripts/sftdd/design-spec-gate";
import {
  SMELL_CATALOG,
  detectAll,
  detectE2eRowPermaRed,
} from "../../scripts/sftdd/smells";
import type { CycleArtifact, CycleScope } from "../../scripts/sftdd/run-cycle";
import type { TestList } from "../../scripts/sftdd/test-list";

function mkTempProject(prefix: string): { projectDir: string; sftddDir: string } {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), `feip7094-p4-${prefix}-`));
  const sftddDir = path.join(projectDir, ".tdd");
  fs.mkdirSync(sftddDir, { recursive: true });
  return { projectDir, sftddDir };
}

function rmTempProject(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

function seedAc(
  sftddDir: string,
  featureId: string,
  storyId: string,
  acId: string,
  layer?: "API" | "E2E" | "Infra"
): void {
  const dir = path.join(sftddDir, "features", featureId, "stories", storyId, "acs");
  fs.mkdirSync(dir, { recursive: true });
  const ac: Record<string, unknown> = { id: acId, given: "g", when: "w", then: "t", status: "draft" };
  if (layer) ac.layer = layer;
  fs.writeFileSync(path.join(dir, `${acId}.json`), JSON.stringify(ac, null, 2));
}

function seedTestList(sftddDir: string, featureId: string, list: TestList): void {
  const dir = path.join(sftddDir, "features", featureId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "test-list.json"), JSON.stringify(list, null, 2));
}

function cycle(
  acId: string,
  layer: "API" | "E2E" | "Infra" | undefined,
  green: boolean,
  cycleId = `cycle-${Math.floor(Math.random() * 1_000_000)}`
): CycleArtifact {
  return {
    cycle_id: cycleId,
    feature_id: "F1",
    story_id: "S1",
    ac_id: acId,
    test_id: "T1",
    test_description: "smoke",
    layer,
    red_at: "2026-01-01T00:00:00.000Z",
    green_at: green ? "2026-01-01T00:01:00.000Z" : undefined,
  };
}

const SCOPE: CycleScope = {
  sftddDir: "ignored-by-detectors",
  feature_id: "F1",
  story_id: "S1",
  ac_id: "AC-E2E",
};

describe("checkE2eGate", () => {
  let projectDir: string;
  let sftddDir: string;
  beforeEach(() => {
    const t = mkTempProject("gate");
    projectDir = t.projectDir;
    sftddDir = t.sftddDir;
  });
  afterEach(() => rmTempProject(projectDir));

  it("returns [] when the test list has no E2E rows", () => {
    seedAc(sftddDir, "F1", "S1", "AC1", "API");
    const list: TestList = {
      feature_id: "F1",
      items: [{ id: "T1", description: "api test", ac_id: "AC1", status: "pending" }],
    };
    expect(checkE2eGate({ sftddDir, featureId: "F1", list, projectDir })).toEqual([]);
  });

  it("returns [] when E2E rows exist AND playwright.config.ts is present", () => {
    seedAc(sftddDir, "F1", "S1", "AC-E2E", "E2E");
    fs.writeFileSync(path.join(projectDir, "playwright.config.ts"), "// stub\n");
    const list: TestList = {
      feature_id: "F1",
      items: [{ id: "T1", description: "e2e test", ac_id: "AC-E2E", status: "pending" }],
    };
    expect(checkE2eGate({ sftddDir, featureId: "F1", list, projectDir })).toEqual([]);
  });

  it("returns a blocker when E2E rows exist but no playwright.config* is present", () => {
    seedAc(sftddDir, "F1", "S1", "AC-E2E", "E2E");
    const list: TestList = {
      feature_id: "F1",
      items: [{ id: "T1", description: "e2e test", ac_id: "AC-E2E", status: "pending" }],
    };
    const blockers = checkE2eGate({ sftddDir, featureId: "F1", list, projectDir });
    expect(blockers).toHaveLength(1);
    expect(blockers[0].kind).toBe("e2e-without-playwright");
    expect(blockers[0].ac_ids).toEqual(["AC-E2E"]);
    expect(blockers[0].detail).toMatch(/installPlaywright|retag/i);
  });

  it("accepts playwright.config.js and playwright.config.mjs", () => {
    seedAc(sftddDir, "F1", "S1", "AC-E2E", "E2E");
    const list: TestList = {
      feature_id: "F1",
      items: [{ id: "T1", description: "e2e test", ac_id: "AC-E2E", status: "pending" }],
    };
    fs.writeFileSync(path.join(projectDir, "playwright.config.js"), "module.exports = {};\n");
    expect(checkE2eGate({ sftddDir, featureId: "F1", list, projectDir })).toEqual([]);
    fs.rmSync(path.join(projectDir, "playwright.config.js"));
    fs.writeFileSync(path.join(projectDir, "playwright.config.mjs"), "export default {};\n");
    expect(checkE2eGate({ sftddDir, featureId: "F1", list, projectDir })).toEqual([]);
  });

  it("accepts a Playwright config under client/ (React SPA e2e config)", () => {
    // A React-SPA project ships its Playwright at client/playwright.config.ts,
    // not the project root; an E2E AC on such a project must NOT trip
    // e2e-without-playwright (the FEIP-7915 client test lane).
    seedAc(sftddDir, "F1", "S1", "AC-E2E", "E2E");
    const list: TestList = {
      feature_id: "F1",
      items: [{ id: "T1", description: "spa e2e test", ac_id: "AC-E2E", status: "pending" }],
    };
    fs.mkdirSync(path.join(projectDir, "client"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "client", "playwright.config.ts"), "export default {};\n");
    expect(checkE2eGate({ sftddDir, featureId: "F1", list, projectDir })).toEqual([]);
  });

  it("ignores ACs without a declared layer (brownfield safety)", () => {
    seedAc(sftddDir, "F1", "S1", "AC-bare");
    const list: TestList = {
      feature_id: "F1",
      items: [{ id: "T1", description: "ambiguous", ac_id: "AC-bare", status: "pending" }],
    };
    expect(checkE2eGate({ sftddDir, featureId: "F1", list, projectDir })).toEqual([]);
  });

  it("collects every offending AC into a single blocker", () => {
    seedAc(sftddDir, "F1", "S1", "AC-1", "E2E");
    seedAc(sftddDir, "F1", "S1", "AC-2", "E2E");
    seedAc(sftddDir, "F1", "S1", "AC-3", "API");
    const list: TestList = {
      feature_id: "F1",
      items: [
        { id: "T1", description: "e2e a", ac_id: "AC-1", status: "pending" },
        { id: "T2", description: "e2e b", ac_id: "AC-2", status: "pending" },
        { id: "T3", description: "api c", ac_id: "AC-3", status: "pending" },
      ],
    };
    const blockers = checkE2eGate({ sftddDir, featureId: "F1", list, projectDir });
    expect(blockers).toHaveLength(1);
    expect(blockers[0].ac_ids).toEqual(["AC-1", "AC-2"]);
  });
});

describe("analyzeForGate transition_blockers integration", () => {
  let projectDir: string;
  let sftddDir: string;
  beforeEach(() => {
    const t = mkTempProject("integration");
    projectDir = t.projectDir;
    sftddDir = t.sftddDir;
  });
  afterEach(() => rmTempProject(projectDir));

  it("surfaces E2E blockers in the analysis returned to the orchestrator", () => {
    seedAc(sftddDir, "F1", "S1", "AC-E2E", "E2E");
    seedTestList(sftddDir, "F1", {
      feature_id: "F1",
      items: [{ id: "T1", description: "e2e", ac_id: "AC-E2E", status: "pending" }],
    });
    const analysis = analyzeForGate(sftddDir, "F1", "S1", { projectDir });
    expect(analysis.transition_blockers).toHaveLength(1);
    expect(analysis.transition_blockers[0].kind).toBe("e2e-without-playwright");
  });

  it("returns transition_blockers: [] when the gate is clean", () => {
    seedAc(sftddDir, "F1", "S1", "AC1", "API");
    seedTestList(sftddDir, "F1", {
      feature_id: "F1",
      items: [{ id: "T1", description: "api", ac_id: "AC1", status: "pending" }],
    });
    const analysis = analyzeForGate(sftddDir, "F1", "S1", { projectDir });
    expect(analysis.transition_blockers).toEqual([]);
  });

  it("defaults projectDir to dirname(sftddDir) when not supplied", () => {
    // Default convention: <projectDir>/.tdd/. We seed playwright.config
    // at the implicit projectDir and assert no blocker fires.
    seedAc(sftddDir, "F1", "S1", "AC-E2E", "E2E");
    seedTestList(sftddDir, "F1", {
      feature_id: "F1",
      items: [{ id: "T1", description: "e2e", ac_id: "AC-E2E", status: "pending" }],
    });
    fs.writeFileSync(path.join(projectDir, "playwright.config.ts"), "// stub\n");
    const analysis = analyzeForGate(sftddDir, "F1", "S1");
    expect(analysis.transition_blockers).toEqual([]);
  });
});

describe("detectE2eRowPermaRed", () => {
  it("does not fire when fewer than threshold E2E cycles exist", () => {
    const cycles = [cycle("AC-E2E", "E2E", false, "c1"), cycle("AC-E2E", "E2E", false, "c2")];
    expect(detectE2eRowPermaRed({ scope: SCOPE, cycles })).toEqual([]);
  });

  it("fires after three consecutive E2E cycles without GREEN", () => {
    const cycles = [
      cycle("AC-E2E", "E2E", false, "c1"),
      cycle("AC-E2E", "E2E", false, "c2"),
      cycle("AC-E2E", "E2E", false, "c3"),
    ];
    const hits = detectE2eRowPermaRed({ scope: SCOPE, cycles });
    expect(hits).toHaveLength(1);
    expect(hits[0].smell).toBe("e2e-row-perma-red");
    expect(hits[0].cycle_ids).toEqual(["c1", "c2", "c3"]);
    expect(hits[0].detail).toMatch(/AC-E2E/);
  });

  it("does NOT fire if any of the recent N E2E cycles for that AC reached GREEN", () => {
    const cycles = [
      cycle("AC-E2E", "E2E", false, "c1"),
      cycle("AC-E2E", "E2E", true, "c2"),
      cycle("AC-E2E", "E2E", false, "c3"),
    ];
    expect(detectE2eRowPermaRed({ scope: SCOPE, cycles })).toEqual([]);
  });

  it("ignores non-E2E layers when counting", () => {
    const cycles = [
      cycle("AC-A", "API", false, "a1"),
      cycle("AC-A", "API", false, "a2"),
      cycle("AC-A", "API", false, "a3"),
    ];
    expect(detectE2eRowPermaRed({ scope: SCOPE, cycles })).toEqual([]);
  });

  it("groups by ac_id: one AC perma-red, another with mixed greens, only the perma-red fires", () => {
    const cycles = [
      cycle("AC-1", "E2E", false, "x1"),
      cycle("AC-1", "E2E", false, "x2"),
      cycle("AC-1", "E2E", false, "x3"),
      cycle("AC-2", "E2E", true, "y1"),
      cycle("AC-2", "E2E", false, "y2"),
      cycle("AC-2", "E2E", false, "y3"),
    ];
    const hits = detectE2eRowPermaRed({ scope: SCOPE, cycles });
    expect(hits).toHaveLength(1);
    expect(hits[0].cycle_ids).toEqual(["x1", "x2", "x3"]);
    expect(hits[0].detail).toMatch(/AC-1/);
  });

  it("is picked up by detectAll", () => {
    const cycles = [
      cycle("AC-E2E", "E2E", false, "c1"),
      cycle("AC-E2E", "E2E", false, "c2"),
      cycle("AC-E2E", "E2E", false, "c3"),
    ];
    const all = detectAll({ scope: SCOPE, cycles });
    expect(all.some((h) => h.smell === "e2e-row-perma-red")).toBe(true);
  });

  it("SMELL_CATALOG carries the e2e-row-perma-red entry with a remediation", () => {
    const entry = SMELL_CATALOG.find((s) => s.name === "e2e-row-perma-red");
    expect(entry).toBeDefined();
    expect(entry?.proposed_remediation).toMatch(/runner|retag|playwright|BASE_URL/i);
  });
});
