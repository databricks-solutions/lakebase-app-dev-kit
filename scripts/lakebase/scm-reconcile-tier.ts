// Reconcile a shared TIER branch (staging / prod / dev) whose DB is AHEAD of code
// (FEIP-8050 Finding 21 GAP A).
//
// The beta.28 db-ahead-of-code recovery (claim --reset-stale-branch, scm-doctor
// --fix db-ahead-of-code) delete+recreates the claimed FEATURE branch. That is not
// viable for a shared, long-living TIER branch: you cannot delete staging. When an
// aborted build leaves a tier's Lakebase branch with a phantom alembic_version (a
// revision id with no local file) plus orphan tables the reset migrations created,
// a later promote/CI migrate fails "Can't locate revision" and there is no kit path
// to fix it, the operator hand-runs `DROP TABLE ...; alembic stamp`.
//
// reconcileTierBranch is that path as a first-class, DSN-pinned operation: probe the
// tier for db-ahead-of-code, drop the named orphan tables, and STAMP the branch to
// the code head (no migrations run), so alembic can proceed. It refuses on a branch
// that is NOT db-ahead (a stamp is destructive on a shared tier, never run it
// speculatively). Every DB touch pins the branch by its own {instance, branch} DSN,
// never the ambient .env branch.

import { getConnection } from "./get-connection.js";
import {
  branchRevisionOrphan,
  stampSchemaMigration,
  localCodeHead,
  type SchemaMigrationLanguage,
} from "./schema-migrate.js";

export interface ReconcileTierArgs {
  instance: string;
  /** The tier branch to reconcile (staging / prod / dev / a tier alias). */
  branch: string;
  projectDir: string;
  /** Revision to stamp to. Default: the local code head. */
  toRevision?: string;
  /** Orphan tables to DROP before stamping (named by the operator from the failure;
   *  never auto-detected, dropping a real table on a shared tier is unrecoverable). */
  dropTables?: string[];
  language?: SchemaMigrationLanguage;
}

export interface ReconcileTierResult {
  reconciled: boolean;
  /** The revision the branch was stamped to (present iff reconciled). */
  stampedTo?: string;
  /** Tables dropped (present iff reconciled). */
  droppedTables?: string[];
  /** The phantom revision the branch was stuck at (present iff reconciled). */
  wasOrphanedAt?: string;
  reason: string;
}

/** Injectable seams so the reconcile decision + orchestration is testable without a
 *  live DB. All default to the real primitives. */
export interface ReconcileTierDeps {
  probe?: (a: { instance: string; branch: string; projectDir?: string }) => Promise<string | null>;
  stamp?: (a: {
    instance: string;
    branch: string;
    revision: string;
    projectDir?: string;
    language?: SchemaMigrationLanguage;
  }) => Promise<{ stamped: string }>;
  dropTables?: (a: {
    instance: string;
    branch: string;
    projectDir: string;
    tables: string[];
  }) => Promise<string[]>;
}

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Default table-drop seam: DROP TABLE IF EXISTS "<t>" CASCADE over the tier's own
 *  DSN pool. Rejects any non-simple identifier (no schema-qualified / quoted names)
 *  so a malicious or fat-fingered name can never inject SQL on a shared tier. */
export async function dropBranchTables(a: {
  instance: string;
  branch: string;
  projectDir: string;
  tables: string[];
}): Promise<string[]> {
  for (const t of a.tables) {
    if (!SAFE_IDENT.test(t)) {
      throw new Error(`refusing to drop unsafe table identifier "${t}" (expected a simple [A-Za-z_][A-Za-z0-9_]* name)`);
    }
  }
  const pool = (await getConnection({ output: "pool", instance: a.instance, branch: a.branch })) as {
    query: (sql: string) => Promise<unknown>;
    end?: () => Promise<void>;
  };
  const dropped: string[] = [];
  try {
    for (const t of a.tables) {
      await pool.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
      dropped.push(t);
    }
  } finally {
    await pool.end?.();
  }
  return dropped;
}

/**
 * Reconcile a db-ahead tier branch: verify it IS ahead of code, drop the named
 * orphan tables, then stamp it to the code head. Refuses (reconciled=false, no
 * mutation) when the branch is not db-ahead, when no target head can be resolved,
 * or when tables are named but no drop seam is available.
 */
export async function reconcileTierBranch(
  args: ReconcileTierArgs,
  deps: ReconcileTierDeps = {},
): Promise<ReconcileTierResult> {
  const probe = deps.probe ?? branchRevisionOrphan;
  const stamp = deps.stamp ?? stampSchemaMigration;
  const drop = deps.dropTables ?? dropBranchTables;

  const orphan = await probe({ instance: args.instance, branch: args.branch, projectDir: args.projectDir });
  if (!orphan) {
    return {
      reconciled: false,
      reason: `${args.branch} is not ahead of code (no phantom revision); refusing to stamp a healthy tier`,
    };
  }

  const target = args.toRevision ?? localCodeHead(args.projectDir, args.language);
  if (!target) {
    return {
      reconciled: false,
      reason: `no local migrations found to derive a target head for ${args.branch}; pass an explicit --to-revision`,
    };
  }

  const dropped = args.dropTables?.length
    ? await drop({ instance: args.instance, branch: args.branch, projectDir: args.projectDir, tables: args.dropTables })
    : [];

  const r = await stamp({
    instance: args.instance,
    branch: args.branch,
    revision: target,
    projectDir: args.projectDir,
    language: args.language,
  });

  return {
    reconciled: true,
    stampedTo: r.stamped,
    droppedTables: dropped,
    wasOrphanedAt: orphan,
    reason:
      `reconciled ${args.branch}: was orphaned at ${orphan}; ` +
      `dropped [${dropped.join(", ") || "none"}]; stamped to ${r.stamped}`,
  };
}
