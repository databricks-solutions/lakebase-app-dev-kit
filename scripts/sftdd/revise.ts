// The revise SELF-HEAL, a deterministic state-machine transition.
//
// When a SPEC-level blocking smell still has its one-revise-per-(smell,story)
// budget, the driver (orchestrator-drive `revise-route`) sends the story back to
// its owning author and resumes , instead of hard-halting to the HIL. That
// circle-back is a pure workflow transition over pipeline.json + the design
// artifacts, so it lives here in the state-machine layer, NOT in the smoke-only
// Human Proxy. The Human Proxy (or a real human) only makes the yes/no gate
// decision; the transition it triggers is this.
//
// The transition: (1) record the PO's `revise` choice as a gate event (auditable
// as a self-heal, not an invisible auto-edit), (2) reset the story to `designing`
// via reviseStory (discard the experiment, reopen the gate, free the lane), (3)
// STALE the owning author's artifact + deliver the verdict as a smell-aware
// hand-back brief so the author actually RE-AUTHORS (without this the design lane
// re-approves the identical artifact and the same smell re-fires , the revise
// heals nothing), and (4) resolve the smell as `revised`, spending the budget so
// a second escape of the SAME smell on the SAME story hard-halts.

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { emitAgentLogEvent } from "./agent-log.js";
import {
  featureTestListJson,
  storyTestListJson,
  acsDir,
  handbackFile,
  storyAcIds,
  resolveTddDir,
} from "./sftdd-paths.js";
import { readPipeline, writePipeline, reviseStory } from "./story-pipeline.js";
import { markSmellResolved, composeReviseBrief } from "./smells.js";

/** Default author identity recorded on a headless self-heal. A real interactive
 *  decision passes the human's identity through `approver`. */
export const REVISE_APPROVER = "human-proxy";

/**
 * Stale the owning author's artifact for a story so the design lane RE-INVOKES
 * that author on a revise (the teeth that make revise non-hollow). Always clears
 * the story's test list (remove its items from the master test-list.json + delete
 * the per-story view) so testListReady reads false and the test-strategist
 * re-runs. A `spec`-gate revise also clears the story's ACs (a re-decomposition)
 * so hasAcs reads false and the spec-author re-drafts.
 */
export function staleStoryArtifactsForRevise(
  tddDir: string,
  featureId: string,
  story: string,
  gate: "spec" | "test_list" | "architecture",
): void {
  const acIds = new Set(storyAcIds(tddDir, featureId, story));
  const master = featureTestListJson(tddDir, featureId);
  if (existsSync(master)) {
    try {
      const data = JSON.parse(readFileSync(master, "utf8")) as { items?: Array<{ ac_id?: string }> };
      if (Array.isArray(data.items)) {
        data.items = data.items.filter((it) => !it.ac_id || !acIds.has(it.ac_id));
        writeFileSync(master, JSON.stringify(data, null, 2) + "\n");
      }
    } catch {
      // Leave the master as-is on a parse error; deleting the per-story view
      // below still forces a re-run.
    }
  }
  const perStory = storyTestListJson(tddDir, featureId, story);
  if (existsSync(perStory)) rmSync(perStory, { force: true });

  if (gate === "spec") {
    const dir = acsDir(tddDir, featureId, story);
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (f.endsWith(".json") || f.endsWith(".md")) rmSync(join(dir, f), { force: true });
      }
    }
  } else if (gate === "architecture") {
    // Clear each AC's architectural_notes so architectAnnotated reads false and
    // the design lane re-dispatches the ARCHITECT (who re-annotates + amends the
    // canon). The ACs themselves stay (this is not a re-decomposition); only the
    // architect's product is staled. Projection is separately disabled for this
    // story after a revise (architectProjectable checks priorReviseCount), so the
    // architect runs live rather than re-projecting the same gap.
    const dir = acsDir(tddDir, featureId, story);
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".json")) continue;
        const p = join(dir, f);
        try {
          const ac = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
          if ("architectural_notes" in ac) {
            delete ac.architectural_notes;
            writeFileSync(p, JSON.stringify(ac, null, 2) + "\n");
          }
        } catch {
          // Leave an unparseable AC as-is; the architect turn will surface it.
        }
      }
    }
  }
}

export interface ReviseSelfHealArgs {
  featureId: string;
  /** The story to send back to its owning author + resume. */
  story: string;
  /** The blocking smell being resolved (e.g. reflect-testlist-defect, ac-overlap). */
  smell: string;
  /** The owning author the verdict routes to. */
  routedTo: "spec-author" | "test-strategist" | "architect-reviewer";
  /** The gate to re-open + re-run (Gate 1 spec / Gate 2 architecture / Gate 3
   *  test_list). */
  gate: "spec" | "test_list" | "architecture";
  /** The verdict (the smell's detail): the author's brief on resume. */
  reason: string;
  /** The deciding identity (a real human, or the headless proxy). */
  approver?: string;
  tddDir?: string;
}

export interface ReviseSelfHealResult {
  decided: "revise";
  story: string;
  routedTo: string;
  /** True iff an open matching smell was found + marked resolved. */
  resolvedSmell: boolean;
}

/**
 * Apply the revise self-heal transition (see module header). The driver only
 * emits this AFTER the pure transition already decided the escalation was
 * routable (budget not yet spent), so it always spends from 0 -> 1.
 */
export function applyReviseSelfHeal(args: ReviseSelfHealArgs): ReviseSelfHealResult {
  const tddDir = args.tddDir ?? resolveTddDir();
  const approver = args.approver ?? REVISE_APPROVER;
  const at = new Date().toISOString();

  // 1. Record the PO's revise decision (the human's choice) as a gate event.
  try {
    emitAgentLogEvent(
      {
        role: "product-owner",
        level: "info",
        event: "gate.modified",
        feature_id: args.featureId,
        slots: {
          gate: args.gate,
          decision: "revise",
          routed_to: args.routedTo,
          smell: args.smell,
          story: args.story,
          verdict: args.reason,
          approver,
        },
      },
      { tddDir },
    );
  } catch {
    // Logging is observability, never block the heal.
  }

  // 2. Reset the story to designing (discard experiment + reopen gate + free lane).
  const pipeline = readPipeline(tddDir, args.featureId);
  reviseStory(pipeline, args.story, { approver, at, reason: args.reason });
  writePipeline(tddDir, pipeline);

  // 2b. Force the owning author to actually RE-AUTHOR: stale its artifact so the
  // design lane re-invokes it, and deliver the verdict as a smell-aware hand-back
  // brief (composeReviseBrief FORCES missing coverage for a reflect defect, keeps
  // the open-question escape only for the redundancy case).
  staleStoryArtifactsForRevise(tddDir, args.featureId, args.story, args.gate);
  try {
    const hb = handbackFile(tddDir, args.featureId, args.routedTo, args.story);
    mkdirSync(dirname(hb), { recursive: true });
    writeFileSync(hb, composeReviseBrief({ smell: args.smell, gate: args.gate, reason: args.reason }));
  } catch {
    // The brief is best-effort observability; never block the heal.
  }

  // 3. Resolve the smell as `revised` (spends the budget; a re-fire is a hard halt).
  const resolvedSmell = markSmellResolved(tddDir, args.smell, {
    story_id: args.story,
    kind: "revised",
    note: `revised by ${approver}: routed to ${args.routedTo} (${args.gate} gate)`,
  });

  return { decided: "revise", story: args.story, routedTo: args.routedTo, resolvedSmell };
}
