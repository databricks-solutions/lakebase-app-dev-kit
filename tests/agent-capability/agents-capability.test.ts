// Agent capability test bed.
//
// Hermetic portion (always runs, no tokens): the registry covers EVERY role and
// every case is well-formed; live cases have their fixture on disk. This is what
// enforces "we have a test for every agent's capability".
//
// Live portion (opt-in: LAKEBASE_TEST_AGENTS=1): actually invoke each live role
// on its fixture and assert the artifact it produces conforms. Replay this to
// catch a doc/schema drift or model-tier regression in a single role without a
// full end-to-end smoke (it caught the spec-author feature_id-vs-id bug).

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { ALL_AGENT_ROLES } from "../../scripts/tdd/agent-models";
import { CAPABILITY_CASES, } from "./cases";
import { runAgentCapability, recordTiming, FIXTURES_DIR } from "./harness";

describe("agent capability bed: registry covers every role", () => {
  it("has at least one capability case per AgentRole (no agent untested)", () => {
    const covered = new Set(CAPABILITY_CASES.map((c) => c.role));
    const missing = [...ALL_AGENT_ROLES].filter((r) => !covered.has(r));
    expect(missing, `roles with no capability case: ${missing.join(", ")}`).toEqual([]);
  });

  it("every case is well-formed", () => {
    for (const c of CAPABILITY_CASES) {
      expect(c.capability, `${c.role}: empty capability`).toBeTruthy();
      expect(c.task, `${c.role}: empty task`).toBeTruthy();
      expect(c.fixture, `${c.role}: empty fixture`).toBeTruthy();
    }
  });

  it("every LIVE case has its fixture on disk + at least one produced artifact", () => {
    for (const c of CAPABILITY_CASES.filter((c) => c.live)) {
      const dir = path.join(FIXTURES_DIR, c.fixture);
      expect(fs.existsSync(dir), `${c.role}: live case missing fixture dir ${dir}`).toBe(true);
      expect(c.produces.length, `${c.role}: live case produces nothing`).toBeGreaterThan(0);
    }
  });

  it("every NON-live case carries a note explaining why it is not yet runnable", () => {
    for (const c of CAPABILITY_CASES.filter((c) => !c.live)) {
      expect(c.note, `${c.role}: non-live case needs a note`).toBeTruthy();
    }
  });
});

const liveAgents = process.env.LAKEBASE_TEST_AGENTS === "1";
const liveCases = CAPABILITY_CASES.filter((c) => c.live);

describe.skipIf(!liveAgents)("agent capability bed: live conformance (LAKEBASE_TEST_AGENTS=1)", () => {
  // Each role invocation is a model turn + kit calls; allow generous time.
  const TIMEOUT = 6 * 60_000;
  for (const c of liveCases) {
    it(`${c.role}: ${c.capability}`, () => {
      const r = runAgentCapability(c);
      // Performance instrumentation: log + persist the role-turn duration so
      // successive runs (model swaps, prompt trims) can be compared.
      const model = c.model ?? "sonnet";
      // eslint-disable-next-line no-console
      console.log(`[agent-timing] ${c.role} (${model}): role ${r.timing.roleMs}ms, total ${r.timing.totalMs}ms, ok=${r.ok}`);
      recordTiming({ role: c.role, model, roleMs: r.timing.roleMs, totalMs: r.timing.totalMs, ok: r.ok, at: new Date().toISOString() });
      const detail = [
        ...r.missing.map((m) => `missing: ${m}`),
        ...r.conformance
          .filter((x) => !x.result.ok)
          .map((x) => `${x.path}: ${x.result.ok ? "" : x.result.violations.join("; ")}`),
      ].join("\n");
      expect(r.ok, `${c.role} did not produce conformant artifacts:\n${detail}`).toBe(true);
    }, TIMEOUT);
  }
});

describe("agent capability bed: skip notice", () => {
  it("documents how to run the live portion when disabled", () => {
    if (liveAgents) return;
    // eslint-disable-next-line no-console
    console.log(
      `agent-capability live portion skipped (${liveCases.length} live case(s)). ` +
        "Run with LAKEBASE_TEST_AGENTS=1 to invoke each role + assert conformance.",
    );
    expect(liveAgents).toBe(false);
  });
});
