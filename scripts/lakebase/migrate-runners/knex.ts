// Knex runner for Node.js projects. Completed alongside FEIP-7210
// slice 3; the original primitives lift (FEIP-7091) shipped this file
// as a stub that threw "not yet implemented".
//
// Mirrors the alembic.ts approach: shell out to `npx knex`, derive the
// result by comparing `migrate:status` before + after the mutating call.
// We do NOT parse the mutating-call's stdout, which keeps the runner
// robust to formatting drift between Knex minor versions.
//
// Caveats vs Alembic:
//   1. Knex has no "target revision" rollback in the core CLI. We map
//      target="all" or "0" to `migrate:rollback --all`; any other target
//      value rolls back the most recent batch (Knex's default).
//   2. Knex applies in batches, not individual revisions. The "applied"
//      list is derived from filename diff before/after, so each call
//      reports what was newly completed regardless of batch grouping.

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  MigrationError,
  type ApplyMigrationsResult,
  type RollbackMigrationResult,
  type MigrationStatusResult,
  type AppliedMigration,
  type PendingMigration,
} from "../migrate.js";

interface KnexCtx {
  projectDir: string;
  dsn: string;
}

const KNEXFILE_VARIANTS = ["knexfile.js", "knexfile.ts", "knexfile.mjs", "knexfile.cjs"];

/** Locate the project's knexfile. Returns the absolute path or undefined. */
export function findKnexfile(projectDir: string): string | undefined {
  for (const name of KNEXFILE_VARIANTS) {
    const p = path.join(projectDir, name);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function runKnex(ctx: KnexCtx, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const knexfile = findKnexfile(ctx.projectDir);
    if (!knexfile) {
      reject(
        new MigrationError(
          `No knexfile found in ${ctx.projectDir}. ` +
            `Expected one of: ${KNEXFILE_VARIANTS.join(", ")}.`
        )
      );
      return;
    }
    // `npx --no-install knex` prefers node_modules/.bin/knex without
    // auto-installing; failure here means the consumer hasn't installed
    // knex locally, which is a user-fixable error.
    const child = spawn("npx", ["--no-install", "knex", "--knexfile", knexfile, ...args], {
      cwd: ctx.projectDir,
      env: { ...process.env, DATABASE_URL: ctx.dsn },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      reject(
        new MigrationError(
          `Could not spawn knex via npx. Is Node installed and is 'knex' in the project's node_modules? ${err.message}`,
          err
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new MigrationError(
            `knex ${args.join(" ")} exited with code ${code}.\nstdout: ${stdout}\nstderr: ${stderr}`
          )
        );
      }
    });
  });
}

/**
 * Parse `knex migrate:status` output. Knex 3.x emits:
 *   Found N Completed Migration file/files.
 *   <filename>
 *   ...
 *   Found M Pending Migration file/files.   (or)   No Pending Migration files Found.
 *   <filename>
 *   ...
 * Exported for unit testing.
 */
export function parseKnexStatus(stdout: string): { completed: string[]; pending: string[] } {
  const completed: string[] = [];
  const pending: string[] = [];
  let mode: "completed" | "pending" | null = null;
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^Found\s+\d+\s+Completed\s+Migration/i.test(line)) {
      mode = "completed";
      continue;
    }
    if (/^Found\s+\d+\s+Pending\s+Migration/i.test(line)) {
      mode = "pending";
      continue;
    }
    if (/^No\s+Pending\s+Migration\s+files\s+Found/i.test(line)) {
      mode = null;
      continue;
    }
    if (!line) continue;
    // Knex prefixes some informational lines with "Using environment:" and
    // similar. Filter to anything that looks like a migration filename.
    if (!/\.(js|ts|mjs|cjs)$/.test(line)) continue;
    if (mode === "completed") completed.push(line);
    if (mode === "pending") pending.push(line);
  }
  return { completed, pending };
}

function parseKnexFilename(filename: string): { version: string; description: string } {
  const stem = filename.replace(/\.(js|ts|mjs|cjs)$/, "");
  const m = stem.match(/^(\d{14})_(.+)$/);
  const version = m ? m[1] : stem;
  const description = m ? m[2].replace(/[_-]/g, " ") : stem;
  return { version, description };
}

export async function applyKnex(ctx: KnexCtx): Promise<ApplyMigrationsResult> {
  const beforeOut = await runKnex(ctx, ["migrate:status"]);
  const before = parseKnexStatus(beforeOut.stdout);
  await runKnex(ctx, ["migrate:latest"]);
  const afterOut = await runKnex(ctx, ["migrate:status"]);
  const after = parseKnexStatus(afterOut.stdout);

  const newlyCompleted = after.completed.filter((f) => !before.completed.includes(f));
  if (newlyCompleted.length === 0) {
    return { applied: [], alreadyAtLatest: true, tool: "knex" };
  }
  const applied: AppliedMigration[] = newlyCompleted.map((filename) => {
    const { version, description } = parseKnexFilename(filename);
    return { version, description };
  });
  return { applied, alreadyAtLatest: false, tool: "knex" };
}

export async function rollbackKnex(
  ctx: KnexCtx & { target: string }
): Promise<RollbackMigrationResult> {
  const beforeOut = await runKnex(ctx, ["migrate:status"]);
  const before = parseKnexStatus(beforeOut.stdout);

  const rollbackArgs = ["migrate:rollback"];
  // Knex CLI rollback semantics:
  //   migrate:rollback         -> last batch only
  //   migrate:rollback --all   -> everything
  // No revision-targeted rollback in core. Map "all" / "0" to --all;
  // any other target value falls through to last-batch rollback. The
  // adapter contract documents target as adapter-specific.
  if (ctx.target === "all" || ctx.target === "0") {
    rollbackArgs.push("--all");
  }

  await runKnex(ctx, rollbackArgs);
  const afterOut = await runKnex(ctx, ["migrate:status"]);
  const after = parseKnexStatus(afterOut.stdout);

  const rolledBackFiles = before.completed.filter((f) => !after.completed.includes(f));
  const rolledBack: AppliedMigration[] = rolledBackFiles.map((filename) => {
    const { version, description } = parseKnexFilename(filename);
    return { version, description };
  });
  return { rolledBack, tool: "knex" };
}

export async function statusKnex(ctx: KnexCtx): Promise<MigrationStatusResult> {
  const { stdout } = await runKnex(ctx, ["migrate:status"]);
  const { completed, pending } = parseKnexStatus(stdout);
  const current =
    completed.length > 0
      ? parseKnexFilename(completed[completed.length - 1]).version
      : undefined;
  const pendingOut: PendingMigration[] = pending.map((filename) => {
    const { version, description } = parseKnexFilename(filename);
    return { version, filename, description };
  });
  return { current, pending: pendingOut, tool: "knex" };
}
