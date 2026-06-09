import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { writeMasterTestList } from "../../scripts/tdd/test-list";
import {
  writePlan,
  recordPlan,
  type ExperimentPlan,
} from "../../scripts/tdd/design-spec-gate";
import {
  getFeatureStatus,
  renderFeatureStatus,
} from "../../scripts/tdd/feature-status";

let tdd: string;
const FEATURE_ID = "F1-checkout";

const SAMPLE_PLAN: ExperimentPlan = {
  feature_id: FEATURE_ID,
  story_id: "S1",
  N: 1,
  mode: "N=1",
  strategies: [
    { name: "checkout", rationale: "default single-experiment for N=1" },
  ],
  budget: { concurrent_branches: 1, wall_clock_minutes: 120, agent_pairs: 1 },
  rationale: "no opinion gaps detected",
};

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-feature-status-"));
  mkdirSync(join(tdd, "features", FEATURE_ID), { recursive: true });
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

function stageN1Fixture() {
  writeMasterTestList(tdd, {
    feature_id: FEATURE_ID,
    items: [
      { id: "T1", description: "happy path returns 201", ac_id: "AC1", status: "green" },
      { id: "T2", description: "rejects empty cart with 400", ac_id: "AC1", status: "refactored" },
      { id: "T3", description: "inventory check fails 409", ac_id: "AC2", status: "pending" },
      { id: "T4", description: "payment retries on transient", ac_id: "AC3", status: "pending" },
      { id: "T5", description: "audit log entry written", ac_id: "AC4", status: "pending" },
    ],
  });

  writePlan(tdd, SAMPLE_PLAN);
  recordPlan(tdd, SAMPLE_PLAN, "kevin.hartman@databricks.com");

  const expDir = join(tdd, "experiments", FEATURE_ID, "S1", "checkout");
  mkdirSync(expDir, { recursive: true });
  writeFileSync(join(expDir, "branch.txt"), "br-feat-add-orders");
  writeFileSync(join(expDir, "notes.md"), "# checkout\n");
  writeFileSync(
    join(expDir, "outcomes.json"),
    JSON.stringify({ status: "running", tests_passed: 2, tests_failed: 0 }) + "\n"
  );
  writeFileSync(
    join(expDir, "timeline.json"),
    JSON.stringify({
      entries: [
        { ts: "2026-05-27T10:00:00Z", kind: "cut", branch: "br-feat-add-orders" },
        { ts: "2026-05-27T10:30:00Z", kind: "cycle-start" },
        { ts: "2026-05-27T10:35:00Z", kind: "red" },
        { ts: "2026-05-27T10:40:00Z", kind: "green" },
      ],
    }) + "\n"
  );

  writeFileSync(
    join(tdd, "workflow-state.json"),
    JSON.stringify({
      phase: "implementation",
      started_at: "2026-05-27T10:00:00Z",
      feature_id: FEATURE_ID,
      cycle_id: "C1",
    }) + "\n"
  );
}

describe("feature-status N=1 snapshot", () => {
  it("getFeatureStatus aggregates plan, test-list, experiments, smells, and selection log", () => {
    stageN1Fixture();
    const snapshot = getFeatureStatus(tdd, FEATURE_ID);

    expect(snapshot.feature_id).toBe(FEATURE_ID);
    expect(snapshot.current_workflow_phase).toBe("implementation");
    expect(snapshot.current_workflow_pointer?.feature_id).toBe(FEATURE_ID);
    expect(snapshot.plans).toHaveLength(1);
    expect(snapshot.plans[0].story_id).toBe("S1");
    expect(snapshot.plans[0].plan.mode).toBe("N=1");
    expect(snapshot.plans[0].plan.N).toBe(1);

    expect(snapshot.test_list?.total).toBe(5);
    expect(snapshot.test_list?.by_status.green).toBe(1);
    expect(snapshot.test_list?.by_status.refactored).toBe(1);
    expect(snapshot.test_list?.by_status.pending).toBe(3);
    expect(snapshot.test_list?.completion_pct).toBe(40); // 2/5

    expect(snapshot.experiments).toHaveLength(1);
    expect(snapshot.experiments[0].slug).toBe("checkout");
    expect(snapshot.experiments[0].branch_id).toBe("br-feat-add-orders");
    expect(snapshot.experiments[0].status).toBe("running");
    expect(snapshot.experiments[0].tests_passed).toBe(2);
    expect(snapshot.experiments[0].cycle_count).toBe(4);

    expect(snapshot.selection_log_recent.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.selection_log_recent.at(-1)?.title).toContain(
      `Experiment plan for ${FEATURE_ID}`
    );

    expect(snapshot.open_smells).toEqual([]);
  });

  it("renderFeatureStatus produces a one-screen human-readable summary", () => {
    stageN1Fixture();
    const text = renderFeatureStatus(getFeatureStatus(tdd, FEATURE_ID));
    expect(text).toMatch(/Feature: F1-checkout/);
    expect(text).toMatch(/Phase: implementation \(active workflow\)/);
    expect(text).toMatch(/Plan \[S1\]: N=1 \(N=1, 1 strategy\)/);
    expect(text).toMatch(/Test list: 2\/5 \(40%\)/);
    expect(text).toMatch(/Experiments \(1\)/);
    expect(text).toMatch(/checkout\s+branch=br-feat-add-orders/);
    expect(text).toMatch(/Recent decisions/);
    expect(text).toMatch(/Open smells: none/);
  });

  it("handles an empty .tdd/ tree (no plan, no experiments, no log) gracefully", () => {
    const snapshot = getFeatureStatus(tdd, FEATURE_ID);
    expect(snapshot.feature_id).toBe(FEATURE_ID);
    expect(snapshot.plans).toEqual([]);
    expect(snapshot.test_list).toBeNull();
    expect(snapshot.experiments).toEqual([]);
    expect(snapshot.selection_log_recent).toEqual([]);
    expect(snapshot.open_smells).toEqual([]);
    expect(snapshot.current_workflow_phase).toBeNull();
    expect(snapshot.current_workflow_pointer).toBeNull();
  });

  it("renders helpful placeholders when state is partial", () => {
    const text = renderFeatureStatus(getFeatureStatus(tdd, FEATURE_ID));
    expect(text).toMatch(/Phase: unknown \(no workflow-state\.json\)/);
    expect(text).toMatch(/Plan: not yet approved/);
    expect(text).toMatch(/Test list: not yet written/);
    expect(text).toMatch(/Experiments: none cut yet/);
  });
});

// Stability assertion for the JSON payload. The shape is part of the substrate's
// public contract (consumed by agents + MCP). Any field rename or removal must
// be a deliberate contract change: bumping this assertion is the gate.
//
// See: skills/lakebase-tdd-workflows/references/feature-status-schema.md

const TOP_LEVEL_KEYS = [
  "feature_id",
  "current_workflow_phase",
  "current_workflow_pointer",
  "plans",
  "test_list",
  "experiments",
  "selection_log_recent",
  "open_smells",
  "gates",
] as const;

const GATE_NAMES = ["spec", "plan", "test_list", "promote"] as const;
const GATE_SUMMARY_KEYS = ["status", "approver", "approved_at"] as const;

const POINTER_KEYS = [
  "feature_id",
  "story_id",
  "ac_id",
  "cycle_id",
  "experiment_id",
] as const;

const PLAN_KEYS = ["feature_id", "story_id", "N", "mode", "strategies", "budget", "rationale"] as const;
const BUDGET_KEYS = ["concurrent_branches", "wall_clock_minutes", "agent_pairs"] as const;

const TEST_LIST_KEYS = ["total", "by_status", "completion_pct"] as const;
const TEST_LIST_STATUS_KEYS = ["pending", "red", "green", "refactored", "skipped"] as const;

const EXPERIMENT_KEYS = [
  "story_id",
  "slug",
  "branch_id",
  "status",
  "tests_passed",
  "tests_failed",
  "schema_diff_summary",
  "cycle_count",
] as const;

const SELECTION_LOG_KEYS = ["timestamp", "title"] as const;

describe("feature-status JSON payload: stable schema", () => {
  it("top-level keys match the documented shape (key set is closed)", () => {
    stageN1Fixture();
    const snapshot = getFeatureStatus(tdd, FEATURE_ID);
    expect(Object.keys(snapshot).sort()).toEqual([...TOP_LEVEL_KEYS].sort());
  });

  it("current_workflow_pointer object has exactly the documented keys", () => {
    stageN1Fixture();
    const { current_workflow_pointer: ptr } = getFeatureStatus(tdd, FEATURE_ID);
    expect(ptr).not.toBeNull();
    expect(Object.keys(ptr!).sort()).toEqual([...POINTER_KEYS].sort());
  });

  it("plan object + nested budget object have exactly the documented keys", () => {
    stageN1Fixture();
    const { plans } = getFeatureStatus(tdd, FEATURE_ID);
    expect(plans).toHaveLength(1);
    const plan = plans[0].plan;
    expect(Object.keys(plan).sort()).toEqual([...PLAN_KEYS].sort());
    expect(Object.keys(plan.budget).sort()).toEqual([...BUDGET_KEYS].sort());
  });

  it("test_list object + nested by_status have exactly the documented keys", () => {
    stageN1Fixture();
    const { test_list } = getFeatureStatus(tdd, FEATURE_ID);
    expect(test_list).not.toBeNull();
    expect(Object.keys(test_list!).sort()).toEqual([...TEST_LIST_KEYS].sort());
    expect(Object.keys(test_list!.by_status).sort()).toEqual(
      [...TEST_LIST_STATUS_KEYS].sort()
    );
  });

  it("each experiment entry has exactly the documented keys", () => {
    stageN1Fixture();
    const { experiments } = getFeatureStatus(tdd, FEATURE_ID);
    expect(experiments.length).toBeGreaterThan(0);
    for (const exp of experiments) {
      expect(Object.keys(exp).sort()).toEqual([...EXPERIMENT_KEYS].sort());
    }
  });

  it("each selection_log_recent entry has exactly the documented keys", () => {
    stageN1Fixture();
    const { selection_log_recent } = getFeatureStatus(tdd, FEATURE_ID);
    expect(selection_log_recent.length).toBeGreaterThan(0);
    for (const entry of selection_log_recent) {
      expect(Object.keys(entry).sort()).toEqual([...SELECTION_LOG_KEYS].sort());
    }
  });

  it("scalar field types are stable (string / number / null where documented)", () => {
    stageN1Fixture();
    const s = getFeatureStatus(tdd, FEATURE_ID);
    expect(typeof s.feature_id).toBe("string");
    expect(typeof s.current_workflow_phase).toBe("string");
    expect(typeof s.plans[0].plan.N).toBe("number");
    expect(typeof s.plans[0].plan.mode).toBe("string");
    expect(typeof s.test_list?.total).toBe("number");
    expect(typeof s.test_list?.completion_pct).toBe("number");
    for (const exp of s.experiments) {
      expect(typeof exp.slug).toBe("string");
      expect(typeof exp.branch_id).toBe("string");
      expect(typeof exp.cycle_count).toBe("number");
    }
    expect(Array.isArray(s.experiments)).toBe(true);
    expect(Array.isArray(s.selection_log_recent)).toBe(true);
    expect(Array.isArray(s.open_smells)).toBe(true);
  });
});

// N≥2 race coverage: the same primitive surfaces multiple experiments when
// the design-spec gate has approved a parallel race. Renderer and JSON
// payload both handle the multi-experiment shape without special casing.

const N2_PLAN: ExperimentPlan = {
  feature_id: FEATURE_ID,
  story_id: "S1",
  N: 2,
  mode: "N>=2",
  strategies: [
    { name: "postgres-arrays", rationale: "store cart as array column on orders" },
    { name: "json-blob", rationale: "store cart as jsonb on separate carts table" },
  ],
  budget: { concurrent_branches: 2, wall_clock_minutes: 240, agent_pairs: 2 },
  rationale: "opinion gap: storage shape for the cart",
};

function stageExperiment(
  slug: string,
  branchId: string,
  outcomes: {
    status: "running" | "succeeded" | "failed" | "abandoned";
    tests_passed?: number;
    tests_failed?: number;
  },
  cycleCount: number
) {
  const dir = join(tdd, "experiments", FEATURE_ID, "S1", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "branch.txt"), branchId);
  writeFileSync(join(dir, "notes.md"), `# ${slug}\n`);
  writeFileSync(join(dir, "outcomes.json"), JSON.stringify(outcomes));
  const entries = Array.from({ length: cycleCount }, (_, i) => ({
    ts: `2026-05-27T10:${String(i).padStart(2, "0")}:00Z`,
    kind: i === 0 ? "cut" : "cycle",
  }));
  writeFileSync(join(dir, "timeline.json"), JSON.stringify({ entries }));
}

function stageN2Fixture() {
  writeMasterTestList(tdd, {
    feature_id: FEATURE_ID,
    items: [
      { id: "T1", description: "happy path", ac_id: "AC1", status: "green" },
      { id: "T2", description: "reject empty", ac_id: "AC1", status: "pending" },
    ],
  });
  writePlan(tdd, N2_PLAN);
  recordPlan(tdd, N2_PLAN, "kevin.hartman@databricks.com");
  stageExperiment("exp-postgres-arrays", "br-exp-pg-arrays", { status: "succeeded", tests_passed: 2, tests_failed: 0 }, 3);
  stageExperiment("exp-json-blob", "br-exp-json-blob", { status: "running", tests_passed: 1, tests_failed: 1 }, 2);
  writeFileSync(
    join(tdd, "workflow-state.json"),
    JSON.stringify({
      phase: "implementation",
      started_at: "2026-05-27T10:00:00Z",
      feature_id: FEATURE_ID,
    })
  );
}

describe("feature-status N≥2 race snapshot", () => {
  it("snapshot returns one entry per experiment with per-experiment status + cycles", () => {
    stageN2Fixture();
    const snapshot = getFeatureStatus(tdd, FEATURE_ID);

    expect(snapshot.plans).toHaveLength(1);
    expect(snapshot.plans[0].plan.mode).toBe("N>=2");
    expect(snapshot.plans[0].plan.N).toBe(2);
    expect(snapshot.plans[0].plan.strategies).toHaveLength(2);

    expect(snapshot.experiments).toHaveLength(2);
    const bySlug = Object.fromEntries(snapshot.experiments.map((e) => [e.slug, e]));
    expect(bySlug["exp-postgres-arrays"].status).toBe("succeeded");
    expect(bySlug["exp-postgres-arrays"].cycle_count).toBe(3);
    expect(bySlug["exp-postgres-arrays"].tests_passed).toBe(2);
    expect(bySlug["exp-json-blob"].status).toBe("running");
    expect(bySlug["exp-json-blob"].cycle_count).toBe(2);
    expect(bySlug["exp-json-blob"].tests_failed).toBe(1);
  });

  it("renderer shows the plan as N>=2 and lists both experiment rows", () => {
    stageN2Fixture();
    const text = renderFeatureStatus(getFeatureStatus(tdd, FEATURE_ID));
    expect(text).toMatch(/Plan \[S1\]: N>=2 \(N=2, 2 strategies\)/);
    expect(text).toMatch(/Experiments \(2\)/);
    expect(text).toMatch(/exp-postgres-arrays\s+branch=br-exp-pg-arrays/);
    expect(text).toMatch(/exp-json-blob\s+branch=br-exp-json-blob/);
    expect(text).toMatch(/status=succeeded/);
    expect(text).toMatch(/status=running/);
  });

  it("JSON payload keeps the documented shape under N≥2 (multi-experiment)", () => {
    stageN2Fixture();
    const s = getFeatureStatus(tdd, FEATURE_ID);
    expect(Object.keys(s).sort()).toEqual([...TOP_LEVEL_KEYS].sort());
    for (const exp of s.experiments) {
      expect(Object.keys(exp).sort()).toEqual([...EXPERIMENT_KEYS].sort());
    }
  });
});

describe("feature-status gates field (G8 /)", () => {
  it("returns null gates when the feature directory does not exist", () => {
    // Fresh tdd dir with no feature subtree at all.
    const s = getFeatureStatus(tdd, "F-NEVER-AUTHORED");
    expect(s.gates).toBeNull();
  });

  it("returns the default-open shape when the feature dir exists but gates.json does not", () => {
    stageN1Fixture();
    const s = getFeatureStatus(tdd, FEATURE_ID);
    expect(s.gates).not.toBeNull();
    for (const name of GATE_NAMES) {
      expect(s.gates![name].status).toBe("open");
      expect(s.gates![name].approver).toBeNull();
      expect(s.gates![name].approved_at).toBeNull();
    }
  });

  it("surfaces approved gate state when approveGate has been called", async () => {
    stageN1Fixture();
    const { approveGate } = await import("../../scripts/tdd/approve-gate");
    approveGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: "po@example.com",
      hitlApproved: true,
      artifactInputs: { "feature-spec.md": "x", "feature-spec.json": "{}" },
      tddDir: tdd,
      now: () => new Date("2026-05-31T20:00:00Z"),
      writeSelectionLog: false,
    });
    const s = getFeatureStatus(tdd, FEATURE_ID);
    expect(s.gates!.spec.status).toBe("approved");
    expect(s.gates!.spec.approver).toBe("po@example.com");
    expect(s.gates!.spec.approved_at).toBe("2026-05-31T20:00:00.000Z");
    expect(s.gates!.plan.status).toBe("open");
  });

  it("each gate summary entry has exactly the documented keys", () => {
    stageN1Fixture();
    const s = getFeatureStatus(tdd, FEATURE_ID);
    expect(s.gates).not.toBeNull();
    for (const name of GATE_NAMES) {
      expect(Object.keys(s.gates![name]).sort()).toEqual(
        [...GATE_SUMMARY_KEYS].sort()
      );
    }
  });

  it("renders a Gates section listing all four gates", () => {
    stageN1Fixture();
    const text = renderFeatureStatus(getFeatureStatus(tdd, FEATURE_ID));
    expect(text).toMatch(/Gates:/);
    expect(text).toMatch(/spec\s+open/);
    expect(text).toMatch(/plan\s+open/);
    expect(text).toMatch(/test_list\s+open/);
    expect(text).toMatch(/promote\s+open/);
  });

  it("renders approver + approved_at when a gate is approved", async () => {
    stageN1Fixture();
    const { approveGate } = await import("../../scripts/tdd/approve-gate");
    approveGate({
      featureId: FEATURE_ID,
      gate: "plan",
      approver: "po@example.com",
      hitlApproved: true,
      artifactInputs: { "plan.json": "{}" },
      tddDir: tdd,
      now: () => new Date("2026-05-31T21:00:00Z"),
      writeSelectionLog: false,
    });
    const text = renderFeatureStatus(getFeatureStatus(tdd, FEATURE_ID));
    expect(text).toMatch(/plan\s+approved @ 2026-05-31T21:00:00\.000Z by po@example\.com/);
  });
});
