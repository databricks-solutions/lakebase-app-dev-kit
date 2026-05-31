// lakebase-doctor health checks (FEIP-7330, P0.4). Mirrors the
// extension's Health Check at the CLI / agent boundary so headless
// users can run a single "what's wrong?" command before tail-chasing
// .env drift / token-scope issues by hand.

import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "../util/exec.js";
import { resolveDatabricksHost } from "./databricks-host.js";
import { listBranches } from "./branch-utils.js";
import { verifyHooks } from "./project-verify.js";
import { detectLanguage } from "./migrate.js";

export type CheckStatus = "ok" | "warn" | "fail" | "skip";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  /** Single-line summary for human-readable output. */
  message: string;
  /** Detailed payload for --json consumers (e.g. version string, file paths). */
  detail?: unknown;
  /** Suggested remediation when status is warn/fail. */
  hint?: string;
}

export interface DoctorArgs {
  /** Project directory to inspect. Default: process.cwd(). */
  projectDir?: string;
  /** Databricks CLI profile. Default: process.env.DATABRICKS_CONFIG_PROFILE. */
  profile?: string;
  /** Override host (skip resolveDatabricksHost). */
  host?: string;
}

export interface DoctorReport {
  /** Worst status across all checks. */
  overall: CheckStatus;
  checks: CheckResult[];
}

function readEnvFile(projectDir: string): Record<string, string> {
  const envPath = path.join(projectDir, ".env");
  if (!fs.existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

async function checkDatabricksCli(): Promise<CheckResult> {
  try {
    const out = await exec("databricks --version", { timeout: 5_000 });
    const trimmed = out.trim();
    const m = trimmed.match(/v?(\d+)\.(\d+)/);
    if (m) {
      const major = parseInt(m[1], 10);
      if (major < 1) {
        return {
          name: "databricks-cli",
          status: "warn",
          message: `Databricks CLI ${trimmed} - kit expects v1.0+`,
          detail: { version: trimmed },
          hint: "Upgrade via Homebrew or the installer at https://docs.databricks.com/dev-tools/cli/install.html",
        };
      }
    }
    return {
      name: "databricks-cli",
      status: "ok",
      message: `Databricks CLI ${trimmed}`,
      detail: { version: trimmed },
    };
  } catch (err) {
    return {
      name: "databricks-cli",
      status: "fail",
      message: "databricks CLI not found on PATH",
      detail: { error: (err as Error).message },
      hint: "Install via Homebrew (`brew install databricks-cli`) or the official installer.",
    };
  }
}

async function checkAuth(profile?: string): Promise<CheckResult> {
  try {
    const profileArg = profile ? ` --profile ${profile}` : "";
    const out = await exec(`databricks auth describe -o json${profileArg}`, {
      timeout: 5_000,
    });
    let host: string | undefined;
    try {
      const parsed = JSON.parse(out);
      host =
        parsed?.details?.host ?? parsed?.host ?? parsed?.host_name;
    } catch {
      // ignore parse error; the auth call still succeeded
    }
    return {
      name: "databricks-auth",
      status: "ok",
      message: host
        ? `Authenticated to ${host}`
        : "Authenticated (no host parsed from describe)",
      detail: { host, profile: profile ?? "default" },
    };
  } catch (err) {
    return {
      name: "databricks-auth",
      status: "fail",
      message: "databricks auth describe failed",
      detail: { error: (err as Error).message },
      hint: "Run `databricks auth login --host <your-workspace>` to authenticate.",
    };
  }
}

async function checkIdentity(profile?: string): Promise<CheckResult> {
  try {
    const profileArg = profile ? ` --profile ${profile}` : "";
    const out = await exec(`databricks current-user me -o json${profileArg}`, {
      timeout: 5_000,
    });
    let user: string | undefined;
    try {
      const parsed = JSON.parse(out);
      user = parsed?.userName ?? parsed?.emails?.[0]?.value;
    } catch {
      // ignore
    }
    return {
      name: "workspace-identity",
      status: "ok",
      message: user
        ? `Workspace reachable as ${user}`
        : "Workspace reachable",
      detail: { user },
    };
  } catch (err) {
    return {
      name: "workspace-identity",
      status: "fail",
      message: "Cannot resolve current user from workspace",
      detail: { error: (err as Error).message },
      hint: "Re-authenticate via `databricks auth login` and verify network connectivity.",
    };
  }
}

function checkEnv(projectDir: string): CheckResult {
  const env = readEnvFile(projectDir);
  const required = ["LAKEBASE_PROJECT_ID", "LAKEBASE_BRANCH_ID"];
  const missing = required.filter((k) => !env[k]);
  if (Object.keys(env).length === 0) {
    return {
      name: "env-file",
      status: "warn",
      message: ".env not found",
      detail: { projectDir, envPath: path.join(projectDir, ".env") },
      hint: "Run `lakebase-get-connection --output dsn --write-env` or `lakebase-branch sync-env`.",
    };
  }
  if (missing.length) {
    return {
      name: "env-file",
      status: "fail",
      message: `.env missing required vars: ${missing.join(", ")}`,
      detail: { presentKeys: Object.keys(env), missing },
      hint: "Re-run `lakebase-branch sync-env` to regenerate .env from the current branch.",
    };
  }
  return {
    name: "env-file",
    status: "ok",
    message: `.env present with required keys (LAKEBASE_PROJECT_ID=${env.LAKEBASE_PROJECT_ID})`,
    detail: { keys: Object.keys(env).length, projectId: env.LAKEBASE_PROJECT_ID },
  };
}

async function checkLakebaseProject(
  projectId: string,
  host: string | undefined
): Promise<CheckResult> {
  if (!projectId) {
    return {
      name: "lakebase-project",
      status: "skip",
      message: "Skipped: no LAKEBASE_PROJECT_ID in .env",
    };
  }
  try {
    const branches = await listBranches({ instance: projectId, host });
    return {
      name: "lakebase-project",
      status: "ok",
      message: `Project ${projectId} reachable (${branches.length} branches)`,
      detail: {
        projectId,
        branchCount: branches.length,
        branchNames: branches.map((b) => b.name),
      },
    };
  } catch (err) {
    return {
      name: "lakebase-project",
      status: "fail",
      message: `Cannot list branches on project ${projectId}`,
      detail: { error: (err as Error).message },
      hint: "Verify the project exists and your account has CAN_USE on it.",
    };
  }
}

async function checkGitRemote(projectDir: string): Promise<CheckResult> {
  try {
    const url = (
      await exec("git remote get-url origin", {
        cwd: projectDir,
        timeout: 5_000,
      })
    ).trim();
    if (!url) {
      return {
        name: "git-remote",
        status: "warn",
        message: "No origin remote configured",
      };
    }
    return {
      name: "git-remote",
      status: "ok",
      message: `origin -> ${url}`,
      detail: { url },
    };
  } catch (err) {
    return {
      name: "git-remote",
      status: "warn",
      message: "git remote get-url origin failed",
      detail: { error: (err as Error).message },
      hint: "Run `git remote add origin <url>` if this is a fresh repo.",
    };
  }
}

function checkLanguage(projectDir: string): CheckResult {
  try {
    const lang = detectLanguage(projectDir);
    return {
      name: "detected-language",
      status: "ok",
      message: `Project language: ${lang}`,
      detail: { language: lang },
    };
  } catch (err) {
    return {
      name: "detected-language",
      status: "warn",
      message: "Could not detect project language",
      detail: { error: (err as Error).message },
    };
  }
}

function checkHooks(projectDir: string): CheckResult {
  const v = verifyHooks(projectDir);
  const installed = (Object.entries(v) as [string, boolean][])
    .filter(([, ok]) => ok)
    .map(([k]) => k);
  const missing = (Object.entries(v) as [string, boolean][])
    .filter(([, ok]) => !ok)
    .map(([k]) => k);
  if (missing.length === 0) {
    return {
      name: "git-hooks",
      status: "ok",
      message: `All ${installed.length} project git hooks installed`,
      detail: v,
    };
  }
  return {
    name: "git-hooks",
    status: "warn",
    message: `Missing git hooks: ${missing.join(", ")}`,
    detail: v,
    hint: "Re-run `lakebase-create-project --install-hooks` or copy the hook files from the kit's templates.",
  };
}

function worstOf(statuses: CheckStatus[]): CheckStatus {
  const order: CheckStatus[] = ["ok", "skip", "warn", "fail"];
  return statuses.reduce<CheckStatus>(
    (acc, s) => (order.indexOf(s) > order.indexOf(acc) ? s : acc),
    "ok"
  );
}

/**
 * Run all doctor checks and return a structured report. The CLI prints
 * the report; programmatic consumers can read the structured data and
 * decide what to surface.
 */
export async function runDoctor(args: DoctorArgs = {}): Promise<DoctorReport> {
  const projectDir = args.projectDir ?? process.cwd();
  const profile = args.profile ?? process.env.DATABRICKS_CONFIG_PROFILE;

  const cli = await checkDatabricksCli();
  const auth = cli.status === "ok" ? await checkAuth(profile) : {
    name: "databricks-auth",
    status: "skip" as CheckStatus,
    message: "Skipped: databricks CLI not available",
  };

  const identity = auth.status === "ok" ? await checkIdentity(profile) : {
    name: "workspace-identity",
    status: "skip" as CheckStatus,
    message: "Skipped: auth check failed",
  };

  let host = args.host;
  if (!host && auth.status === "ok") {
    try {
      // resolveDatabricksHost requires a profile string; fall back to
      // "DEFAULT" if the caller hasn't pinned one explicitly. When
      // resolution fails (unknown profile, parse error) the
      // lakebase-project check still works via env-derived host.
      host = await resolveDatabricksHost({ profile: profile ?? "DEFAULT" });
    } catch {
      // best-effort; lakebase-project check will skip if no host
    }
  }

  const env = checkEnv(projectDir);
  const envVars = readEnvFile(projectDir);
  const lakebaseProject = await checkLakebaseProject(
    envVars.LAKEBASE_PROJECT_ID ?? "",
    host
  );
  const gitRemote = await checkGitRemote(projectDir);
  const language = checkLanguage(projectDir);
  const hooks = checkHooks(projectDir);

  const checks: CheckResult[] = [
    cli,
    auth,
    identity,
    env,
    lakebaseProject,
    gitRemote,
    language,
    hooks,
  ];

  return {
    overall: worstOf(checks.map((c) => c.status)),
    checks,
  };
}
