// Alembic runner for the kit's migrate primitives.
//
// Reference implementation. Shells out to `alembic`. Expects the project
// to have a working `alembic.ini` and a `migrations/versions/` (or
// `alembic/versions/`) directory.
//
// DATABASE_URL is the standard env hook Alembic projects read in their
// env.py via `os.getenv("DATABASE_URL")`. We export it scoped to the
// child process so we never mutate the caller's env.
//
// Result derivation is state-based, not log-based: we call `alembic
// current` before and after upgrade/downgrade and use `alembic history`
// to enumerate the revisions between those two pins. Alembic's own
// stdout/stderr is not load-bearing here, which keeps the runner robust
// to logger config drift in the consumer's `alembic.ini`.

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  SchemaMigrationError,
  type ApplySchemaMigrationsResult,
  type RollbackSchemaMigrationResult,
  type SchemaMigrationStatusResult,
  type AppliedSchemaMigration,
  type PendingSchemaMigration,
} from "../schema-migrate.js";

interface RunnerCtx {
  projectDir: string;
  dsn: string;
}

/**
 * Resolve the `alembic` binary path. uv-managed Python projects install
 * alembic into a per-project `.venv/bin/alembic`, which is NOT on the
 * runner's PATH. Spawning bare `alembic` fails with ENOENT in CI even
 * after `uv sync` succeeded. Prefer the project-local venv when it
 * exists; fall back to bare `alembic` for projects with a pre-activated
 * shell venv or a system-wide install.
 */
export function resolveAlembicBin(projectDir: string): string {
  const candidates = [
    path.join(projectDir, ".venv", "bin", "alembic"),
    path.join(projectDir, "venv", "bin", "alembic"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // best-effort; keep checking
    }
  }
  return "alembic";
}

/**
 * Spawn `alembic` in the project. DATABASE_URL is exported to the child only
 * when a DSN is supplied: apply/status/rollback always pass one; creating a
 * skeleton revision (no --autogenerate) does not need a DB.
 */
function spawnAlembic(
  projectDir: string,
  args: string[],
  dsn?: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const bin = resolveAlembicBin(projectDir);
    // Put the project root on PYTHONPATH so `app` is importable for EVERY alembic
    // subcommand. `upgrade` runs env.py (which prepends sys.path), but `history`
    // and other read-only commands do not, yet they still import every migration
    // module to build the revision map. A data migration that imports app code
    // then fails ModuleNotFoundError under `history` but works under `upgrade`.
    const env: NodeJS.ProcessEnv = { ...process.env };
    env.PYTHONPATH = [projectDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
    if (dsn) env.DATABASE_URL = dsn;
    const child = spawn(bin, args, {
      cwd: projectDir,
      env,
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
        new SchemaMigrationError(
          `Could not spawn alembic. Is it installed and on PATH? ${err.message}`,
          err
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new SchemaMigrationError(
            `alembic ${args.join(" ")} exited with code ${code}.\nstdout: ${stdout}\nstderr: ${stderr}`
          )
        );
      }
    });
  });
}

function runAlembic(ctx: RunnerCtx, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return spawnAlembic(ctx.projectDir, args, ctx.dsn);
}

/**
 * Create a new Alembic revision with an EXPLICIT sequential rev-id, so the
 * file is `<revId>_<slug>.py` and its internal `revision == revId` (rather
 * than Alembic's default hash). This is what makes feature migrations count
 * up `0001`, `0002`, ... deterministically instead of getting unordered
 * hash names. Returns the created file's absolute path.
 *
 * `autogenerate` diffs the models against the branch DB to populate the body
 * and requires a DSN; without it an empty skeleton is created (DB-free).
 */
export async function createAlembicRevision(opts: {
  projectDir: string;
  revId: string;
  message: string;
  autogenerate?: boolean;
  dsn?: string;
}): Promise<string> {
  const args = ["revision", "--rev-id", opts.revId, "-m", opts.message];
  if (opts.autogenerate) args.push("--autogenerate");
  const { stdout } = await spawnAlembic(opts.projectDir, args, opts.dsn);
  // Alembic prints: "Generating /abs/path/<revId>_<slug>.py ...  done"
  const m = stdout.match(/Generating\s+(\S+\.py)/);
  if (m) return m[1].trim();
  // Fallback: scan the conventional versions dirs for the new rev-id prefix.
  for (const rel of ["migrations/versions", "alembic/versions"]) {
    const dir = path.join(opts.projectDir, rel);
    if (!fs.existsSync(dir)) continue;
    const hit = fs.readdirSync(dir).find((f) => f.startsWith(`${opts.revId}_`) && f.endsWith(".py"));
    if (hit) return path.join(dir, hit);
  }
  throw new SchemaMigrationError(
    `alembic revision succeeded but the created file could not be located.\nstdout: ${stdout}`
  );
}

/**
 * List ALL local head revisions (the leaves of the down_revision DAG). More
 * than one means sibling lineages were merged and need collapsing. DB-free:
 * `alembic heads` reads the local versions/ dir only.
 */
export async function listAlembicHeads(projectDir: string): Promise<string[]> {
  const { stdout } = await spawnAlembic(projectDir, ["heads"]);
  const heads: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]+)\b/);
    if (m) heads.push(m[1]);
  }
  return heads;
}

/**
 * Create a merge revision unifying all current heads (`alembic merge heads`).
 * DB-free (writes a file from the script template). Returns the created file's
 * absolute path.
 */
export async function mergeAlembicHeads(projectDir: string, message: string): Promise<string> {
  const { stdout } = await spawnAlembic(projectDir, ["merge", "-m", message, "heads"]);
  const m = stdout.match(/Generating\s+(\S+\.py)/);
  if (!m) {
    throw new SchemaMigrationError(`alembic merge heads created no file.\nstdout: ${stdout}`);
  }
  return m[1].trim();
}

/** Return the currently-applied head revision, or undefined when the DB has no Alembic state. */
async function getCurrentRevision(ctx: RunnerCtx): Promise<string | undefined> {
  const { stdout } = await runAlembic(ctx, ["current"]);
  const m = stdout.match(/^([a-f0-9]+)\b/m);
  return m ? m[1] : undefined;
}

/** Return the latest available revision in the local migrations directory. */
async function getHeadRevision(ctx: RunnerCtx): Promise<string | undefined> {
  const { stdout } = await runAlembic(ctx, ["heads"]);
  const m = stdout.match(/^([a-f0-9]+)\b/m);
  return m ? m[1] : undefined;
}

/**
 * Enumerate the revisions in `alembic history -r <range>`. Returns the
 * "->target, description" half of each line, newest-first as alembic
 * emits them.
 */
async function listHistory(ctx: RunnerCtx, range: string): Promise<AppliedSchemaMigration[]> {
  const { stdout } = await runAlembic(ctx, ["history", "-r", range]);
  const out: AppliedSchemaMigration[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^(?:<base>|[a-f0-9]+)\s*->\s*([a-f0-9]+)(?:\s*\(head\))?,\s*(.*)$/);
    if (m) out.push({ version: m[1].trim(), description: m[2].trim() });
  }
  return out;
}

export async function applyAlembic(ctx: RunnerCtx): Promise<ApplySchemaMigrationsResult> {
  const before = await getCurrentRevision(ctx);
  await runAlembic(ctx, ["upgrade", "head"]);
  const after = await getCurrentRevision(ctx);

  if (!after || before === after) {
    return { applied: [], alreadyAtLatest: true, tool: "alembic" };
  }

  // Range is inclusive on both ends. When `before` is undefined we walk
  // base..after and keep everything; otherwise we drop `before` itself
  // (it was already applied prior to this call).
  const range = before ? `${before}:${after}` : `base:${after}`;
  const inRange = await listHistory(ctx, range);
  const applied = before ? inRange.filter((a) => a.version !== before) : inRange;

  return { applied, alreadyAtLatest: false, tool: "alembic" };
}

export async function rollbackAlembic(
  ctx: RunnerCtx & { target: string }
): Promise<RollbackSchemaMigrationResult> {
  const before = await getCurrentRevision(ctx);
  if (!before) {
    // Nothing applied; nothing to roll back.
    await runAlembic(ctx, ["downgrade", ctx.target]);
    return { rolledBack: [], tool: "alembic" };
  }
  await runAlembic(ctx, ["downgrade", ctx.target]);
  const after = await getCurrentRevision(ctx);

  // What was rolled back: revisions reachable from `before` down to (but
  // not including) `after`. When `after` is undefined we walked all the
  // way back to base, so every revision in `base:before` was rolled back.
  const range = after ? `${after}:${before}` : `base:${before}`;
  const inRange = await listHistory(ctx, range);
  const rolledBack = after ? inRange.filter((a) => a.version !== after) : inRange;

  return { rolledBack, tool: "alembic" };
}

/**
 * Stamp the branch's alembic_version to `revision` WITHOUT running any migration
 * (the reconcile primitive for a db-ahead tier, FEIP-8050 Finding 21 GAP A).
 * `--purge` clears the alembic_version table first, so a PHANTOM current revision
 * (a rev id with no local file, the "Can't locate revision" state) does not block
 * the stamp. Pins the branch to a known-good revision so alembic can proceed.
 */
export async function stampAlembic(
  ctx: RunnerCtx & { revision: string }
): Promise<{ stamped: string; tool: "alembic" }> {
  await runAlembic(ctx, ["stamp", "--purge", ctx.revision]);
  return { stamped: ctx.revision, tool: "alembic" };
}

export async function statusAlembic(ctx: RunnerCtx): Promise<SchemaMigrationStatusResult> {
  const current = await getCurrentRevision(ctx);
  const head = await getHeadRevision(ctx);

  const pending: PendingSchemaMigration[] = [];
  if (head && head !== current) {
    const range = current ? `${current}:head` : `base:head`;
    const inRange = await listHistory(ctx, range);
    for (const rev of inRange) {
      if (current && rev.version === current) continue;
      pending.push({
        version: rev.version,
        filename: `${rev.version}_*.py`,
        description: rev.description,
      });
    }
  }

  return { current, pending, tool: "alembic" };
}
