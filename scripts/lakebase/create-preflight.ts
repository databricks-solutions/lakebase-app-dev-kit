// Preflight + cleanup helpers for create-project, extracted so each is
// unit-testable without running the full createProject orchestration:
//
//   W5  checkDatabricksAuth      probe auth up front so the flow fails with an
//                                actionable "run databricks auth login" message
//                                instead of a cryptic failure deep in create.
//   W3  warmAndVerifyKit         warm the kit fast-CLI cache AND verify it
//                                resolved, returning a specific reason so the
//                                create flow surfaces a failure loudly at create
//                                time rather than letting a later commit
//                                silently skip schema-diff enrichment.
//   W9  withLakebaseRollback     if a create step throws AFTER the Lakebase
//                                project was created, delete that project so its
//                                slug isn't orphaned (a same-name retry would
//                                otherwise collide with the reserved slug).

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { deleteLakebaseProject } from "./lakebase-project.js";
import { runDatabricks } from "./databricks-cli.js";

export interface PreflightResult {
  ok: boolean;
  reason?: string;
}

function lastLines(s?: string, n = 3): string {
  return (s ?? "").trim().split("\n").filter(Boolean).slice(-n).join("; ");
}

/**
 * W5: probe Databricks auth before any project work. Returns ok:false with a
 * concise reason when `databricks current-user me` fails (stale/missing creds,
 * unreachable host), so the caller can surface a one-time `databricks auth
 * login` prereq instead of failing cryptically inside createLakebaseProject.
 */
export async function checkDatabricksAuth(host?: string): Promise<PreflightResult> {
  try {
    // Through the ONE databricks-CLI wrapper: it sets DATABRICKS_HOST from `host`
    // and resolves + threads --profile (env -> project .env -> host-match).
    await runDatabricks(["current-user", "me", "-o", "json"], { host, timeout: 8_000 });
    return { ok: true };
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    return { ok: false, reason: lastLines(e.stderr, 2) || e.message || "databricks current-user me failed" };
  }
}

/** The actionable prereq message for a failed auth probe (W5). */
export function databricksAuthPrereqMessage(host?: string, reason?: string): string {
  const hostFlag = host ? ` --host ${host.replace(/\/+$/, "")}` : "";
  return (
    "Databricks authentication is required before creating a project. " +
    `Run: databricks auth login${hostFlag}` +
    (reason ? `\n(auth probe failed: ${reason})` : "")
  );
}

/**
 * W3: warm the kit fast-CLI cache (`scripts/lk --warm`) and verify a CLI
 * actually resolves afterward. Returns ok:false with a specific reason on
 * failure so the create flow can surface it loudly at create time.
 */
export function warmAndVerifyKit(projectDir: string, timeoutMs = 180_000): PreflightResult {
  const lk = path.join(projectDir, "scripts", "lk");
  if (!fs.existsSync(lk)) {
    return { ok: false, reason: "scripts/lk shim missing from the scaffold" };
  }
  const warm = spawnSync("bash", [lk, "--warm"], { cwd: projectDir, encoding: "utf-8", timeout: timeoutMs });
  if (warm.status !== 0) {
    return { ok: false, reason: lastLines(warm.stderr) || `lk --warm exited ${warm.status ?? "(killed)"}` };
  }
  // Confirm node can actually load + run a warmed CLI. LK_NO_INSTALL so the
  // verify never triggers an install of its own (warm is the only installer).
  const verify = spawnSync("bash", [lk, "lakebase-schema-diff", "--help"], {
    cwd: projectDir,
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, LK_NO_INSTALL: "1" },
  });
  if (verify.status !== 0) {
    return {
      ok: false,
      reason: `kit warmed but a CLI did not resolve: ${lastLines(verify.stderr) || `exit ${verify.status}`}`,
    };
  }
  return { ok: true };
}

/** The loud, specific warning for a failed kit warm (W3). */
export function kitWarmWarning(projectDir: string, reason?: string): string {
  return (
    `Kit could not be warmed at create: ${reason ?? "unknown reason"}. ` +
    "Commit-time schema diff will be unavailable until the kit warms; run: " +
    `(cd ${projectDir} && ./scripts/lk --warm). Check network access to github.com / npm.`
  );
}

export interface RollbackOptions {
  projectId: string;
  host?: string;
  report?: (step: string, detail?: string) => void;
  /** Injectable for tests; defaults to the real deleteLakebaseProject. */
  deleteProject?: (a: { projectId: string; host?: string }) => Promise<void>;
}

/**
 * W9: run `fn`; if it throws, delete the just-created Lakebase project so its
 * slug isn't orphaned (a retry with the same name would otherwise collide with
 * the reserved/soft-deleted slug), then rethrow with rollback context. The
 * delete is best-effort with a short retry; a "not found" is treated as already
 * gone. Use ONLY to wrap the steps that run AFTER createLakebaseProject.
 */
export async function withLakebaseRollback<T>(opts: RollbackOptions, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const del = opts.deleteProject ?? deleteLakebaseProject;
    const report = opts.report ?? (() => {});
    report(`Create failed; rolling back Lakebase project ${opts.projectId}...`);
    let rolledBack = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await del({ projectId: opts.projectId, host: opts.host });
        rolledBack = true;
        break;
      } catch (delErr) {
        const m = delErr instanceof Error ? delErr.message : String(delErr);
        if (/not.?found/i.test(m)) {
          rolledBack = true;
          break;
        }
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1_000 * attempt));
      }
    }
    const base = err instanceof Error ? err.message : String(err);
    const suffix = rolledBack
      ? ` (rolled back the Lakebase project "${opts.projectId}", so you can retry with the same name)`
      : ` (WARNING: could not roll back the Lakebase project "${opts.projectId}"; purge it before retrying: databricks postgres delete-project ${opts.projectId})`;
    const wrapped = err instanceof Error ? err : new Error(base);
    wrapped.message = `${base}${suffix}`;
    throw wrapped;
  }
}
