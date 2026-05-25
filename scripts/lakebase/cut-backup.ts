// Snapshot a Lakebase branch for rollback safety (FEIP-7096).
//
// Used in the release-sprint flow's "cut prod-backup" phase before
// migrating production. Wraps `createBranch` with an opinionated
// intent signal ("this is a backup snapshot, not new work") and a
// returned BackupRef that downstream rollback tooling can use to
// repoint production at the backup branch in a single step.

import { createBranch } from "./branch-create.js";
import type { LakebaseBranchInfo, BranchLookupOpts } from "./branch-utils.js";

export interface CutBackupArgs extends BranchLookupOpts {
  /**
   * Branch to snapshot. For the release flow this is the current prod
   * branch (e.g. "production"). The snapshot is forked off this branch
   * at the moment of the call.
   */
  sourceBranch: string;
  /**
   * Name for the new backup branch. Should encode the release / run
   * identifier so rollback knows which backup to restore (e.g.
   * "prod-backup-v1.2.3" or "pre-migrate-pr-42"). The substrate does
   * not enforce a naming pattern - it is documented in the
   * lakebase-release-workflows skill.
   */
  backupName: string;
  /** Wait-for-READY budget. Passed through to createBranch. */
  readyTimeoutMs?: number;
  /** Poll interval. Passed through to createBranch. */
  pollIntervalMs?: number;
}

export interface CutBackupResult {
  /** The created backup branch. */
  backup: LakebaseBranchInfo;
  /** The source branch's full resource name (echoed for caller convenience). */
  sourceBranchName: string;
}

/**
 * Snapshot a Lakebase branch by creating a new branch forked off it.
 *
 * Idempotent on retry: if a branch with `backupName` already exists AND
 * was forked from `sourceBranch`, returns the existing branch. If it
 * was forked from a different source, throws (delegated to createBranch's
 * lineage-conflict check) - silently returning a wrongly-rooted backup
 * would defeat the rollback contract.
 */
export async function cutBackup(args: CutBackupArgs): Promise<CutBackupResult> {
  const backup = await createBranch({
    instance: args.instance,
    host: args.host,
    branch: args.backupName,
    parentBranch: args.sourceBranch,
    readyTimeoutMs: args.readyTimeoutMs,
    pollIntervalMs: args.pollIntervalMs,
    // Backups must outlive any ephemeral-branch expiration so the
    // rollback contract holds: if Lakebase auto-expired a backup
    // before the operator decided to roll back, the release flow
    // would have nothing to restore to.
    noExpiry: true,
  });
  return {
    backup,
    sourceBranchName: backup.sourceBranchName ?? "",
  };
}
