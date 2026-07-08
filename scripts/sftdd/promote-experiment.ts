import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { listExperiments, readOutcomes, writeOutcomes } from "./experiment";
import { readFeature, writeFeature } from "./spec-sync";
import { archiveExperiment } from "./archive-experiment";

export interface PromoteArgs {
  sftddDir: string;
  featureId: string;
  storyId: string;
  winnerSlug: string;
  /** Set to true to record the HITL approval. Refuses to run without it. */
  hitlApproved: boolean;
  approverEmail?: string;
  /**
   * Forwarded to archiveExperiment for each loser. When omitted, the
   * loser's Lakebase branch is left in place (dir + outcomes marker
   * still get applied). callers that want full branch
   * teardown wire this; promote stays pure-substrate when the callback
   * is absent.
   */
  deleteLakebaseBranch?: (branchId: string) => Promise<void>;
  /**
   * Forwarded to archiveExperiment for each loser. Same contract as
   * deleteLakebaseBranch.
   */
  deleteAppDeployment?: (experimentSlug: string) => Promise<void>;
}

export interface PromoteResult {
  winner_slug: string;
  archived_slugs: string[];
  feature_status: string;
}

/**
 * Promote one experiment as the feature's chosen outcome.
 *
 * Side effects:
 *  - Updates winner outcomes: status="succeeded".
 *  - Updates loser outcomes: status="abandoned".
 *  - Moves loser dirs under .tdd/experiments/<F>/_archive/.
 *  - Transitions feature-spec.json status to "ready-for-review".
 *  - Appends a record to .tdd/selection-log.md.
 *
 * This is HITL-gated: callers must set hitlApproved=true. The function refuses
 * to run otherwise so the orchestrator cannot promote without a recorded
 * human decision.
 */
export async function promoteExperiment(args: PromoteArgs): Promise<PromoteResult> {
  if (!args.hitlApproved) {
    throw new Error("promoteExperiment requires hitlApproved: true (HITL Gate)");
  }
  const { sftddDir, featureId, storyId, winnerSlug, approverEmail } = args;
  const experiments = listExperiments(sftddDir, featureId, storyId);
  const winner = experiments.find((e) => e.experiment_slug === winnerSlug);
  if (!winner) {
    throw new Error(`winner ${winnerSlug} not found among experiments for ${featureId}/${storyId}`);
  }
  const losers = experiments.filter((e) => e.experiment_slug !== winnerSlug);

  // Mark winner succeeded
  const winnerOutcome = readOutcomes(sftddDir, featureId, storyId, winnerSlug);
  writeOutcomes(sftddDir, featureId, storyId, winnerSlug, { ...(winnerOutcome ?? {}), status: "succeeded" });

  // Archive each loser via the lifecycle primitive. Each
  // archive is atomic + HITL-gated; promote inherits the HITL approval
  // for the whole flow by passing hitlApproved: true to each call.
  const archivedSlugs: string[] = [];
  for (const loser of losers) {
    await archiveExperiment({
      sftddDir,
      featureId,
      storyId,
      experimentSlug: loser.experiment_slug,
      hitlApproved: true,
      approverEmail,
      deleteLakebaseBranch: args.deleteLakebaseBranch,
      deleteAppDeployment: args.deleteAppDeployment,
    });
    archivedSlugs.push(loser.experiment_slug);
  }

  // Feature → ready-for-review
  try {
    const feature = readFeature(sftddDir, featureId);
    feature.status = "ready-for-review";
    writeFeature(sftddDir, feature);
  } catch {
    // No feature-spec.json – caller's responsibility. Don't block promotion.
  }

  // Append a single "Promote" entry to selection log on top of the
  // per-loser "Archive" entries archiveExperiment writes.
  const logPath = join(sftddDir, "selection-log.md");
  const ts = new Date().toISOString();
  const lines = [
    "",
    `## ${ts} – Promote ${winnerSlug} for ${featureId}`,
    `- **Winner:** ${winnerSlug} (branch ${winner.branch_id})`,
    losers.length > 0
      ? `- **Archived (see entries above):** ${losers.map((l) => l.experiment_slug).join(", ")}`
      : `- **Archived:** none (no parallel experiments)`,
    `- **Approved by:** ${approverEmail ?? "HITL (no email recorded)"}`,
    "",
  ];
  if (existsSync(logPath)) {
    writeFileSync(logPath, readFileSync(logPath, "utf8") + lines.join("\n"));
  } else {
    writeFileSync(logPath, lines.join("\n"));
  }

  return {
    winner_slug: winnerSlug,
    archived_slugs: archivedSlugs,
    feature_status: "ready-for-review",
  };
}
