// FEIP-7626 revise-routing: a SPEC-level blocking smell the PO can send back to
// its owning author and resume, instead of the terminal raise-to-hil halt.
// Hermetic: smell taxonomy + the pure transition + the effect command + the
// Human-Proxy self-heal on a tmp .tdd, no model, no real branches.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  featureTestListJson,
  storyTestListJson,
  acsDir,
  acJson,
  handbackFile,
} from "../../scripts/sftdd/tdd-paths";

import {
  SMELL_CATALOG,
  specLevelSmell,
  markSmellResolved,
  priorReviseCount,
  readSmellsLog,
} from "../../scripts/sftdd/smells";
import { recordBlockingSmellFlag } from "../../scripts/sftdd/escalation";
import { nextTransition, actionLane, type DriveState } from "../../scripts/sftdd/orchestrator-drive";
import { commandsForAction, type DriveEffectsConfig } from "../../scripts/sftdd/orchestrator-effects";
import { diskArtifactProbe } from "../../scripts/sftdd/orchestrator-probe";
import { decideEscalationAsHumanProxy } from "../../scripts/sftdd/human-proxy";
import { writePipeline, readPipeline, type StoryPipeline } from "../../scripts/sftdd/story-pipeline";
import { deriveDriveState } from "../../scripts/sftdd/orchestrator-derive";

const FEATURE = "F1-file-bug";
const STORY = "S1-file-bug-via-form";

// ---- Phase A: taxonomy -------------------------------------------------------

describe("smell taxonomy (FEIP-7626)", () => {
  it("tags ac-overlap as spec-level -> spec-author at the spec gate", () => {
    const def = SMELL_CATALOG.find((s) => s.name === "ac-overlap")!;
    expect(def.level).toBe("spec");
    expect(def.owning_role).toBe("spec-author");
    expect(def.gate_to_rerun).toBe("spec");
    expect(specLevelSmell("ac-overlap")).toEqual({ owning_role: "spec-author", gate_to_rerun: "spec" });
  });

  it("tags test-list-drift as spec-level -> test-strategist at the test_list gate", () => {
    expect(specLevelSmell("test-list-drift")).toEqual({
      owning_role: "test-strategist",
      gate_to_rerun: "test_list",
    });
  });

  it("treats build-level smells (and unknowns) as non-routable", () => {
    expect(specLevelSmell("cycle-stall")).toBeNull();
    expect(specLevelSmell("scaffold-defect")).toBeNull();
    expect(specLevelSmell("boundary-violation")).toBeNull();
    expect(specLevelSmell("not-a-smell")).toBeNull();
  });
});

// ---- Phase B: resolution writers + the one-revise budget ---------------------

describe("smells.json resolution + revise budget", () => {
  let tdd: string;
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "tdd-revise-"));
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("markSmellResolved closes an open entry; priorReviseCount counts revises", () => {
    recordBlockingSmellFlag(tdd, "ac-overlap", "AC4 implied by AC2", { story_id: STORY });
    expect(priorReviseCount(tdd, "ac-overlap", STORY)).toBe(0);
    expect(markSmellResolved(tdd, "ac-overlap", { story_id: STORY, kind: "revised" })).toBe(true);
    expect(priorReviseCount(tdd, "ac-overlap", STORY)).toBe(1);
    // The entry is now resolved (no longer open).
    expect(readSmellsLog(tdd).detected[0].resolution_kind).toBe("revised");
  });

  it("a different story's same smell is independent", () => {
    recordBlockingSmellFlag(tdd, "ac-overlap", "x", { story_id: STORY });
    markSmellResolved(tdd, "ac-overlap", { story_id: STORY, kind: "revised" });
    expect(priorReviseCount(tdd, "ac-overlap", "S2-other")).toBe(0);
  });
});

// ---- Phase C: the pure transition --------------------------------------------

function baseState(escalation: DriveState["escalation"]): DriveState {
  return {
    phase: "feature",
    breakdownDone: true,
    storyOrder: [],
    stories: {},
    buildActive: null,
    escalation,
  };
}

describe("nextTransition revise-routing (FEIP-7626)", () => {
  it("routes a routable spec-level escalation to revise-route (not raise-to-hil)", () => {
    const action = nextTransition(
      baseState({
        id: "smell:ac-overlap__F1",
        source: "smell:ac-overlap",
        reason: 'blocking smell "ac-overlap": AC4 implied by AC2',
        story_id: STORY,
        routable: { story: STORY, owning_role: "spec-author", gate: "spec" },
      }),
    );
    expect(action.kind).toBe("revise-route");
    if (action.kind === "revise-route") {
      expect(action.story).toBe(STORY);
      expect(action.role).toBe("spec-author");
      expect(action.gate).toBe("spec");
      expect(action.reason).toMatch(/AC4 implied by AC2/);
    }
    expect(actionLane(action)).toBe("design");
  });

  it("hard-halts (raise-to-hil) when the escalation is NOT routable", () => {
    const action = nextTransition(
      baseState({
        id: "smell:cycle-stall__F1",
        source: "smell:cycle-stall",
        reason: 'blocking smell "cycle-stall"',
        story_id: STORY,
        // no `routable` -> build-level / budget spent / explicit file
      }),
    );
    expect(action.kind).toBe("raise-to-hil");
  });
});

// ---- Phase 3: the effect command ---------------------------------------------

describe("commandsForAction(revise-route) (FEIP-7626)", () => {
  it("emits a single human-proxy decide-escalation carrying story/smell/route/verdict", () => {
    const cfg = {
      projectDir: "/proj",
      tddDir: "/proj/.tdd",
      featureId: FEATURE,
      runner: { run: async () => {} },
      modelForRole: () => "sonnet",
      approver: "human-proxy",
    } as unknown as DriveEffectsConfig;
    const cmds = commandsForAction(
      { kind: "revise-route", story: STORY, role: "spec-author", gate: "spec", reason: "AC4 implied by AC2", source: "smell:ac-overlap" },
      cfg,
    );
    expect(cmds).toHaveLength(1);
    const c = cmds[0];
    expect(c.kind).toBe("cli");
    if (c.kind === "cli") {
      expect(c.bin).toBe("lakebase-sftdd-human-proxy");
      expect(c.args[0]).toBe("decide-escalation");
      expect(c.args).toEqual(expect.arrayContaining(["--smell", "ac-overlap", "--routed-to", "spec-author", "--gate", "spec", "--story", STORY]));
      expect(c.args).toEqual(expect.arrayContaining(["--reason", "AC4 implied by AC2"]));
    }
  });
});

// ---- Phase B3: the Human-Proxy self-heal end-to-end on disk ------------------

function pipelineBuilding(): StoryPipeline {
  return {
    version: 1,
    feature_id: FEATURE,
    stories: {
      [STORY]: {
        status: "building",
        gate: { status: "approved", history: [] },
        experiment: { slug: "exp1", status: "active", branch_id: "experiment-s1", opened_at: "t0" },
      },
    },
    build_queue: [],
    build_active: STORY,
  } as unknown as StoryPipeline;
}

// Seed the design artifacts a built story would have on disk, so we can prove
// the revise STALES them (forces the owning author to re-author).
function seedDesignArtifacts(tdd: string): void {
  mkdirSync(acsDir(tdd, FEATURE, STORY), { recursive: true });
  writeFileSync(
    acJson(tdd, FEATURE, STORY, "AC1-x"),
    JSON.stringify({ id: "AC1-x", layer: "E2E", given: "g", when: "w", then: "t", status: "draft" }) + "\n",
  );
  mkdirSync(join(featureTestListJson(tdd, FEATURE), ".."), { recursive: true });
  writeFileSync(
    featureTestListJson(tdd, FEATURE),
    JSON.stringify({ feature_id: FEATURE, items: [{ id: "T1", description: "x", ac_id: "AC1-x", status: "pending" }] }) + "\n",
  );
  mkdirSync(join(storyTestListJson(tdd, FEATURE, STORY), ".."), { recursive: true });
  writeFileSync(
    storyTestListJson(tdd, FEATURE, STORY),
    JSON.stringify({ feature_id: FEATURE, story_id: STORY, items: [{ id: "T1", description: "x", ac_id: "AC1-x", status: "pending" }] }) + "\n",
  );
}

describe("decideEscalationAsHumanProxy self-heal (FEIP-7626)", () => {
  let tdd: string;
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "tdd-revise-e2e-"));
    writePipeline(tdd, pipelineBuilding());
    seedDesignArtifacts(tdd);
    recordBlockingSmellFlag(tdd, "ac-overlap", "AC4 implied by AC2", { story_id: STORY });
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("resets the story to designing, discards the experiment, frees the lane, resolves the smell", () => {
    const r = decideEscalationAsHumanProxy({
      featureId: FEATURE,
      story: STORY,
      smell: "ac-overlap",
      routedTo: "spec-author",
      gate: "spec",
      reason: "AC4 implied by AC2",
      tddDir: tdd,
    });
    expect(r.decided).toBe("revise");
    expect(r.resolvedSmell).toBe(true);

    const p = readPipeline(tdd, FEATURE);
    expect(p.stories[STORY].status).toBe("designing");
    expect(p.stories[STORY].experiment?.status).toBe("discarded");
    expect(p.stories[STORY].gate?.status).toBe("open");
    expect(p.build_active).toBeNull();

    // The smell is resolved-as-revised: the one-revise budget is now spent.
    expect(priorReviseCount(tdd, "ac-overlap", STORY)).toBe(1);
  });

  it("is NOT hollow: stales the owning author's artifacts + writes the verdict brief", () => {
    decideEscalationAsHumanProxy({
      featureId: FEATURE, story: STORY, smell: "ac-overlap",
      routedTo: "spec-author", gate: "spec", reason: "AC4 implied by AC2", tddDir: tdd,
    });
    // spec-gate revise clears the ACs (re-decomposition) + the test list, so the
    // design lane re-invokes spec-author, not just re-approve the same spec.
    expect(existsSync(acJson(tdd, FEATURE, STORY, "AC1-x"))).toBe(false);
    expect(existsSync(storyTestListJson(tdd, FEATURE, STORY))).toBe(false);
    const master = JSON.parse(readFileSync(featureTestListJson(tdd, FEATURE), "utf8")) as { items: unknown[] };
    expect(master.items).toHaveLength(0); // the story's item was removed
    // The verdict reached the spec-author as a hand-back brief.
    const hb = handbackFile(tdd, FEATURE, "spec-author", STORY);
    expect(existsSync(hb)).toBe(true);
    expect(readFileSync(hb, "utf8")).toMatch(/AC4 implied by AC2/);
  });

  it("test_list-gate revise stales the test list but KEEPS the ACs", () => {
    decideEscalationAsHumanProxy({
      featureId: FEATURE, story: STORY, smell: "test-list-drift",
      routedTo: "test-strategist", gate: "test_list", reason: "T1 already green", tddDir: tdd,
    });
    expect(existsSync(storyTestListJson(tdd, FEATURE, STORY))).toBe(false);
    expect(existsSync(acJson(tdd, FEATURE, STORY, "AC1-x"))).toBe(true); // ACs preserved
    const hb = handbackFile(tdd, FEATURE, "test-strategist", STORY);
    expect(readFileSync(hb, "utf8")).toMatch(/T1 already green/);
  });
});

// ---- probe: routable computation off disk ------------------------------------

describe("diskArtifactProbe pendingEscalation.routable (FEIP-7626)", () => {
  let tdd: string;
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "tdd-revise-probe-"));
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("marks a spec-level smell routable, using the active build story as fallback scope", () => {
    recordBlockingSmellFlag(tdd, "ac-overlap", "AC4 implied by AC2"); // no story scope
    const e = diskArtifactProbe(tdd, FEATURE, STORY).pendingEscalation();
    expect(e?.routable).toEqual({ story: STORY, owning_role: "spec-author", gate: "spec" });
  });

  it("does NOT mark a build-level smell routable", () => {
    recordBlockingSmellFlag(tdd, "cycle-stall", "stalled", { story_id: STORY });
    const e = diskArtifactProbe(tdd, FEATURE, STORY).pendingEscalation();
    expect(e?.routable).toBeUndefined();
  });

  it("does NOT mark routable once the one-revise budget is spent (a re-fire hard-halts)", () => {
    // First flag -> revised (budget spent).
    recordBlockingSmellFlag(tdd, "ac-overlap", "first", { story_id: STORY });
    markSmellResolved(tdd, "ac-overlap", { story_id: STORY, kind: "revised" });
    // Same smell re-fires on the same story.
    recordBlockingSmellFlag(tdd, "ac-overlap", "again", { story_id: STORY });
    const e = diskArtifactProbe(tdd, FEATURE, STORY).pendingEscalation();
    expect(e?.source).toBe("smell:ac-overlap");
    expect(e?.routable).toBeUndefined();
  });
});

// ---- integration: decide -> perform -> re-derive (recover, then bounded halt) -

describe("revise-routing loop integration (FEIP-7626)", () => {
  let tdd: string;
  const ctx = { phase: "feature" as const, breakdownDone: true };
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "tdd-revise-loop-"));
    writePipeline(tdd, pipelineBuilding());
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  function transitionNow(): ReturnType<typeof nextTransition> {
    const pipeline = readPipeline(tdd, FEATURE);
    const probe = diskArtifactProbe(tdd, FEATURE, pipeline.build_active);
    return nextTransition(deriveDriveState(pipeline, probe, ctx));
  }

  it("recovers: a spec-level smell mid-build routes to revise-route, then resumes the design lane", () => {
    // Mid-build, the navigator flags ac-overlap (blocking).
    recordBlockingSmellFlag(tdd, "ac-overlap", "AC4 implied by AC2", { story_id: STORY });

    // The driver routes to revise-route (NOT raise-to-hil).
    const a1 = transitionNow();
    expect(a1.kind).toBe("revise-route");

    // Perform it (the decide-escalation command, run in-process).
    if (a1.kind === "revise-route") {
      decideEscalationAsHumanProxy({
        featureId: FEATURE,
        story: a1.story,
        smell: "ac-overlap",
        routedTo: a1.role,
        gate: a1.gate,
        reason: a1.reason,
        tddDir: tdd,
      });
    }

    // Re-derive: the escalation is gone, the story is back in the design lane,
    // so the driver resumes at the owning author (spec-author re-draft), NOT a halt.
    const a2 = transitionNow();
    expect(a2.kind).toBe("invoke-role");
    if (a2.kind === "invoke-role" && "role" in a2) {
      expect(a2.role).toBe("spec-author");
    }
  });

  it("bounded: a SECOND escape of the same smell on the same story hard-halts", () => {
    // First overlap -> revised (budget spent).
    recordBlockingSmellFlag(tdd, "ac-overlap", "first", { story_id: STORY });
    const a1 = transitionNow();
    expect(a1.kind).toBe("revise-route");
    if (a1.kind === "revise-route") {
      decideEscalationAsHumanProxy({
        featureId: FEATURE, story: a1.story, smell: "ac-overlap",
        routedTo: a1.role, gate: a1.gate, reason: a1.reason, tddDir: tdd,
      });
    }
    // Put the story back in build so build_active scopes the re-fire, then the
    // SAME smell escapes again.
    const p = readPipeline(tdd, FEATURE);
    p.stories[STORY].status = "building";
    p.build_active = STORY;
    writePipeline(tdd, p);
    recordBlockingSmellFlag(tdd, "ac-overlap", "again", { story_id: STORY });

    // Budget spent -> not routable -> terminal halt.
    expect(transitionNow().kind).toBe("raise-to-hil");
  });
});
