// Pre-build reflection gate (#3): the per-story verdict artifact + the
// deterministic gate that turns a failed verdict into the routed spec-level
// smell. Routing/bound/escalation itself is the existing revise-route machinery
// (tested elsewhere); here we prove the verdict I/O + the smell attribution +
// per-story isolation.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  writeReflectVerdict,
  readReflectVerdict,
  reflectionPassed,
  recordReflectionGate,
} from "../../scripts/sftdd/reflection.js";

let tdd: string;
const F = "F1";
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "reflection-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

const smellsLog = (): { detected: Array<{ smell: string; story_id?: string; detail: string }> } => {
  const p = join(tdd, "smells.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : { detected: [] };
};

describe("reflect verdict I/O + reflectionPassed", () => {
  it("round-trips a verdict and reports passed only on passed:true", () => {
    expect(readReflectVerdict(tdd, F, "S1")).toBeUndefined();
    expect(reflectionPassed(tdd, F, "S1")).toBe(false); // absent -> not passed

    writeReflectVerdict(tdd, F, "S1", { version: 1, passed: true, findings: [] });
    expect(readReflectVerdict(tdd, F, "S1")?.passed).toBe(true);
    expect(reflectionPassed(tdd, F, "S1")).toBe(true);

    writeReflectVerdict(tdd, F, "S1", {
      version: 1,
      passed: false,
      findings: [{ owner: "spec-author", detail: "AC1 and AC2 contradict" }],
    });
    expect(reflectionPassed(tdd, F, "S1")).toBe(false);
  });
});

describe("recordReflectionGate: failed verdict -> routed spec-level smell(s)", () => {
  it("a passed verdict flags nothing", () => {
    writeReflectVerdict(tdd, F, "S1", { version: 1, passed: true, findings: [] });
    expect(recordReflectionGate(tdd, F, "S1")).toEqual([]);
    expect(smellsLog().detected).toHaveLength(0);
  });

  it("an absent verdict flags nothing", () => {
    expect(recordReflectionGate(tdd, F, "S1")).toEqual([]);
  });

  it("a spec-author finding flags reflect-spec-defect scoped to the story", () => {
    writeReflectVerdict(tdd, F, "S1", {
      version: 1,
      passed: false,
      findings: [{ owner: "spec-author", detail: "AC1 and AC2 contradict" }],
    });
    const hits = recordReflectionGate(tdd, F, "S1");
    expect(hits.map((h) => h.smell)).toEqual(["reflect-spec-defect"]);
    const rows = smellsLog().detected;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ smell: "reflect-spec-defect", story_id: "S1" });
    expect(rows[0].detail).toContain("AC1 and AC2 contradict");
  });

  it("a test-strategist finding flags reflect-testlist-defect", () => {
    writeReflectVerdict(tdd, F, "S1", {
      version: 1,
      passed: false,
      findings: [{ owner: "test-strategist", detail: "AC3 has no covering test" }],
    });
    expect(recordReflectionGate(tdd, F, "S1").map((h) => h.smell)).toEqual(["reflect-testlist-defect"]);
  });

  it("mixed findings flag ONE smell per owner (both authors)", () => {
    writeReflectVerdict(tdd, F, "S1", {
      version: 1,
      passed: false,
      findings: [
        { owner: "spec-author", detail: "vacuous AC" },
        { owner: "test-strategist", detail: "missing fitness test" },
        { owner: "spec-author", detail: "layer conflict" },
      ],
    });
    const smells = recordReflectionGate(tdd, F, "S1").map((h) => h.smell).sort();
    expect(smells).toEqual(["reflect-spec-defect", "reflect-testlist-defect"]);
    // the spec-defect detail aggregates BOTH spec-author findings
    const spec = smellsLog().detected.find((d) => d.smell === "reflect-spec-defect");
    expect(spec?.detail).toContain("vacuous AC");
    expect(spec?.detail).toContain("layer conflict");
  });

  it("a failed verdict with NO attributed owner still blocks (defaults to spec-author)", () => {
    writeReflectVerdict(tdd, F, "S1", { version: 1, passed: false, findings: [] });
    expect(recordReflectionGate(tdd, F, "S1").map((h) => h.smell)).toEqual(["reflect-spec-defect"]);
  });

  it("is per-story isolated: S2's defect does not touch S1", () => {
    writeReflectVerdict(tdd, F, "S1", { version: 1, passed: true, findings: [] });
    writeReflectVerdict(tdd, F, "S2", {
      version: 1,
      passed: false,
      findings: [{ owner: "spec-author", detail: "S2 contradiction" }],
    });
    recordReflectionGate(tdd, F, "S1"); // passes -> nothing
    recordReflectionGate(tdd, F, "S2"); // fails -> one S2-scoped smell
    const rows = smellsLog().detected;
    expect(rows).toHaveLength(1);
    expect(rows[0].story_id).toBe("S2");
    // S1 still reads as passed, unaffected by S2.
    expect(reflectionPassed(tdd, F, "S1")).toBe(true);
  });
});
