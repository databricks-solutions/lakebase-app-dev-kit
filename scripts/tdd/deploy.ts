// /deploy substrate: ship a built feature to a target and verify it is
// reachable. Targets are declared in the project's deploy-targets.yaml, each
// carrying a `type` discriminator. Only `type: local` is implemented today
// (run the app on this machine, poll until it answers); remote types
// (databricks-app, vercel) are recognized but refused with a clear message
// until they land.
//
// Local deploy is the per-sprint "working software" target: it starts the app
// and waits until base_url+health_path returns ANY HTTP response (the server is
// up; a 404 still proves liveness), so each iteration ends as running,
// reachable software the HIL can use. The started process is left running (pid
// recorded under .tdd/deploy/<target>.pid) so feature verification can hit it;
// `stopLocal` tears it down.

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readTargets } from "../lakebase/deploy-targets.js";
import { pollUntil } from "../util/poll-until.js";
import { findFeatureDir } from "./tdd-paths.js";
import { writeEscalation } from "./escalation.js";

export const DEPLOY_EVIDENCE_SCHEMA_VERSION = 1;

/** Feature-verify outcome recorded in the deploy gate evidence. */
export interface VerifyResult {
  passed: boolean;
  command?: string;
  summary?: string;
}

/** The deploy-gate evidence the Release Engineer produces (FEIP-7461):
 *  features/<F>/deploy-evidence.json. The deploy gate approves only when this
 *  exists, conforms, and records reachable=true AND verify.passed=true. */
export interface DeployEvidence {
  schema_version: number;
  feature_id: string;
  /** Set for a per-story deploy (the story's experiment branch). Absent for the
   *  feature-level (merged increment) deploy. */
  story_id?: string;
  target: string;
  url: string;
  reachable: boolean;
  verify: VerifyResult;
  lakebase_branch?: string;
  deployed_at: string;
}

/** True when deploy evidence proves working software: reachable AND verify
 *  passed. The shared teeth predicate for both the feature deploy gate and the
 *  per-story acceptance (FEIP-7461). */
export function deployEvidencePasses(e: DeployEvidence | undefined): boolean {
  return e !== undefined && e.reachable === true && e.verify?.passed === true;
}

/** Read deploy-evidence.json at a path, or undefined if absent/malformed. */
export function readDeployEvidence(file: string): DeployEvidence | undefined {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as DeployEvidence;
  } catch {
    return undefined;
  }
}

/** Whether a STORY's deploy verified (reachable + verify.passed), read from
 *  features/<F>/stories/<S>/deploy-evidence.json. */
export function storyDeployVerified(tddDir: string, featureId: string, storyId: string): boolean {
  const fdir = findFeatureDir(tddDir, featureId);
  if (!fdir) return false;
  return deployEvidencePasses(readDeployEvidence(join(fdir, "stories", storyId, "deploy-evidence.json")));
}

export interface LocalTargetConfig {
  type: "local";
  run: string;
  baseUrl: string;
  healthPath: string;
  readyTimeoutSeconds: number;
  /**
   * Feature-verify command run against the RUNNING app after it is reachable
   * (FEIP-7461 deploy gate). Its exit code becomes deploy-evidence.json
   * verify.passed, which the deploy gate requires to be true. Optional: a target
   * with no verify produces verify.passed=false, which the (strict) deploy gate
   * refuses, so a shippable target must declare one.
   */
  verify?: string;
}

export type ResolveResult =
  | { kind: "local"; config: LocalTargetConfig }
  | { kind: "unsupported"; type: string }
  | { kind: "missing"; reason: string };

/** Resolve a target from the project's deploy-targets.yaml by name. */
export function resolveDeployTarget(projectDir: string, name: string): ResolveResult {
  const cfg = readTargets(projectDir);
  if (!cfg) return { kind: "missing", reason: "deploy-targets.yaml not found in project root" };
  const raw = cfg.targets[name] as unknown as Record<string, string> | undefined;
  if (!raw) return { kind: "missing", reason: `target '${name}' not found in deploy-targets.yaml` };
  const type = raw.type ?? "";
  if (type !== "local") return { kind: "unsupported", type: type || "(no type)" };
  return {
    kind: "local",
    config: {
      type: "local",
      run: raw.run ?? "",
      baseUrl: (raw.base_url ?? "http://localhost:8000").replace(/\/+$/, ""),
      healthPath: raw.health_path ?? "/",
      readyTimeoutSeconds: Number(raw.ready_timeout_seconds ?? "60") || 60,
      verify: raw.verify || undefined,
    },
  };
}

/** Any HTTP response (even 404) means the server is up. Connection error = not up yet. */
export async function probeReachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

export interface DeployResult {
  ok: boolean;
  url?: string;
  pid?: number;
  reason?: string;
  /** The feature-verify outcome (when a verify command was configured + run). */
  verify?: VerifyResult;
  /** Path to the deploy-evidence.json written (when featureId + tddDir given). */
  evidencePath?: string;
}

function pidFile(projectDir: string, target: string): string {
  return join(projectDir, ".tdd", "deploy", `${target}.pid`);
}

/** Resolve the feature dir under tddDir/features by id prefix (mirrors gates.ts). */

/** Run the feature-verify command against the running app; exit 0 = passed. */
function defaultRunVerify(cmd: string, cwd: string, env?: NodeJS.ProcessEnv): boolean {
  try {
    execSync(cmd, { cwd, stdio: "ignore", env: env ?? process.env });
    return true;
  } catch {
    return false;
  }
}

/** Write the deploy-evidence.json. Feature scope: features/<F>/. Story scope
 *  (evidence.story_id set): features/<F>/stories/<S>/. Returns the path, or
 *  undefined when the feature dir cannot be resolved (a bare, feature-less
 *  deploy). */
function writeDeployEvidence(
  tddDir: string,
  evidence: DeployEvidence,
): string | undefined {
  const fdir = findFeatureDir(tddDir, evidence.feature_id);
  if (!fdir) return undefined;
  const dir = evidence.story_id ? join(fdir, "stories", evidence.story_id) : fdir;
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "deploy-evidence.json");
  writeFileSync(file, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  return file;
}

function defaultStart(cmd: string, cwd: string, env?: NodeJS.ProcessEnv): number {
  // Detached process group so stopLocal can kill the whole tree (uvicorn +
  // reloader children). stdio ignored so the smoke is not blocked on output.
  const child = spawn("sh", ["-c", cmd], { cwd, detached: true, stdio: "ignore", env: env ?? process.env });
  child.unref();
  return child.pid ?? -1;
}

export interface DeployArgs {
  projectDir: string;
  targetName: string;
  /**
   * When set, the run command is started with LAKEBASE_BRANCH_ID bound to this
   * branch (FEIP-7566), so a per-story deploy runs the app against the story's
   * EXPERIMENT branch DB, the working software the PO reviews before accept.
   * Unset = the ambient env (the feature branch), the per-sprint deploy.
   */
  lakebaseBranch?: string;
  /**
   * Feature this deploy belongs to. When set together with tddDir, the deploy
   * writes features/<F>/deploy-evidence.json (the deploy gate's artifact).
   */
  featureId?: string;
  /**
   * Story this deploy belongs to (FEIP-7461). When set (with featureId), the
   * evidence is written at story scope: features/<F>/stories/<S>/, and gates
   * the per-story acceptance. Pair with lakebaseBranch = the story's experiment
   * branch so the PO reviews the story on its own DB.
   */
  storyId?: string;
  /** .tdd root for the evidence write (default: <projectDir>/.tdd). */
  tddDir?: string;
  /** Inject for tests: start the run command, return a pid. */
  startProcess?: (cmd: string, cwd: string, env?: NodeJS.ProcessEnv) => number;
  /** Inject for tests: reachability probe. */
  reachable?: (url: string) => Promise<boolean>;
  /** Inject for tests: run the feature-verify command; true = passed (exit 0). */
  runVerify?: (cmd: string, cwd: string, env?: NodeJS.ProcessEnv) => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /**
   * Refuse to deploy when the target port is ALREADY serving before we start
   * (a foreign or stale process). A gate deploy must run + verify OUR app; if
   * something else holds the port, `make run` cannot bind and the reachability
   * probe would falsely pass against the foreign app, recording bogus evidence.
   * With this set, that case fails honestly (reachable=false, verify failed) and
   * raises an escalation, instead of false-positiving. Off by default so the
   * per-cycle reuse path (ensureDeployedAndVerify) is unaffected.
   */
  rejectForeignPort?: boolean;
}

/**
 * Deploy a feature to its target. For `local`: start the run command, record
 * the pid, and poll base_url+health_path until reachable or timeout. Refuses
 * (does not start anything) for missing targets or unsupported types.
 */
export async function deployToTarget(args: DeployArgs): Promise<DeployResult> {
  const resolved = resolveDeployTarget(args.projectDir, args.targetName);
  if (resolved.kind === "missing") return { ok: false, reason: resolved.reason };
  if (resolved.kind === "unsupported") {
    return { ok: false, reason: `unsupported target type: ${resolved.type} (only 'local' is implemented)` };
  }
  const cfg = resolved.config;
  if (!cfg.run) return { ok: false, reason: `target '${args.targetName}' has no run command` };

  const start = args.startProcess ?? defaultStart;
  const reachable = args.reachable ?? probeReachable;
  const url = cfg.baseUrl + cfg.healthPath;

  // Foreign-port guard (gate deploys): if something is ALREADY serving the port
  // before we deploy, our app cannot bind there and verifying against the
  // squatter would record bogus evidence. Fail honestly + escalate.
  if (args.rejectForeignPort && (await reachable(url))) {
    const reason = `target port already serving a process at ${url} before deploy; refusing to verify against a foreign/stale app. Stop it first (lakebase-tdd-deploy --target ${args.targetName} --stop, or free the port).`;
    const verify: VerifyResult = { passed: false, summary: reason };
    let evidencePath: string | undefined;
    if (args.featureId) {
      const tddDir = args.tddDir ?? join(args.projectDir, ".tdd");
      const at = (args.now ?? (() => new Date()))().toISOString();
      evidencePath = writeDeployEvidence(tddDir, {
        schema_version: DEPLOY_EVIDENCE_SCHEMA_VERSION,
        feature_id: args.featureId,
        ...(args.storyId ? { story_id: args.storyId } : {}),
        target: args.targetName,
        url,
        reachable: false,
        verify,
        ...(args.lakebaseBranch ? { lakebase_branch: args.lakebaseBranch } : {}),
        deployed_at: at,
      });
      writeEscalation(tddDir, {
        source: "deploy-verify",
        reason: `deploy of ${args.featureId}${args.storyId ? `/${args.storyId}` : ""} blocked: ${reason}`,
        feature_id: args.featureId,
        ...(args.storyId ? { story_id: args.storyId } : {}),
      });
    }
    return { ok: false, reason, verify, evidencePath };
  }

  // Per-story deploy (FEIP-7566): bind the run command to the experiment
  // branch's Lakebase DB so the PO reviews the story on its own branch. Unset
  // = the ambient env (the feature branch's per-sprint deploy).
  const env = args.lakebaseBranch
    ? { ...process.env, LAKEBASE_BRANCH_ID: args.lakebaseBranch }
    : undefined;

  const pid = start(cfg.run, args.projectDir, env);
  const pf = pidFile(args.projectDir, args.targetName);
  mkdirSync(dirname(pf), { recursive: true });
  writeFileSync(pf, String(pid));

  const poll = await pollUntil<boolean>({
    probe: async () => ((await reachable(url)) ? { done: true, value: true } : { done: false }),
    timeoutMs: cfg.readyTimeoutSeconds * 1000,
    intervalMs: 1000,
    sleep: args.sleep,
    now: args.now,
  });
  const reachableNow = poll.outcome === "done";

  // Feature-verify against the RUNNING app (the deploy gate's teeth): only
  // meaningful once reachable. No verify command configured -> passed:false,
  // which the strict deploy gate refuses (a shippable target must declare one).
  let verify: VerifyResult = { passed: false };
  if (reachableNow && cfg.verify) {
    const runVerify = args.runVerify ?? defaultRunVerify;
    const passed = runVerify(cfg.verify, args.projectDir, env);
    verify = {
      passed,
      command: cfg.verify,
      summary: passed
        ? "feature-verify passed against the running app"
        : "feature-verify FAILED against the running app",
    };
  } else if (reachableNow) {
    verify = { passed: false, summary: "no verify command configured for this target" };
  }

  // Record the deploy-gate evidence when a feature context is given. Written in
  // both the reachable and unreachable cases so the evidence reflects reality
  // (the gate refuses anything but reachable + verify.passed).
  let evidencePath: string | undefined;
  if (args.featureId) {
    const tddDir = args.tddDir ?? join(args.projectDir, ".tdd");
    const at = (args.now ?? (() => new Date()))().toISOString();
    evidencePath = writeDeployEvidence(tddDir, {
      schema_version: DEPLOY_EVIDENCE_SCHEMA_VERSION,
      feature_id: args.featureId,
      ...(args.storyId ? { story_id: args.storyId } : {}),
      target: args.targetName,
      url,
      reachable: reachableNow,
      verify,
      ...(args.lakebaseBranch ? { lakebase_branch: args.lakebaseBranch } : {}),
      deployed_at: at,
    });
    // Raise to the HIL when the deploy could not prove working software
    // (unreachable, or reachable but verify FAILED). This is what turns the
    // Release Engineer's honest "1 of N ACs failed" into a clean raise-to-hil
    // halt instead of the await-acceptance spin (the live FEIP-7422 stall): the
    // deployVerified teeth stay false, so without this the driver re-issues
    // await-acceptance forever. Surface + halt; a human resolves it.
    if (!(reachableNow && verify.passed)) {
      writeEscalation(tddDir, {
        source: "deploy-verify",
        reason: `deploy of ${args.featureId}${args.storyId ? `/${args.storyId}` : ""} did not prove working software: ${
          reachableNow ? verify.summary ?? "verify failed" : `app not reachable at ${url}`
        }`,
        feature_id: args.featureId,
        ...(args.storyId ? { story_id: args.storyId } : {}),
      });
    }
  }

  if (!reachableNow) {
    return {
      ok: false,
      pid,
      reason: `app not reachable at ${url} after ${cfg.readyTimeoutSeconds}s`,
      verify,
      evidencePath,
    };
  }
  return { ok: true, url, pid, verify, evidencePath };
}

export interface CycleVerifyArgs {
  projectDir: string;
  targetName?: string;
  /** Bind the run + verify to the cycle's experiment branch DB (LAKEBASE_BRANCH_ID). */
  lakebaseBranch?: string;
  startProcess?: (cmd: string, cwd: string, env?: NodeJS.ProcessEnv) => number;
  reachable?: (url: string) => Promise<boolean>;
  runVerify?: (cmd: string, cwd: string, env?: NodeJS.ProcessEnv) => boolean;
  /** Stop the running local app (default stopLocal). Injectable for hermetic tests. */
  stop?: (projectDir: string, targetName: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export interface CycleVerifyResult {
  passed: boolean;
  reachable: boolean;
  summary: string;
}

/**
 * Honestly confirm a cycle is GREEN by running the project's verify suite against
 * the running app , deploy-during-build (FEIP-7510 follow-up): the per-cycle GREEN
 * used to be FAKED (`recordRunnerOutcome({passed:true})`), which shipped a
 * false-green to the deploy gate. This ensures the local app is up (idempotent:
 * reuses a reachable one, else starts it + polls), then runs the SAME verify
 * command the Release Engineer uses , so a cycle whose test breaks a sibling test
 * (a contradictory test list) fails here, at GREEN, not three roles later. Does
 * NOT write deploy-evidence (that is the Release Engineer's gate artifact); it
 * only returns pass/fail for the cycle recorder.
 */
export async function ensureDeployedAndVerify(args: CycleVerifyArgs): Promise<CycleVerifyResult> {
  const targetName = args.targetName ?? "local";
  const resolved = resolveDeployTarget(args.projectDir, targetName);
  if (resolved.kind !== "local") {
    return { passed: false, reachable: false, summary: `no local deploy target to verify GREEN against (${resolved.kind})` };
  }
  const cfg = resolved.config;
  if (!cfg.run) return { passed: false, reachable: false, summary: `target '${targetName}' has no run command` };
  if (!cfg.verify) {
    return { passed: false, reachable: false, summary: `target '${targetName}' has no verify command; cannot honestly confirm GREEN` };
  }
  const reachable = args.reachable ?? probeReachable;
  const start = args.startProcess ?? defaultStart;
  const runVerify = args.runVerify ?? defaultRunVerify;
  const stop = args.stop ?? ((pd, tn) => void stopLocal(pd, tn));
  const url = cfg.baseUrl + cfg.healthPath;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BASE_URL: cfg.baseUrl,
    ...(args.lakebaseBranch ? { LAKEBASE_BRANCH_ID: args.lakebaseBranch } : {}),
  };
  // Deploy-during-build serves a FRESH app on THIS turn's code. Every build turn
  // overlays new code, so we do NOT reuse a running app (it would serve stale
  // code). Stop any prior instance first , that also frees the port, so a
  // `uvicorn --reload` caught mid-reload can't cause a double-bind race , then
  // start fresh, poll until reachable, run verify, and ALWAYS stop after, so
  // nothing lingers on the port between turns or after the run.
  stop(args.projectDir, targetName);
  const pid = start(cfg.run, args.projectDir, env);
  const pf = pidFile(args.projectDir, targetName);
  mkdirSync(dirname(pf), { recursive: true });
  writeFileSync(pf, String(pid));
  const poll = await pollUntil<boolean>({
    probe: async () => ((await reachable(url)) ? { done: true, value: true } : { done: false }),
    timeoutMs: cfg.readyTimeoutSeconds * 1000,
    intervalMs: 1000,
    sleep: args.sleep,
    now: args.now,
  });
  if (poll.outcome !== "done") {
    stop(args.projectDir, targetName);
    return {
      passed: false,
      reachable: false,
      summary: `app not reachable at ${url} after ${cfg.readyTimeoutSeconds}s; cannot run GREEN verify`,
    };
  }
  let passed: boolean;
  try {
    passed = runVerify(cfg.verify, args.projectDir, env);
  } finally {
    stop(args.projectDir, targetName); // never leave the app on the port
  }
  return {
    passed,
    reachable: true,
    summary: passed ? "GREEN verify passed against the running app" : "GREEN verify FAILED against the running app",
  };
}

/** Tear down a previously-deployed local target (kills its process group). */
export function stopLocal(projectDir: string, targetName: string): { stopped: boolean } {
  const pf = pidFile(projectDir, targetName);
  if (!existsSync(pf)) return { stopped: false };
  const pid = Number(readFileSync(pf, "utf8").trim());
  if (Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(-pid); // process group
    } catch {
      try {
        process.kill(pid);
      } catch {
        /* already gone */
      }
    }
  }
  rmSync(pf, { force: true });
  return { stopped: true };
}
