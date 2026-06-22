// Replay a story's BUILD turn by turn from a recorded-build corpus , the engine
// behind run-to-release-engineer. It is the build-stage analog of
// replay-artifacts.ts (which replays each DESIGN role turn): instead of one
// monolithic "skip to the release engineer", the deterministic driver VISITS
// every Navigator/Driver turn and, instead of spawning the model, overlays that
// turn's recorded artifact (the code it would have written, plus its cycle +
// experiment records). Only the artifact DELIVERY is mocked , the events run
// live: the experiment branch is cut from the feature branch for real, the
// cycle-record CLIs stamp RED/GREEN against the overlaid code, reviews + refactors
// drive off the overlaid verdicts. So the log shows every Navigator<->Driver
// interaction and the substrate ends up in the exact state a real build leaves.
//
// CORPUS SHAPE (per-turn): recorded-build/features/<F>/stories/<S>/turns/<NNN-...>/
// each holding code/ (the working tree at that turn, scaffold + junk filtered) +
// tdd/{cycles,experiments}. Turns are ordinal-keyed; the Kth Navigator/Driver
// turn of a deterministic drive maps to the Kth recorded turn dir (sorted).

import { existsSync, cpSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { featuresDir, cyclesRootDir } from "./sftdd-paths.js";

/** Project paths the scaffold owns , never overwrite them from the snapshot, or
 *  the fresh run's kit resolver / pin / hooks break (on replay), and never
 *  capture them into a snapshot (on record) , they are scaffold, not build output.
 *  Matched on the first path segment relative to the code root. */
export const SCAFFOLD_OWNED = new Set([
  ".git", ".sftdd", ".tdd", ".lakebase", "scripts", ".claude", ".github", "node_modules",
]);

/** Runtime/build junk that must never enter a snapshot or overlay, matched at ANY
 *  path depth (e.g. app/__pycache__): virtualenvs, caches, vcs, deps. */
const JUNK_DIRS = new Set([
  ".venv", "venv", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".git", "node_modules",
]);
/** Files to never capture/overlay: secrets + OS cruft, plus scaffold-owned root
 *  config the build never authors , the corpus must not clobber the fresh
 *  scaffold's copy (e.g. Makefile/deploy-targets.yaml carry the run command; a
 *  stale `--reload` copy would re-break the deploy teardown). (.env.example IS kept.) */
const JUNK_FILES = new Set([".env", ".DS_Store", "Makefile", "deploy-targets.yaml"]);

/** A cpSync filter that copies a code tree under `root` while skipping (a) the
 *  scaffold-owned top-level dirs (replay must not clobber the fresh scaffold's
 *  kit resolver/pin/hooks), (b) runtime/build junk at any depth, and (c) secrets.
 *  Shared by replay (overlay) + record (snapshot) so both stay clean. */
export function codeTreeFilter(root: string): (src: string) => boolean {
  return (src: string) => {
    const rel = src.slice(root.length).replace(/^[/\\]+/, "");
    if (rel === "") return true;
    const segs = rel.split(/[/\\]/);
    if (SCAFFOLD_OWNED.has(segs[0])) return false;
    if (segs.some((s) => JUNK_DIRS.has(s))) return false;
    const base = segs[segs.length - 1];
    return !(JUNK_FILES.has(base) || base.endsWith(".pyc"));
  };
}

/** The story's per-turn corpus dir (…/stories/<S>/turns). */
export function storyTurnsDir(replayBuildDir: string, featureId: string, story: string): string {
  return join(featuresDir(replayBuildDir), featureId, "stories", story, "turns");
}

/** Ordered turn dir names for a story (001-…, 002-…), or [] when uncovered. */
export function listBuildTurns(replayBuildDir: string, featureId: string, story: string): string[] {
  const dir = storyTurnsDir(replayBuildDir, featureId, story);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => !n.startsWith(".")).sort();
}

export interface ReplayBuildTurnArgs {
  /** The recorded-build corpus root (LAKEBASE_TDD_REPLAY_BUILD_DIR). */
  replayBuildDir: string;
  /** The target project working tree (the experiment branch is checked out). */
  projectDir: string;
  /** The target project .tdd dir. */
  tddDir: string;
  featureId: string;
  story: string;
  /** 1-based ordinal of THIS Navigator/Driver turn within the story's build. */
  turnIndex: number;
}

/**
 * Replay one build turn: overlay the turnIndex-th recorded turn's CODE onto the
 * project, in place of spawning the Navigator/Driver. Returns false (a miss) when
 * the corpus lacks this story OR has fewer turns than turnIndex, so the caller
 * falls back to the live model for that turn.
 *
 * Delivers the turn's CODE (the LLM's output) plus, for a REVIEW turn, the
 * Navigator's `review-verdict.json` (its actual artifact: refactor true/false).
 * The verdict is what drives the refactor turns , without it, the live review CLI
 * defaults to "looks good", the Driver never refactors, and the tree freezes at
 * the pre-refactor state instead of the corpus's FINAL state. We deliver ONLY
 * review-verdict.json from .tdd, NEVER the timestamped cycle-NNN.json (overlaying
 * those corrupts the live cycle state machine , mis-sequenced RED/GREEN). So the
 * LIVE substrate still owns RED/GREEN + the experiment branch; we mock only the
 * two artifacts a turn actually produces (code, and the review verdict).
 */
export function replayBuildTurn(args: ReplayBuildTurnArgs): boolean {
  const { replayBuildDir, projectDir, tddDir, featureId, story, turnIndex } = args;
  const turns = listBuildTurns(replayBuildDir, featureId, story);
  if (turnIndex < 1 || turnIndex > turns.length) return false; // uncovered -> live
  const turnDir = join(storyTurnsDir(replayBuildDir, featureId, story), turns[turnIndex - 1]);

  const codeSrc = join(turnDir, "code");
  if (!existsSync(codeSrc)) return false;
  cpSync(codeSrc, projectDir, { recursive: true, force: true, filter: codeTreeFilter(codeSrc) });

  // Deliver the Navigator's review verdicts (refactor decisions) so the live
  // review drives the recorded refactor turns. ONLY review-verdict.json , the
  // live cycle-record CLIs own everything else in .tdd (RED/GREEN, review.json).
  const cyclesSrc = join(turnDir, "tdd", "cycles");
  if (existsSync(cyclesSrc)) {
    cpSync(cyclesSrc, cyclesRootDir(tddDir), {
      recursive: true,
      force: true,
      filter: (src) => statSync(src).isDirectory() || src.endsWith("review-verdict.json"),
    });
  }
  return true;
}
