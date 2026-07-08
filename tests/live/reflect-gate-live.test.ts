// LIVE reflection-gate validation (gated behind RUN_LIVE_REFLECT=1; not part of
// the normal suite). Stages the REAL recorded stockflow F1 design, emits the
// EXACT reflect task via the real orchestrator (commandsForAction), runs a live
// `claude --agent navigator --model sonnet` turn, then runs the deterministic
// reflect-gate on the real verdict.
//
//   RUN_LIVE_REFLECT=1 npx vitest run tests/live/reflect-gate-live.test.ts
//
// The reflect critique is local-files-only, so it needs NO workspace / Lakebase.
//   - clean:   the recorded design is consistent -> expect passed:true, no smell
//              (the no-false-positive control).
//   - corrupt: an injected contradictory AC -> expect passed:false + the gate
//              flags reflect-spec-defect routed to the spec author.

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { commandsForAction } from "../../scripts/sftdd/orchestrator-effects.js";
import { recordReflectionGate, readReflectVerdict } from "../../scripts/sftdd/reflection.js";
import { storyAcIds, storyTestListJson, acsDir } from "../../scripts/sftdd/sftdd-paths.js";

const KIT = process.cwd();
const CORPUS = join(KIT, "examples/sftdd-scenarios/stockflow/recorded-artifacts");
const FEATURE = "F1-stock-visibility";
const STORY = "S1-record-stock";

function stage(mode: "clean" | "clean_patched" | "corrupt" | "minimal_clean"): { proj: string; sftddDir: string } {
  const proj = mkdtempSync(join(tmpdir(), `live-reflect-${mode}-`));
  const sftddDir = join(proj, ".tdd");
  mkdirSync(join(proj, ".claude", "agents"), { recursive: true });
  cpSync(join(KIT, "skills/lakebase-sftdd-workflows/agents/navigator.md"), join(proj, ".claude", "agents", "navigator.md"));
  const featDst = join(sftddDir, "features", FEATURE);
  mkdirSync(featDst, { recursive: true });

  if (mode === "minimal_clean") {
    // A hand-built, deliberately DEFECT-FREE slice (the recorded stockflow S1 has
    // real gaps the critic keeps finding, so it cannot serve as the control):
    // every AC has an observable `then`, every AC has a covering test, the one
    // applicable NFR has a fitness test, and nothing contradicts. Isolates the
    // question "does the critic ever flag a genuinely clean design?".
    const storyDir = join(featDst, "stories", STORY);
    mkdirSync(join(storyDir, "acs"), { recursive: true });
    writeFileSync(join(featDst, "architecture.json"), JSON.stringify({
      feature_id: FEATURE, service_backed: true,
      layers: [{ name: "API", module: "app/api" }, { name: "Repository", module: "app/repo" }],
      nfrs: [{ id: "NFR-1", brief: "the list endpoint returns in under 200ms p99", applies_to: STORY }],
    }, null, 2));
    writeFileSync(join(storyDir, "story.json"), JSON.stringify({
      id: STORY, feature_id: FEATURE, as_a: "operator", i_want_to: "list stock records", so_that: "I can see current inventory", status: "draft",
    }, null, 2));
    writeFileSync(join(storyDir, "acs", "AC1-lists-records.json"), JSON.stringify({
      id: "AC1-lists-records", given: "two stock records exist", when: "the operator requests GET /api/stock",
      then: "the API responds 200 with a JSON array containing exactly those two records", layer: "API",
    }, null, 2));
    writeFileSync(join(storyDir, "acs", "AC2-empty-is-empty-array.json"), JSON.stringify({
      id: "AC2-empty-is-empty-array", given: "no stock records exist", when: "the operator requests GET /api/stock",
      then: "the API responds 200 with an empty JSON array", layer: "API",
    }, null, 2));
    writeFileSync(storyTestListJson(sftddDir, FEATURE, STORY), JSON.stringify({
      feature_id: FEATURE, story_id: STORY, items: [
        { id: "T1", ac_id: "AC1-lists-records", kind: "behavior", status: "pending", description: "GET /api/stock with two records returns 200 and a JSON array of exactly those two records" },
        { id: "T2", ac_id: "AC2-empty-is-empty-array", kind: "behavior", status: "pending", description: "GET /api/stock with no records returns 200 and an empty JSON array" },
        { id: "T3", ac_id: "AC1-lists-records", kind: "fitness", status: "pending", description: "Fitness (NFR-1): GET /api/stock p99 latency is under 200ms over 100 sequential calls against the real branch DB" },
      ],
    }, null, 2));
    return { proj, sftddDir };
  }

  cpSync(join(CORPUS, "features", FEATURE), featDst, { recursive: true });
  if (mode === "corrupt") {
    writeFileSync(
      join(acsDir(sftddDir, FEATURE, STORY), "AC9-blank-submits-ok.json"),
      JSON.stringify(
        {
          id: "AC9-blank-submits-ok",
          given: "the record-stock form with a required field (e.g. SKU) left blank",
          when: "the operator submits the form",
          then: "the submission SUCCEEDS and a stock record is created with the blank field omitted (no validation error is shown)",
          layer: "E2E",
        },
        null,
        2,
      ),
    );
  }
  const master = JSON.parse(readFileSync(join(featDst, "test-list.json"), "utf8")) as {
    items?: Array<{ ac_id?: string }>;
  };
  const acs = new Set(storyAcIds(sftddDir, FEATURE, STORY));
  const items = (master.items ?? []).filter((it) => it.ac_id && acs.has(it.ac_id)) as Array<Record<string, unknown>>;
  writeFileSync(storyTestListJson(sftddDir, FEATURE, STORY), JSON.stringify({ feature_id: FEATURE, story_id: STORY, items }, null, 2));
  return { proj, sftddDir };
}

function runReflect(proj: string, sftddDir: string) {
  const cmds = commandsForAction(
    { kind: "invoke-role", role: "navigator", story: STORY, buildMode: "reflect" },
    { projectDir: proj, sftddDir, featureId: FEATURE, runner: { async run() {} }, modelForRole: () => "sonnet" },
  );
  const claudeCmd = cmds.find((c) => (c as { kind: string }).kind === "claude") as { task: string; model: string };
  const res = spawnSync(
    "claude",
    ["-p", claudeCmd.task, "--agent", "navigator", "--model", claudeCmd.model, "--strict-mcp-config", "--permission-mode", "bypassPermissions"],
    { cwd: proj, encoding: "utf8", timeout: 280_000, maxBuffer: 64 * 1024 * 1024 },
  );
  // eslint-disable-next-line no-console
  console.log(`[live reflect] claude exit=${res.status}`, res.status !== 0 ? (res.stderr || "").slice(-800) : "");
  return { verdict: readReflectVerdict(sftddDir, FEATURE, STORY), hits: recordReflectionGate(sftddDir, FEATURE, STORY) };
}

describe.skipIf(!process.env.RUN_LIVE_REFLECT)("LIVE reflection gate on recorded stockflow F1 (real Navigator turn)", () => {
  it("no-false-positive control: a hand-built, defect-free design passes in one round, no smell", () => {
    const { proj, sftddDir } = stage("minimal_clean");
    const { verdict, hits } = runReflect(proj, sftddDir);
    // eslint-disable-next-line no-console
    console.log("[live minimal_clean] verdict:", JSON.stringify(verdict));
    expect(verdict, "the agent must write a verdict").toBeDefined();
    expect(verdict!.passed).toBe(true); // no false positive on a complete design
    expect(hits).toHaveLength(0); // gate flags nothing
  }, 300_000);

  it("detection: an injected contradictory AC is caught + routed to the spec author", () => {
    const { proj, sftddDir } = stage("corrupt");
    const { verdict, hits } = runReflect(proj, sftddDir);
    // eslint-disable-next-line no-console
    console.log("[live corrupt] verdict:", JSON.stringify(verdict));
    expect(verdict, "the agent must write a verdict").toBeDefined();
    expect(verdict!.passed).toBe(false); // the contradiction is caught
    expect(hits.some((h) => h.smell === "reflect-spec-defect")).toBe(true); // routed to spec-author
  }, 300_000);
});
