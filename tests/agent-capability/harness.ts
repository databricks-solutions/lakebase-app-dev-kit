// Agent capability test bed (harness).
//
// One replayable test per role: given a fixture (the role's inputs laid out
// under .tdd/), invoke that role headless via `claude -p --agent <role>`, then
// assert the artifact it produced CONFORMS to its schema. This is the unit of
// "does this agent still do its job" , re-run it to catch a doc/schema drift or
// a model-tier regression (e.g. the spec-author shipping feature_id instead of
// id) without a full end-to-end smoke.
//
// LIVE: invoking a role calls the model + the kit CLIs, so the live run is
// opt-in behind LAKEBASE_TEST_AGENTS=1. The conformance check itself is
// hermetic (checkArtifactConformance), and the registry shape is hermetically
// guarded in agents-capability.test.ts so the bed always has a green,
// no-token portion that enforces "every role has a case".

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  checkArtifactConformance,
  canonicalArtifactName,
  type ConformanceResult,
} from "../../scripts/tdd/artifact-conformance.js";
import type { AgentRole } from "../../scripts/tdd/agent-log.js";

const SKILL_DIR = path.resolve(__dirname, "..", "..", "skills", "lakebase-tdd-workflows");
export const FIXTURES_DIR = path.resolve(__dirname, "fixtures");

/** One produced artifact to validate after the role runs. */
export interface ProducedArtifact {
  /** Path relative to the project root (usually under `.tdd/`). */
  path: string;
}

export interface AgentCapabilityCase {
  role: AgentRole;
  /** Human-readable capability under test. */
  capability: string;
  /** Fixture dir name under fixtures/ (its contents are copied into the scratch project). */
  fixture: string;
  /** Model to run the role on (defaults to the kit's recommended for the role). */
  model?: string;
  /** The instruction handed to `claude -p --agent <role>`. */
  task: string;
  /** Artifacts the role must produce; each is read + conformance-checked. */
  produces: ProducedArtifact[];
  /** True when the case is runnable live today. false = registered but its
   *  fixture/runtime is not yet built (still counts for coverage). */
  live: boolean;
  /** Why a non-live case is not yet runnable. */
  note?: string;
}

export interface CapabilityRunResult {
  ok: boolean;
  conformance: { path: string; result: ConformanceResult }[];
  missing: string[];
  scratchDir: string;
  /** Timing instrumentation (for performance tuning across models/configs). */
  timing: {
    /** Wall-clock of the role invocation (the `claude -p` model turn), ms. */
    roleMs: number;
    /** Wall-clock of the whole case (setup + invoke + conformance), ms. */
    totalMs: number;
  };
}

/** Lay out a scratch project: the role + references docs under .claude/, and the
 *  fixture's files at the project root. Returns the scratch project dir. */
function buildScratchProject(c: AgentCapabilityCase): string {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `agentcap-${c.role}-`));
  // Role definitions + their referenced docs, so `--agent <role>` resolves and
  // any `references/*.md` the prompt links can be read.
  fs.cpSync(path.join(SKILL_DIR, "agents"), path.join(scratch, ".claude", "agents"), { recursive: true });
  if (fs.existsSync(path.join(SKILL_DIR, "references"))) {
    fs.cpSync(path.join(SKILL_DIR, "references"), path.join(scratch, ".claude", "references"), { recursive: true });
  }
  // The fixture's inputs (laid out as the role expects, e.g. .tdd/...).
  fs.cpSync(path.join(FIXTURES_DIR, c.fixture), scratch, { recursive: true });
  return scratch;
}

/**
 * Run one capability case live: invoke the role, then conformance-check every
 * artifact it was supposed to produce. Throws only on setup errors; a
 * non-conformant or missing artifact is reported in the result (ok=false).
 */
export function runAgentCapability(c: AgentCapabilityCase): CapabilityRunResult {
  const t0 = Date.now();
  const scratch = buildScratchProject(c);
  const model = c.model ?? "sonnet";
  // Headless, no MCP; the role authors artifacts from the prompt + fixture.
  const roleStart = Date.now();
  execFileSync(
    "claude",
    ["-p", c.task, "--agent", c.role, "--model", model, "--strict-mcp-config"],
    { cwd: scratch, stdio: "pipe", timeout: 5 * 60_000 },
  );
  const roleMs = Date.now() - roleStart;

  const conformance: { path: string; result: ConformanceResult }[] = [];
  const missing: string[] = [];
  for (const a of c.produces) {
    const abs = path.join(scratch, a.path);
    if (!fs.existsSync(abs)) {
      missing.push(a.path);
      continue;
    }
    const name = canonicalArtifactName(a.path);
    conformance.push({ path: a.path, result: checkArtifactConformance(name, fs.readFileSync(abs, "utf8")) });
  }
  const ok = missing.length === 0 && conformance.every((c) => c.result.ok);
  return { ok, conformance, missing, scratchDir: scratch, timing: { roleMs, totalMs: Date.now() - t0 } };
}

/** Append a timing record to tests/agent-capability/timings.jsonl (gitignored)
 *  so successive runs can be compared during performance tuning. */
export function recordTiming(rec: {
  role: AgentRole;
  model: string;
  roleMs: number;
  totalMs: number;
  ok: boolean;
  at: string;
}): void {
  const file = path.join(__dirname, "timings.jsonl");
  fs.appendFileSync(file, `${JSON.stringify(rec)}\n`, "utf8");
}
