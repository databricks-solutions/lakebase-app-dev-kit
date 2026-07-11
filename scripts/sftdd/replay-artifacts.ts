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
// unmet until its own turn runs. The Spec Author turn copies each AC VERBATIM
// (the spec author really does author `layer`); the Architect turn re-copies them
// verbatim (idempotent) and adds architecture.json. The design probe dispatches or
// skips the Architect on ITS OWN products (architectural_notes + architecture.json
// existence + the project canon), NOT on whether the ACs carry `layer` , so the
// Spec Author must NOT strip `layer`. Stripping it (an earlier hack to give the
// Architect "work") permanently drops the field for a cleanly-mapping story whose
// notes are PROJECTED from the canon with no Architect turn to restore it, failing
// the feature-end conformance gate.

import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from "fs";
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
  /** The recorded-artifacts corpus root (LAKEBASE_SFTDD_REPLAY_DIR). */
  replayDir: string;
  /** The target project .tdd dir. */
  sftddDir: string;
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

/** Copy every file under srcDir into dstDir (verbatim). */
function cpDir(srcDir: string, dstDir: string): boolean {
  if (!existsSync(srcDir)) return false;
  let copied = false;
  mkdirSync(dstDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    const s = join(srcDir, name);
    if (!statSync(s).isFile()) continue;
    copyFileSync(s, join(dstDir, name));
    copied = true;
  }
  return copied;
}

/**
 * Replay the recorded output for one design-lane turn into the project .tdd.
 * Returns true iff the corpus had artifacts for this turn (so the caller skips
 * the real agent); false when the corpus lacks them (e.g. a story not in the
 * recording) so the caller falls back to spawning the real agent.
 */
export function replayDesignTurn(args: ReplayArgs): boolean {
  const { turn, replayDir, sftddDir, featureId } = args;
  const cf = join(featuresDir(replayDir), featureId); // corpus feature dir
  const tf = join(featuresDir(sftddDir), featureId); // target feature dir

  switch (turn.role) {
    case "spec-author": {
      if (turn.mode === "propose") {
        return cp(join(replayDir, "planning", "feature-proposals.md"), join(sftddDir, "planning", "feature-proposals.md"));
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
      // Per-story Spec Author turn: the ACs, verbatim (the spec author authors
      // `layer`; the Architect , when dispatched , re-copies them idempotently).
      if (turn.story) {
        return cpDir(join(cf, "stories", turn.story, "acs"), join(tf, "stories", turn.story, "acs"));
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
      let ok = cp(join(replayDir, "design", "design-guide.json"), join(sftddDir, "design", "design-guide.json"));
      cp(join(replayDir, "design", "design-guide.md"), join(sftddDir, "design", "design-guide.md"));
      cp(join(replayDir, "design", "ia.md"), join(sftddDir, "design", "ia.md"));
      return ok;
    }
    default:
      return false;
  }
}

/**
 * Restore a recorded reflect turn's verdict (reflect-verdict.json) from the design
 * corpus. The reflect turn is a NAVIGATOR turn, so the build-replay path restores
 * its code snapshot and keeps the per-story turn-index aligned, but its real output
 * is a DESIGN artifact under .sftdd/features/<F>/stories/<S>/reflect-verdict.json
 * that the code-only build restore filters out (it skips .sftdd). Bring it back so
 * the drive's reflect-verdict expectation is satisfied on replay (else the handoff
 * guard aborts on the "missing" verdict). Returns true iff the corpus had it.
 */
export function restoreReflectVerdict(args: {
  replayDir: string;
  sftddDir: string;
  featureId: string;
  story: string;
}): boolean {
  const { replayDir, sftddDir, featureId, story } = args;
  return cp(
    join(featuresDir(replayDir), featureId, "stories", story, "reflect-verdict.json"),
    join(featuresDir(sftddDir), featureId, "stories", story, "reflect-verdict.json"),
  );
}
