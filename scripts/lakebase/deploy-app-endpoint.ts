// Provision a Databricks Apps endpoint for a Lakebase deployment target.
//
// Slice 3 of FEIP-7130 (lakebase-apps-deploy). Composes slice 2's
// generated app.yaml + databricks.yml with `databricks apps deploy -t
// <bundleTarget>`, the devhub-canonical single-command deployment path
// per platform-guide.md "Deployment Workflow" (Option A: validates,
// deploys, and runs in one shot).
//
// The platform auto-grants the service principal the permissions
// declared in databricks.yml's resources block (per slice 2's
// generateBundleYaml). No manual `permissions set` is needed here.
//
// `ensureAppEndpoint` is idempotent: it always invokes `apps deploy`
// which the platform treats as create-or-update. Callers who want a
// cheaper existence check can use `getAppEndpoint` first.
//
// Pairs with createPairedBranch (scripts/lakebase/paired-branch.ts):
// once a Lakebase branch + git branch exist, ensureAppEndpoint provisions
// the matching app endpoint and returns its URL for callers (FEIP-7094
// Playwright tests in particular) to write into .env as APP_BASE_URL.

import { spawn } from "node:child_process";
import { exec } from "../util/exec.js";
import { KIT_TIMEOUTS } from "./kit-config.js";

export interface EnsureAppEndpointArgs {
  /** Working directory containing app.yaml + databricks.yml. Slice 2's
   *  generateAppYaml + generateBundleYaml produce these. */
  workspaceRoot: string;
  /** Databricks CLI profile for auth. */
  profile: string;
  /** App name as declared in databricks.yml resources block. Used to
   *  read back the deployed app's URL after deploy. */
  appName: string;
  /** Bundle target name in databricks.yml `targets:` map. Default
   *  matches generateBundleYaml's default of "default". */
  bundleTargetName?: string;
  /** Override the deploy timeout. Apps deploy can take 5-10 minutes
   *  on cold-start. Default: 600s. */
  timeoutMs?: number;
}

export interface EnsureAppEndpointResult {
  /** True if `apps deploy` exited 0. */
  ok: boolean;
  /** URL of the deployed app, fetched via `apps get` after deploy.
   *  Undefined if the get call failed (the app may still be deployed). */
  url: string | undefined;
  /** Process exit code of the deploy command. */
  exitCode: number | null;
  /** Raw stdout from `apps deploy`. */
  deployStdout: string;
  /** Raw stderr from `apps deploy`. */
  deployStderr: string;
}

export interface GetAppEndpointArgs {
  /** Databricks CLI profile for auth. */
  profile: string;
  /** App name to look up. */
  appName: string;
  /** Override the per-call timeout. Default: KIT_TIMEOUTS.cliDefault. */
  timeoutMs?: number;
}

export interface GetAppEndpointResult {
  /** True iff the app exists on the workspace. */
  exists: boolean;
  /** URL of the app if it exists. */
  url: string | undefined;
  /** Parsed app info (the JSON `databricks apps get` returns). undefined
   *  when the app does not exist. */
  info: Record<string, unknown> | undefined;
}

/**
 * Look up an existing app endpoint by name. Returns `exists: false`
 * (without throwing) when the app does not exist; throws only on
 * infrastructure failures (CLI missing, auth failure).
 */
export async function getAppEndpoint(args: GetAppEndpointArgs): Promise<GetAppEndpointResult> {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  try {
    const stdout = await exec(
      `databricks apps get "${escapeShellArg(args.appName)}" --profile "${escapeShellArg(args.profile)}" -o json`,
      { timeout: timeoutMs }
    );
    const info = JSON.parse(stdout) as Record<string, unknown>;
    return {
      exists: true,
      url: typeof info.url === "string" ? info.url : undefined,
      info,
    };
  } catch (err) {
    const msg = (err as Error).message;
    // CLI returns non-zero with "RESOURCE_DOES_NOT_EXIST" or similar
    // when the app is missing. Treat as a clean negative; any other
    // error bubbles up.
    if (
      /RESOURCE_DOES_NOT_EXIST|does not exist|not found|404|status: 404/i.test(msg)
    ) {
      return { exists: false, url: undefined, info: undefined };
    }
    throw err;
  }
}

/**
 * Provision (create or update) a Databricks Apps endpoint for the
 * declared bundle target. Runs `databricks apps deploy -t <target>`
 * against `workspaceRoot`, which must already contain app.yaml +
 * databricks.yml from slice 2's generators.
 *
 * Returns the deployed app's URL via a follow-up `apps get` call.
 *
 * The result's `ok` field is the contract; `deployStdout` / `deployStderr`
 * are for debugging and surfacing in agent / extension UIs. The promise
 * rejects only on infrastructure failures (CLI not on PATH, timeout
 * killing the deploy process).
 */
export function ensureAppEndpoint(args: EnsureAppEndpointArgs): Promise<EnsureAppEndpointResult> {
  const target = args.bundleTargetName ?? "default";
  const timeoutMs = args.timeoutMs ?? 600_000;
  return new Promise((resolve, reject) => {
    const child = spawn(
      "databricks",
      ["apps", "deploy", "-t", target, "--profile", args.profile],
      { cwd: args.workspaceRoot }
    );
    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | undefined;
    let settled = false;

    const finish = (cb: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      cb();
    };

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      finish(() => reject(new Error(`databricks apps deploy failed to start: ${err.message}`)));
    });

    child.on("close", async (code) => {
      finish(async () => {
        const ok = code === 0;
        // Look up URL even on failure: a partial deploy can still
        // surface a usable endpoint, and the caller benefits from
        // knowing.
        let url: string | undefined;
        try {
          const lookup = await getAppEndpoint({ appName: args.appName, profile: args.profile });
          url = lookup.url;
        } catch {
          // Non-fatal: keep url undefined, surface deploy fields.
        }
        resolve({
          ok,
          url,
          exitCode: code,
          deployStdout: stdout,
          deployStderr: stderr,
        });
      });
    });

    timer = setTimeout(() => {
      finish(() => {
        child.kill("SIGTERM");
        reject(new Error(`databricks apps deploy timed out after ${timeoutMs}ms`));
      });
    }, timeoutMs);
  });
}

// ─── helpers ────────────────────────────────────────────────────

function escapeShellArg(s: string): string {
  // Allow the kit's exec helper (which uses /bin/sh -c) to consume the
  // string safely. We already double-quote the argument; only embedded
  // double quotes need escaping.
  return s.replace(/"/g, '\\"');
}
