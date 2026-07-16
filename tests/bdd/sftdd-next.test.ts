// FEIP-8017: lakebase-sftdd-next, the authoritative, strictly read-only "what
// next" surface. These tests pin the decision-MENU builder (the real HIL choices
// per stop, each with its CORRECT enact CLI), the reconciled state + blockers,
// the truthful phase-complete messaging, and the DRY invariant that the gate
// enact map is the SAME one the drive's approve hint uses (so they can never
// drift, subsuming Findings 10/12/13).

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildNextOptions,
  buildNextSnapshot,
  readFeatureNextSnapshot,
  emitNextJson,
  type NextContext,
} from "../../scripts/sftdd/next";
import {
  approveHint,
  gateEnactCommand,
} from "../../scripts/sftdd/orchestrator-logging";
import type { DriveState, WorkflowAction } from "../../scripts/sftdd/orchestrator-drive";

const CTX: NextContext = { featureId: "F1-checkout", approver: "po@example.com", version: "0.3.0-test", now: "2026-07-15T00:00:00.000Z" };

/** A minimal DriveState; the transition is injected in most tests, so only the
 *  summary-facing fields (phase, escalation) matter. */
function baseState(over: Partial<DriveState> = {}): DriveState {
  return { phase: "feature", breakdownDone: true, storyOrder: [], stories: {}, buildActive: null, ...over };
}
const fixed = (action: WorkflowAction) => () => action;

describe("gateEnactCommand: the ONE gate -> CLI mapping (DRY, subsumes Findings 10/12)", () => {
  it("routes each gate to its correct substrate door", () => {
    expect(gateEnactCommand({ kind: "approve-plan-gate" }, { sprint: "S1", approver: "you" })).toEqual({
      bin: "lakebase-sftdd-approve-gate",
      args: ["--sprint", "S1", "--approver", "you"],
    });
    // per-story spec gate is pipeline-scoped (--feature --story), NOT feature gates.json
    expect(gateEnactCommand({ kind: "approve-gate", story: "S2" }, { featureId: "F1", approver: "you" })).toEqual({
      bin: "lakebase-sftdd-approve-gate",
      args: ["--feature", "F1", "--story", "S2", "--approver", "you"],
    });
    expect(gateEnactCommand({ kind: "approve-deploy-gate" }, { featureId: "F1", approver: "you" })).toEqual({
      bin: "lakebase-sftdd-approve-gate",
      args: ["--feature", "F1", "--gate", "deploy", "--approver", "you"],
    });
    expect(gateEnactCommand({ kind: "approve-promote-gate" }, { featureId: "F1", approver: "you" })).toEqual({
      bin: "lakebase-sftdd-approve-gate",
      args: ["--feature", "F1", "--gate", "promote", "--approver", "you"],
    });
    // acceptance routes through the pipeline accept (which owns the experiment merge)
    expect(gateEnactCommand({ kind: "accept", story: "S3" }, { featureId: "F1", approver: "you" })).toEqual({
      bin: "lakebase-sftdd-pipeline",
      args: ["accept", "--feature", "F1", "--story", "S3", "--approver", "you"],
    });
    expect(gateEnactCommand({ kind: "deploy" }, {})).toBeNull(); // non-gate
  });

  it("approveHint is a projection of gateEnactCommand (the two can never drift)", () => {
    for (const gate of [
      { kind: "approve-plan-gate" } as const,
      { kind: "approve-gate", story: "S2" } as const,
      { kind: "approve-deploy-gate" } as const,
      { kind: "approve-promote-gate" } as const,
      { kind: "accept", story: "S3" } as const,
    ]) {
      const cmd = gateEnactCommand(gate, { featureId: "F1", sprint: "SP" })!;
      expect(approveHint(gate, { featureId: "F1", sprint: "SP" })).toBe(`${cmd.bin} ${cmd.args.join(" ")}`);
    }
  });
});

describe("buildNextOptions: the decision menu per stop", () => {
  it("acceptance offers accept / discard / revise / hold, each with its real CLI", () => {
    const opts = buildNextOptions({ kind: "accept", story: "S3" }, CTX);
    expect(opts.map((o) => o.id)).toEqual(["acceptance.accept", "acceptance.discard", "acceptance.revise", "hold"]);
    const accept = opts.find((o) => o.id === "acceptance.accept")!;
    expect(accept.kind).toBe("gate");
    expect(accept.enact).toEqual({
      bin: "lakebase-sftdd-pipeline",
      args: ["accept", "--feature", "F1-checkout", "--story", "S3", "--approver", "po@example.com"],
    });
    expect(opts.find((o) => o.id === "acceptance.discard")!.enact).toEqual({
      bin: "lakebase-sftdd-pipeline",
      args: ["discard", "--feature", "F1-checkout", "--story", "S3", "--approver", "po@example.com", "--reason", "<reason>"],
    });
    expect(opts.find((o) => o.id === "acceptance.revise")!.enact).toEqual({
      bin: "lakebase-sftdd-pipeline",
      args: ["revise", "--feature", "F1-checkout", "--story", "S3", "--approver", "po@example.com", "--reason", "<reason>"],
    });
    // every option poses a question to the human
    expect(opts.every((o) => o.hil_prompt.length > 0)).toBe(true);
  });

  it("each approval gate offers approve + hold with the correct enact command", () => {
    for (const [action, id] of [
      [{ kind: "approve-plan-gate" }, "plan.approve"],
      [{ kind: "approve-gate", story: "S1" }, "spec.approve"],
      [{ kind: "approve-deploy-gate" }, "deploy.approve"],
      [{ kind: "approve-promote-gate" }, "promote.approve"],
    ] as const) {
      const opts = buildNextOptions(action, CTX);
      expect(opts.map((o) => o.id)).toEqual([id, "hold"]);
      expect(opts[0].kind).toBe("gate");
      expect(opts[0].enact).toEqual(gateEnactCommand(action, CTX));
    }
  });

  it("promote-phase merge/prepare-pr are flagged outward-facing", () => {
    for (const action of [{ kind: "prepare-pr" }, { kind: "merge" }] as const) {
      const resume = buildNextOptions(action, CTX)[0];
      expect(resume.outward_facing).toBe(true);
      expect(resume.enact).toEqual({ bin: "lakebase-sftdd-drive", args: ["--feature", "F1-checkout"] });
    }
  });

  it("a blocker (raise-to-hil) offers resume-after-resolve + hold, not a fabricated fix", () => {
    const opts = buildNextOptions({ kind: "raise-to-hil", reason: "boom", source: "smell:x" }, CTX);
    expect(opts.map((o) => o.id)).toEqual(["resume", "hold"]);
    expect(opts[0].note).toMatch(/escalation/i);
  });

  it("done offers a single terminal noop (no fabricated action)", () => {
    const opts = buildNextOptions({ kind: "done" }, CTX);
    expect(opts).toHaveLength(1);
    expect(opts[0].kind).toBe("noop");
    expect(opts[0].enact).toBeNull();
  });
});

describe("buildNextSnapshot: reconciled state, blockers, truthful summary", () => {
  it("done reads as SHIPPED, not a 0-action no-op (subsumes Finding 13)", () => {
    const snap = buildNextSnapshot("feature", baseState({ phase: "done" }), CTX, fixed({ kind: "done" }));
    expect(snap.primary_action.kind).toBe("done");
    expect(snap.summary).toMatch(/complete/i);
    expect(snap.summary).not.toMatch(/0 actions/);
    expect(snap.state.open_gates).toEqual([]);
  });

  it("feature-complete frames the next step as deploy, not silence", () => {
    const snap = buildNextSnapshot("feature", baseState(), CTX, fixed({ kind: "feature-complete" }));
    expect(snap.summary).toMatch(/deploy/i);
    expect(snap.options.map((o) => o.id)).toEqual(["resume", "hold"]);
  });

  it("surfaces open_gates for a gate stop", () => {
    const snap = buildNextSnapshot("feature", baseState(), CTX, fixed({ kind: "accept", story: "S3" }));
    expect(snap.state.open_gates).toEqual(["acceptance"]);
    expect(snap.summary).toMatch(/acceptance gate/);
  });

  it("derives feature phase from the injected per-story rows (reuses feature-status)", () => {
    const snap = buildNextSnapshot("feature", baseState({ phase: "feature" }), {
      ...CTX,
      stories: [
        { story_id: "S1", status: "done", gate_status: "approved", accepted: true },
        { story_id: "S2", status: "done", gate_status: "approved", accepted: true },
      ],
    }, fixed({ kind: "done" }));
    expect(snap.state.derived_phase).toBe("complete");
    expect(snap.state.stories).toEqual({ S1: "done", S2: "done" });
  });

  it("a non-routable escalation surfaces a blocker with a resolver hint (real nextTransition)", () => {
    const snap = buildNextSnapshot(
      "feature",
      baseState({ escalation: { id: "e1", source: "smell:fragility", reason: "flaky aggregate", story_id: "S2" } }),
      CTX,
    );
    expect(snap.primary_action.kind).toBe("raise-to-hil");
    expect(snap.state.blockers).toHaveLength(1);
    expect(snap.state.blockers[0]).toMatchObject({ source: "smell:fragility", reason: "flaky aggregate", story: "S2", resolver: null });
    expect(snap.state.blockers[0].resolver_hint).toBeTruthy();
    expect(snap.summary).toMatch(/BLOCKED/);
  });

  it("stamps scope, version, and generated_at; feature id echoes", () => {
    const snap = buildNextSnapshot("feature", baseState(), CTX, fixed({ kind: "done" }));
    expect(snap.scope).toBe("feature");
    expect(snap.feature).toBe("F1-checkout");
    expect(snap.authoritative_playbook_version).toBe("0.3.0-test");
    expect(snap.generated_at).toBe("2026-07-15T00:00:00.000Z");
  });
});

describe("on-disk: read is side-effect-free; the drive auto-emit writes next.json", () => {
  const F = "F1-checkout";
  let tdd: string;

  function fileSet(dir: string): string[] {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => join(String((d as unknown as { parentPath?: string }).parentPath ?? dir), d.name))
      .sort();
  }

  function stageCompleted(): void {
    tdd = mkdtempSync(join(tmpdir(), "next-"));
    mkdirSync(join(tdd, "features", F), { recursive: true });
    // Coarse workflow phase stale at the scaffold default; the pipeline is the truth.
    writeFileSync(join(tdd, "workflow-state.json"), JSON.stringify({ phase: "discovery", feature_id: null }) + "\n");
    writeFileSync(
      join(tdd, "features", F, "pipeline.json"),
      JSON.stringify({
        version: 1,
        feature_id: F,
        build_queue: [],
        build_active: null,
        stories: {
          S1: { status: "done", gate: { status: "approved", history: [] }, acceptance: { decision: "accepted", history: [] } },
          S2: { status: "done", gate: { status: "approved", history: [] }, acceptance: { decision: "accepted", history: [] } },
        },
      }) + "\n",
    );
  }

  it("readFeatureNextSnapshot reflects the on-disk pipeline and writes NOTHING", () => {
    stageCompleted();
    const before = fileSet(tdd);
    const snap = readFeatureNextSnapshot(tdd, F, tdd, { version: "v-test" });
    // reconciled: derived phase = complete even though the coarse phase is stale
    expect(snap.state.derived_phase).toBe("complete");
    expect(snap.state.stories).toEqual({ S1: "done", S2: "done" });
    // a fully accepted feature's next step is deploy, not a no-op
    expect(snap.primary_action.kind).toBe("feature-complete");
    // strictly read-only: not a single file changed, and NO next.json was written
    expect(fileSet(tdd)).toEqual(before);
    expect(existsSync(join(tdd, "next.json"))).toBe(false);
    rmSync(tdd, { recursive: true, force: true });
  });

  it("emitNextJson writes an advisory next.json without mutating the pipeline", () => {
    stageCompleted();
    const pipelineBefore = readFileSync(join(tdd, "features", F, "pipeline.json"), "utf8");
    emitNextJson(tdd, F, tdd, { version: "v-test" });
    const nextPath = join(tdd, "next.json");
    expect(existsSync(nextPath)).toBe(true);
    const snap = JSON.parse(readFileSync(nextPath, "utf8"));
    expect(snap.scope).toBe("feature");
    expect(snap.feature).toBe(F);
    expect(snap.state.derived_phase).toBe("complete");
    expect(Array.isArray(snap.options)).toBe(true);
    // the workflow artifact is untouched (the emit is read-only w.r.t. state)
    expect(readFileSync(join(tdd, "features", F, "pipeline.json"), "utf8")).toBe(pipelineBefore);
    rmSync(tdd, { recursive: true, force: true });
  });
});
