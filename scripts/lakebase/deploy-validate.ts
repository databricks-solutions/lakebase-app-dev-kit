// Run `databricks apps validate` against a Lakebase-paired project root.
//
// Per the Q1 probe (ADR-0002), validate runs install + typegen + lint +
// typecheck + build + tests in one shot against the project's package.json,
// without requiring a deployed app on the target workspace. Substrate
// uses it as the canonical pre-deploy gate so the kit's deploy entry
// point fails fast on configuration drift before touching workspace state.
//
// The CLI does NOT emit machine-readable output by default; the substrate
// captures both streams and returns a structured result so callers can
// branch on `ok` rather than parsing prose. The full stdout / stderr stay
// available for surfacing in agent / extension UIs.

import { spawn } from "node:child_process";
import { KIT_TIMEOUTS } from "./kit-config.js";

export interface ValidateAppOptions {
  /** Project root directory containing package.json + app.yaml. */
  workspaceRoot: string;
  /** Databricks CLI profile used to authenticate validate's discovery
   *  calls. Required: validate refuses to run without a profile or
   *  DATABRICKS_HOST. */
  profile: string;
  /** Override the per-call timeout. Defaults to the kit's long-CLI band
   *  (KIT_TIMEOUTS.cliLong, 60s by default). Validate is fast for the
   *  no-op case but can take longer on large projects with many deps. */
  timeoutMs?: number;
}

export interface ValidateAppResult {
  /** True when the CLI exited with status 0. */
  ok: boolean;
  /** Process exit code; null when the process was killed by signal. */
  exitCode: number | null;
  /** Full stdout of the validate run. The CLI uses ANSI color + emoji
   *  markers; callers that surface this to humans can render as-is, to
   *  agents can strip ANSI codes. */
  stdout: string;
  /** Full stderr of the validate run. */
  stderr: string;
}

/**
 * Run `databricks apps validate --profile <profile>` in the given
 * workspace root. The promise resolves with a structured result for any
 * exit code (including non-zero); it only rejects on infrastructure
 * failures (CLI not found, working dir doesn't exist, etc.) and on
 * timeout.
 *
 * Why this shape: every other substrate primitive that wraps a CLI uses
 * the same "structured result + reject only on infra failure" contract
 * (see branch-create.ts / migrate.ts). Callers compose the boolean
 * `ok` field into higher-level orchestration without try/catch noise.
 */
export function validateApp(opts: ValidateAppOptions): Promise<ValidateAppResult> {
  const timeoutMs = opts.timeoutMs ?? KIT_TIMEOUTS.cliLong;
  return new Promise((resolve, reject) => {
    // databricks-cli-exempt: streaming spawn with a structured-result contract
    // (resolves on ANY exit code, not throw-on-nonzero like the wrapper) + a cwd;
    // threads an explicit required --profile from the deploy config.
    const child = spawn(
      "databricks",
      ["apps", "validate", "--profile", opts.profile],
      { cwd: opts.workspaceRoot }
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
      finish(() => reject(new Error(`databricks apps validate failed to start: ${err.message}`)));
    });

    child.on("close", (code) => {
      finish(() => resolve({
        ok: code === 0,
        exitCode: code,
        stdout,
        stderr,
      }));
    });

    timer = setTimeout(() => {
      finish(() => {
        child.kill("SIGTERM");
        reject(new Error(`databricks apps validate timed out after ${timeoutMs}ms`));
      });
    }, timeoutMs);
  });
}
