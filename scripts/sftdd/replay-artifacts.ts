// Replay a design-lane role's OUTPUT from a recorded-artifacts corpus instead
// of spawning the LLM agent , the engine behind the fast-forward smoke.
//
// The point (vs. pre-seeding everything and skipping): the deterministic driver
// still VISITS every stage as a real orchestrated turn (propose -> breakdown ->
// spec-author -> architect -> test-strategist -> ux-designer -> gate -> dispatch
// -> cut-experiment), logging + transitioning + running its deterministic
// effects (sync-breakdown, per-story test-list scope, gates). At each design
// turn, instead of paying for the model, the runner copies that turn's recorded
// output here ("pushes it out"). The Navigator + Driver are NEVER replayed (the
// runner only calls this for design-lane roles), so the real TDD begins exactly
// at the Navigator handoff , "stub the handoffs UNTIL we get to navigator."
//
// Faithfulness detail: the corpus holds FINAL artifacts, but each stage is gated
// by a different on-disk fact, so copying per-turn keeps the next stage's gate
// unmet until its own turn runs. The ONE overlap is acs/<AC>.json: its existence
// gates the Spec Author, its `layer` gates the Architect. So the Spec Author turn
// copies the ACs with `layer` STRIPPED, and the Architect turn re-copies them
// verbatim (the annotation). That makes both run as distinct turns.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from "fs";
import { join, dirname } from "path";
import { featuresDir, planningDir } from "./sftdd-paths.js";

export interface ReplayTurn {
  role: string;
  /** Sprint-mode for the Spec Author (propose / breakdown); absent for per-story turns. */
  mode?: string;
  /** Story id for per-story design turns (spec-author / architect / test-strategist). */
  story?: string;
}

export interface ReplayArgs {
  turn: ReplayTurn;
  /** The recorded-artifacts corpus root (LAKEBASE_TDD_REPLAY_DIR). */
  replayDir: string;
  /** The target project .tdd dir. */
  tddDir: string;
  featureId: string;
}

/** Roles whose turns may be replayed. The Navigator/Driver are NOT here: the
 *  real TDD cycle always runs. (product-owner author-requests is a Human Proxy
 *  step, not a claude turn, so it never reaches the replay path.) */
export const REPLAYABLE_DESIGN_ROLES = new Set([
  "spec-author",
  "architect-reviewer",
  "test-strategist",
  "ux-designer",
  "product-owner",
]);

function cp(src: string, dst: string): boolean {
  if (!existsSync(src)) return false;
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  return true;
}

/** Copy every file under srcDir into dstDir; optional transform on each file's
 *  text (used to strip `layer` from ACs on the Spec Author turn). */
function cpDir(srcDir: string, dstDir: string, transform?: (name: string, text: string) => string): boolean {
  if (!existsSync(srcDir)) return false;
  let copied = false;
  mkdirSync(dstDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    const s = join(srcDir, name);
    if (!statSync(s).isFile()) continue;
    const text = readFileSync(s, "utf8");
    writeFileSync(join(dstDir, name), transform ? transform(name, text) : text);
    copied = true;
  }
  return copied;
}

/** Strip the `layer` field from an AC json (so the Architect still has work). */
function stripLayer(name: string, text: string): string {
  if (!name.endsWith(".json")) return text;
  try {
    const ac = JSON.parse(text) as Record<string, unknown>;
    delete ac.layer;
    return JSON.stringify(ac, null, 2) + "\n";
  } catch {
    return text;
  }
}

/**
 * Replay the recorded output for one design-lane turn into the project .tdd.
 * Returns true iff the corpus had artifacts for this turn (so the caller skips
 * the real agent); false when the corpus lacks them (e.g. a story not in the
 * recording) so the caller falls back to spawning the real agent.
 */
export function replayDesignTurn(args: ReplayArgs): boolean {
  const { turn, replayDir, tddDir, featureId } = args;
  const cf = join(featuresDir(replayDir), featureId); // corpus feature dir
  const tf = join(featuresDir(tddDir), featureId); // target feature dir

  switch (turn.role) {
    case "spec-author": {
      if (turn.mode === "propose") {
        return cp(join(replayDir, "planning", "feature-proposals.md"), join(tddDir, "planning", "feature-proposals.md"));
      }
      if (turn.mode === "breakdown") {
        let ok = cp(join(cf, "feature-spec.json"), join(tf, "feature-spec.json"));
        cp(join(cf, "feature-spec.md"), join(tf, "feature-spec.md"));
        // Story stubs (story.{json,md}); NOT their acs (those are per-story turns).
        const storiesSrc = join(cf, "stories");
        if (existsSync(storiesSrc)) {
          for (const s of readdirSync(storiesSrc)) {
            cp(join(storiesSrc, s, "story.json"), join(tf, "stories", s, "story.json"));
            cp(join(storiesSrc, s, "story.md"), join(tf, "stories", s, "story.md"));
          }
        }
        return ok;
      }
      // Per-story Spec Author turn: the ACs, with `layer` stripped (the Architect
      // annotates layer on its own turn).
      if (turn.story) {
        return cpDir(join(cf, "stories", turn.story, "acs"), join(tf, "stories", turn.story, "acs"), stripLayer);
      }
      return false;
    }
    case "architect-reviewer": {
      // Feature architecture + the layer-annotated ACs (re-copied verbatim).
      let ok = cp(join(cf, "architecture.json"), join(tf, "architecture.json"));
      cp(join(cf, "architecture.md"), join(tf, "architecture.md"));
      if (turn.story) {
        const acs = cpDir(join(cf, "stories", turn.story, "acs"), join(tf, "stories", turn.story, "acs"));
        ok = ok || acs;
      }
      return ok;
    }
    case "test-strategist": {
      // Feature-level test list; the deterministic per-story scope (lakebase-sftdd-test-list)
      // runs as the orchestrator's own effect right after this turn.
      let ok = cp(join(cf, "test-list.json"), join(tf, "test-list.json"));
      cp(join(cf, "test-list.md"), join(tf, "test-list.md"));
      // Also bring the per-AC view if the corpus has it.
      const story = turn.story;
      if (story) {
        cp(join(cf, "stories", story, "test-list-per-ac.json"), join(tf, "stories", story, "test-list-per-ac.json"));
      }
      return ok;
    }
    case "ux-designer": {
      let ok = cp(join(replayDir, "design", "design-guide.json"), join(tddDir, "design", "design-guide.json"));
      cp(join(replayDir, "design", "design-guide.md"), join(tddDir, "design", "design-guide.md"));
      cp(join(replayDir, "design", "ia.md"), join(tddDir, "design", "ia.md"));
      return ok;
    }
    default:
      return false;
  }
}
