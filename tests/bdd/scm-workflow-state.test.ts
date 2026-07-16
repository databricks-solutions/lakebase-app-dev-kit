// Unit tests for the SCM workflow state surface (phase A).
//
// Covers: validator (positive + negative shapes), atomic write +
// round-trip read, init scaffold-complete factory, describeGates ladder.
// Phase A is advisory; these tests pin the contract Phase B's transition
// CLIs will build on.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  SCM_STATES,
  describeGates,
  initWorkflowState,
  isForeignFeatureClaim,
  readWorkflowState,
  stateFilePath,
  STATE_FILE_REL,
  validateWorkflowState,
  writeWorkflowState,
  type ScmWorkflowState,
} from "../../scripts/lakebase/scm-workflow-state";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scm-state-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("SCM_STATES", () => {
  it("lists the five canonical states in transition order", () => {
    expect([...SCM_STATES]).toEqual([
      "scaffold-complete",
      "feature-claimed",
      "pr-ready",
      "ci-green",
      "merged",
    ]);
  });
});

describe("initWorkflowState", () => {
  it("produces a scaffold-complete record carrying tier + project id", () => {
    const s = initWorkflowState({
      projectId: "my-app",
      tierTopology: 2,
    });
    expect(s.state).toBe("scaffold-complete");
    expect(s.tier_topology).toBe(2);
    expect(s.project_id).toBe("my-app");
    expect(s.version).toBe(1);
    expect(s.$schema).toBe("./scm-workflow-state.schema.json");
  });
});

describe("validateWorkflowState", () => {
  const base: ScmWorkflowState = {
    version: 1,
    state: "scaffold-complete",
    tier_topology: 2,
    project_id: "app1",
  };

  it("accepts a valid scaffold-complete record", () => {
    const r = validateWorkflowState(base);
    expect(r.ok).toBe(true);
  });

  it("rejects unknown top-level keys", () => {
    const r = validateWorkflowState({ ...base, surprise: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.path === "surprise")).toBe(true);
    }
  });

  it("rejects wrong version", () => {
    const r = validateWorkflowState({ ...base, version: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.path === "version")).toBe(true);
    }
  });

  it("rejects out-of-enum state", () => {
    const r = validateWorkflowState({ ...base, state: "frobnicated" });
    expect(r.ok).toBe(false);
  });

  it("rejects tier_topology values outside 1..3", () => {
    const r = validateWorkflowState({ ...base, tier_topology: 4 });
    expect(r.ok).toBe(false);
  });

  it("requires feature_id + branch + parent_branch + uid + claimed_at for feature-claimed", () => {
    const r = validateWorkflowState({
      ...base,
      state: "feature-claimed",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const paths = r.errors.map((e) => e.path);
      expect(paths).toContain("feature_id");
      expect(paths).toContain("branch");
      expect(paths).toContain("parent_branch");
      expect(paths).toContain("lakebase_branch_uid");
      expect(paths).toContain("claimed_at");
    }
  });

  it("accepts a complete feature-claimed record", () => {
    const r = validateWorkflowState({
      ...base,
      state: "feature-claimed",
      feature_id: "F1",
      branch: "feature/initial-domain",
      parent_branch: "staging",
      lakebase_branch_uid: "br-broad-sky-d2k5gewt",
      claimed_at: "2026-06-03T05:00:00Z",
    });
    expect(r.ok).toBe(true);
  });

  it("escalates required-field set as state advances", () => {
    const claimed: ScmWorkflowState = {
      ...base,
      state: "feature-claimed",
      feature_id: "F1",
      branch: "feature/x",
      parent_branch: "staging",
      lakebase_branch_uid: "br-x",
      claimed_at: "2026-06-03T05:00:00Z",
    };
    // pr-ready demands pr_url + pushed_at on top of the feature fields
    const prMissing = validateWorkflowState({ ...claimed, state: "pr-ready" });
    expect(prMissing.ok).toBe(false);
    const prOk = validateWorkflowState({
      ...claimed,
      state: "pr-ready",
      pr_url: "https://github.com/owner/repo/pull/1",
      pushed_at: "2026-06-03T05:10:00Z",
    });
    expect(prOk.ok).toBe(true);
  });
});

describe("writeWorkflowState + readWorkflowState round-trip", () => {
  it("creates .lakebase/ if missing and persists a readable state", () => {
    const s: ScmWorkflowState = {
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "my-app",
    };
    expect(fs.existsSync(path.join(tmpDir, ".lakebase"))).toBe(false);
    writeWorkflowState(tmpDir, s);
    expect(fs.existsSync(stateFilePath(tmpDir))).toBe(true);
    expect(stateFilePath(tmpDir)).toBe(
      path.join(tmpDir, STATE_FILE_REL),
    );
    const read = readWorkflowState(tmpDir);
    expect(read).toEqual(s);
  });

  it("returns null when no state file exists", () => {
    expect(readWorkflowState(tmpDir)).toBeNull();
  });

  it("throws when the file is malformed JSON", () => {
    fs.mkdirSync(path.join(tmpDir, ".lakebase"));
    fs.writeFileSync(stateFilePath(tmpDir), "{ not json", "utf8");
    expect(() => readWorkflowState(tmpDir)).toThrow(/Failed to parse/);
  });

  it("throws when the file shape is invalid", () => {
    fs.mkdirSync(path.join(tmpDir, ".lakebase"));
    fs.writeFileSync(
      stateFilePath(tmpDir),
      JSON.stringify({ version: 1, state: "scaffold-complete" }),
      "utf8",
    );
    expect(() => readWorkflowState(tmpDir)).toThrow(/Invalid/);
  });

  it("refuses to write an invalid state", () => {
    expect(() =>
      writeWorkflowState(tmpDir, {
        // Intentionally missing project_id + tier_topology.
        version: 1,
        state: "scaffold-complete",
      } as unknown as ScmWorkflowState),
    ).toThrow(/Refusing to write/);
    expect(fs.existsSync(path.join(tmpDir, ".lakebase"))).toBe(false);
  });

  it("writes a stable, human-readable key order", () => {
    const s: ScmWorkflowState = {
      version: 1,
      state: "feature-claimed",
      tier_topology: 2,
      project_id: "app",
      feature_id: "F1",
      branch: "feature/x",
      parent_branch: "staging",
      lakebase_branch_uid: "br-x",
      claimed_at: "2026-06-03T05:00:00Z",
    };
    writeWorkflowState(tmpDir, s);
    const raw = fs.readFileSync(stateFilePath(tmpDir), "utf8");
    // Keys should appear in the canonical order.
    const versionIdx = raw.indexOf('"version"');
    const stateIdx = raw.indexOf('"state"');
    const tierIdx = raw.indexOf('"tier_topology"');
    const projectIdx = raw.indexOf('"project_id"');
    const featureIdx = raw.indexOf('"feature_id"');
    expect(versionIdx).toBeGreaterThan(-1);
    expect(versionIdx).toBeLessThan(stateIdx);
    expect(stateIdx).toBeLessThan(tierIdx);
    expect(tierIdx).toBeLessThan(projectIdx);
    expect(projectIdx).toBeLessThan(featureIdx);
  });
});

describe("describeGates", () => {
  it("marks all later gates pending from scaffold-complete", () => {
    const s = initWorkflowState({ projectId: "p", tierTopology: 2 });
    const gates = describeGates(s);
    expect(gates.map((g) => g.name)).toEqual([...SCM_STATES]);
    const passed = gates.filter((g) => g.passed).map((g) => g.name);
    const pending = gates.filter((g) => !g.passed).map((g) => g.name);
    expect(passed).toEqual(["scaffold-complete"]);
    expect(pending).toEqual([
      "feature-claimed",
      "pr-ready",
      "ci-green",
      "merged",
    ]);
  });

  it("marks the current gate as current=true and earlier as passed", () => {
    const s: ScmWorkflowState = {
      version: 1,
      state: "pr-ready",
      tier_topology: 2,
      project_id: "p",
      feature_id: "F1",
      branch: "feature/x",
      parent_branch: "staging",
      lakebase_branch_uid: "br-x",
      claimed_at: "2026-06-03T05:00:00Z",
      pr_url: "https://github.com/o/r/pull/1",
      pushed_at: "2026-06-03T05:10:00Z",
    };
    const gates = describeGates(s);
    const current = gates.find((g) => g.current);
    expect(current?.name).toBe("pr-ready");
    expect(gates.find((g) => g.name === "scaffold-complete")?.passed).toBe(
      true,
    );
    expect(gates.find((g) => g.name === "feature-claimed")?.passed).toBe(true);
    expect(gates.find((g) => g.name === "ci-green")?.passed).toBe(false);
  });

  it("reports invariant presence for the gate's required fields", () => {
    const s: ScmWorkflowState = {
      version: 1,
      state: "feature-claimed",
      tier_topology: 2,
      project_id: "p",
      feature_id: "F1",
      branch: "feature/x",
      parent_branch: "staging",
      lakebase_branch_uid: "br-x",
      claimed_at: "2026-06-03T05:00:00Z",
    };
    const gates = describeGates(s);
    const claimed = gates.find((g) => g.name === "feature-claimed");
    expect(claimed).toBeDefined();
    const keys = claimed!.invariants.map((i) => i.key);
    expect(keys).toContain("feature_id");
    expect(keys).toContain("branch");
    expect(keys).toContain("parent_branch");
    expect(keys).toContain("lakebase_branch_uid");
    expect(keys).toContain("claimed_at");
    expect(claimed!.invariants.every((i) => i.present)).toBe(true);
  });
});

describe("isForeignFeatureClaim (FEIP-8023)", () => {
  const claim = (feature_id?: string): ScmWorkflowState =>
    ({ version: 1, state: "merged", feature_id, branch: feature_id ? `feature-${feature_id}` : undefined } as ScmWorkflowState);

  it("true when the recorded claim names a DIFFERENT feature than the one being driven", () => {
    expect(isForeignFeatureClaim(claim("f1-stock-by-location"), "f2-adjust-stock")).toBe(true);
  });

  it("false when the recorded claim matches the feature being driven", () => {
    expect(isForeignFeatureClaim(claim("f2-adjust-stock"), "f2-adjust-stock")).toBe(false);
  });

  it("false on a case/whitespace-only difference (canonical comparison)", () => {
    expect(isForeignFeatureClaim(claim("F2-Adjust-Stock"), "  f2-adjust-stock ")).toBe(false);
  });

  it("false when there is no recorded claim (null state) , not a foreign claim", () => {
    expect(isForeignFeatureClaim(null, "f2-adjust-stock")).toBe(false);
  });

  it("false when the claim has no feature_id recorded", () => {
    expect(isForeignFeatureClaim(claim(undefined), "f2-adjust-stock")).toBe(false);
  });

  it("false when driving planning (empty featureId)", () => {
    expect(isForeignFeatureClaim(claim("f1-stock-by-location"), "")).toBe(false);
  });
});
