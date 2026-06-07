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

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readTargets } from "../lakebase/deploy-targets.js";
import { pollUntil } from "../util/poll-until.js";

export interface LocalTargetConfig {
  type: "local";
  run: string;
  baseUrl: string;
  healthPath: string;
  readyTimeoutSeconds: number;
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
}

function pidFile(projectDir: string, target: string): string {
  return join(projectDir, ".tdd", "deploy", `${target}.pid`);
}

function defaultStart(cmd: string, cwd: string): number {
  // Detached process group so stopLocal can kill the whole tree (uvicorn +
  // reloader children). stdio ignored so the smoke is not blocked on output.
  const child = spawn("sh", ["-c", cmd], { cwd, detached: true, stdio: "ignore" });
  child.unref();
  return child.pid ?? -1;
}

export interface DeployArgs {
  projectDir: string;
  targetName: string;
  /** Inject for tests: start the run command, return a pid. */
  startProcess?: (cmd: string, cwd: string) => number;
  /** Inject for tests: reachability probe. */
  reachable?: (url: string) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
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

  const pid = start(cfg.run, args.projectDir);
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

  if (poll.outcome !== "done") {
    return { ok: false, pid, reason: `app not reachable at ${url} after ${cfg.readyTimeoutSeconds}s` };
  }
  return { ok: true, url, pid };
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
