// archiveExperiment lifecycle primitive (FEIP-7214). Atomically moves a
// losing experiment's dir under _archive/, marks outcomes.json as
// abandoned, optionally tears down its Lakebase branch + Databricks
// Apps deployment via callbacks, and appends a selection-log entry.
//
// HITL-gated: refuses to run without hitlApproved=true so the orchestrator
// can't archive without a recorded human decision. Mirrors the gate
// pattern from promoteExperiment.
//
// Rollback: if a teardown callback fails after the dir+outcomes markers
// were applied, both are reverted to their pre-archive state and the
// selection-log records the partial-archive outcome.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { experimentDir, experimentsRoot, listExperiments, readOutcomes, writeOutcomes } from "./experiment.js";

export class ArchiveExperimentError extends Error {
  constructor(
    message: string,
    public readonly partial: boolean = false
  ) {
    super(message);
    this.name = "ArchiveExperimentError";
  }
}

export interface ArchiveExperimentArgs {
  tddDir: string;
  featureId: string;
  storyId: string;
  experimentSlug: string;
  /**
   * Required. Refuses to run without explicit human approval; same
   * pattern as promoteExperiment. The token shape is intentionally
   * simple (boolean): the orchestrator's job is to gate on the actual
   * HITL prompt; this enforces the boundary check.
   */
  hitlApproved: boolean;
  /** Recorded in selection-log when provided. */
  approverEmail?: string;
  /**
   * Optional Lakebase branch teardown callback. Receives the
   * experiment's branch_id. Throw to surface the failure to the
   * primitive's rollback handler. When omitted, the Lakebase branch is
   * left in place and the result flags lakebase_branch_deleted: false.
   */
  deleteLakebaseBranch?: (branchId: string) => Promise<void>;
  /**
   * Optional Databricks Apps deployment teardown callback. Receives
   * the experiment slug (same convention as the deploy-apps substrate).
   * Throw to surface the failure. When omitted, the deployment is left
   * in place and the result flags app_deployment_deleted: false.
   */
  deleteAppDeployment?: (experimentSlug: string) => Promise<void>;
}

export interface ArchiveExperimentResult {
  experiment_slug: string;
  /** Absolute path of the archived dir on disk. */
  archived_dir: string;
  /** True iff deleteLakebaseBranch was provided AND succeeded. */
  lakebase_branch_deleted: boolean;
  /** True iff deleteAppDeployment was provided AND succeeded. */
  app_deployment_deleted: boolean;
  /** The selection-log markdown body that was appended. */
  selection_log_entry: string;
}

function selectionLogPath(tddDir: string): string {
  return join(tddDir, "selection-log.md");
}

function appendSelectionLog(tddDir: string, entry: string): void {
  const path = selectionLogPath(tddDir);
  if (existsSync(path)) {
    writeFileSync(path, readFileSync(path, "utf8") + entry);
  } else {
    writeFileSync(path, entry);
  }
}

/**
 * Archive a losing experiment. Atomic: either every step succeeds and
 * the experiment is fully archived, or the dir + outcomes are rolled
 * back and the failure is recorded in selection-log.
 *
 * Order of operations (matters for rollback):
 *   1. Read prior outcomes (snapshot for rollback)
 *   2. Mark outcomes status="abandoned"
 *   3. Move dir from experiments/<F>/<slug>/ to experiments/<F>/_archive/<slug>/
 *   4. Try deleteLakebaseBranch (best effort if callback omitted)
 *   5. Try deleteAppDeployment (best effort if callback omitted)
 *   6. On any callback throw: revert steps 2-3, append partial-archive
 *      entry, throw ArchiveExperimentError with partial: true.
 *   7. On full success: append archived entry, return result.
 */
export async function archiveExperiment(
  args: ArchiveExperimentArgs
): Promise<ArchiveExperimentResult> {
  if (!args.hitlApproved) {
    throw new ArchiveExperimentError(
      "archiveExperiment requires hitlApproved: true (HITL Gate)"
    );
  }
  const { tddDir, featureId, storyId, experimentSlug, approverEmail } = args;

  const ts = new Date().toISOString();
  const archiveBase = join(experimentsRoot(tddDir, featureId, storyId), "_archive");
  mkdirSync(archiveBase, { recursive: true });
  const dest = join(archiveBase, experimentSlug);
  const liveDir = experimentDir(tddDir, featureId, storyId, experimentSlug);

  // Idempotent re-run: if it's already archived and the live dir is gone,
  // record a log entry and return without trying to look up the experiment
  // (listExperiments only sees live dirs, so the lookup would fail).
  if (existsSync(dest) && !existsSync(liveDir)) {
    const entry =
      [
        "",
        `## ${ts} – Archive ${experimentSlug} for ${featureId} (idempotent re-run)`,
        `- **Already archived at:** ${dest}`,
        "",
      ].join("\n") + "\n";
    appendSelectionLog(tddDir, entry);
    return {
      experiment_slug: experimentSlug,
      archived_dir: dest,
      lakebase_branch_deleted: false,
      app_deployment_deleted: false,
      selection_log_entry: entry,
    };
  }

  // Resolve the live experiment to archive
  const experiments = listExperiments(tddDir, featureId, storyId);
  const target = experiments.find((e) => e.experiment_slug === experimentSlug);
  if (!target) {
    throw new ArchiveExperimentError(
      `Experiment ${experimentSlug} not found under ${featureId}/${storyId}`
    );
  }

  // 1. Snapshot prior outcomes for rollback
  const priorOutcomes = readOutcomes(tddDir, featureId, storyId, experimentSlug);

  // 2. Mark outcomes abandoned
  writeOutcomes(tddDir, featureId, storyId, experimentSlug, {
    ...(priorOutcomes ?? {}),
    status: "abandoned",
  });

  // 3. Move dir
  renameSync(target.dir, dest);

  // 4+5. Try teardown callbacks; track success per side
  let lakebaseDeleted = false;
  let appDeleted = false;
  let teardownError: Error | undefined;

  if (args.deleteLakebaseBranch) {
    try {
      await args.deleteLakebaseBranch(target.branch_id);
      lakebaseDeleted = true;
    } catch (err) {
      teardownError = err as Error;
    }
  }
  if (!teardownError && args.deleteAppDeployment) {
    try {
      await args.deleteAppDeployment(experimentSlug);
      appDeleted = true;
    } catch (err) {
      teardownError = err as Error;
    }
  }

  // 6. Rollback on teardown failure
  if (teardownError) {
    // Revert dir move
    try {
      renameSync(dest, target.dir);
    } catch {
      // Couldn't move back; record but continue with rollback of outcomes
    }
    // Revert outcomes
    if (priorOutcomes) {
      writeOutcomes(tddDir, featureId, storyId, experimentSlug, priorOutcomes);
    }
    const entry =
      [
        "",
        `## ${ts} – Archive ${experimentSlug} for ${featureId} (PARTIAL / rolled back)`,
        `- **Reason:** teardown callback failed: ${teardownError.message}`,
        `- **Lakebase branch deleted:** ${lakebaseDeleted}`,
        `- **App deployment deleted:** ${appDeleted}`,
        `- **Dir + outcomes:** restored to pre-archive state`,
        `- **Approver:** ${approverEmail ?? "HITL (no email recorded)"}`,
        "",
      ].join("\n") + "\n";
    appendSelectionLog(tddDir, entry);
    throw new ArchiveExperimentError(
      `Teardown failed mid-archive (${teardownError.message}); dir + outcomes rolled back. See selection-log.md.`,
      true
    );
  }

  // 7. Full success
  const entry =
    [
      "",
      `## ${ts} – Archive ${experimentSlug} for ${featureId}`,
      `- **Archived dir:** ${dest}`,
      `- **Lakebase branch deleted:** ${lakebaseDeleted}${args.deleteLakebaseBranch ? "" : " (no callback)"}`,
      `- **App deployment deleted:** ${appDeleted}${args.deleteAppDeployment ? "" : " (no callback)"}`,
      `- **Approver:** ${approverEmail ?? "HITL (no email recorded)"}`,
      "",
    ].join("\n") + "\n";
  appendSelectionLog(tddDir, entry);

  return {
    experiment_slug: experimentSlug,
    archived_dir: dest,
    lakebase_branch_deleted: lakebaseDeleted,
    app_deployment_deleted: appDeleted,
    selection_log_entry: entry,
  };
}
