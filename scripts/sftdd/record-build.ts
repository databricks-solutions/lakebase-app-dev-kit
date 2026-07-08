// Record a story's BUILD turn by turn , the capture counterpart to the per-turn
// build replay. During a REAL (non-skipped) Navigator/Driver build, the driver
// calls recordBuildTurn AFTER each build turn's effect lands, snapshotting the
// experiment-branch working tree (the code that turn delivered) plus the cycle +
// experiment records as they stand. The result is a per-turn corpus the replay
// engine plays back event by event, so a replayed run reproduces every
// Navigator<->Driver interaction (RED, GREEN, review, refactor) instead of
// skipping to the Release Engineer. Mirrors recordedBuild's restore side; only
// the artifact CONTENT is captured, the events are re-driven live on replay.

import { existsSync, cpSync, mkdirSync } from "fs";
import { join } from "path";
import { featuresDir, cyclesRootDir, experimentsRootDir } from "./sftdd-paths.js";
import { codeTreeFilter } from "./replay-build.js";

export interface RecordBuildTurnArgs {
  /** The corpus root to write into (LAKEBASE_SFTDD_RECORD_BUILD_DIR). */
  recordBuildDir: string;
  /** The project working tree (the experiment branch is checked out). */
  projectDir: string;
  /** The project .tdd dir. */
  sftddDir: string;
  featureId: string;
  story: string;
  /** 1-based turn ordinal within this story's build (Navigator/Driver turns). */
  turn: number;
  /** The role that just acted: "navigator" | "driver". */
  role: string;
  /** The AC this turn targeted (per-AC review/refactor turns); omit for the kickoff. */
  ac?: string;
  /** review | refactor | kickoff , the build mode, for the turn slug. */
  mode?: string;
}

/** The directory slug for a turn, e.g. `003-driver-AC1-create-form-accessible` or
 *  `001-navigator`. Stable + ordered so the replay plays turns back in sequence. */
export function turnSlug(turn: number, role: string, ac?: string, mode?: string): string {
  const n = String(turn).padStart(3, "0");
  return [n, role, mode, ac].filter(Boolean).join("-");
}

/**
 * Snapshot one build turn into the corpus: the code tree (minus scaffold-owned
 * paths) + the current cycles + experiment records, under
 * `<corpus>/features/<F>/stories/<S>/turns/<NNN-role[-mode][-ac]>/`. Returns the
 * turn directory written.
 */
export function recordBuildTurn(args: RecordBuildTurnArgs): string {
  const { recordBuildDir, projectDir, sftddDir, featureId, story, turn, role, ac, mode } = args;
  const turnDir = join(
    featuresDir(recordBuildDir),
    featureId,
    "stories",
    story,
    "turns",
    turnSlug(turn, role, ac, mode),
  );
  mkdirSync(turnDir, { recursive: true });

  // 1. The code the build has produced so far (whole tree minus scaffold-owned).
  cpSync(projectDir, join(turnDir, "code"), {
    recursive: true,
    force: true,
    filter: codeTreeFilter(projectDir),
  });

  // 2. The cycle + experiment records as they stand at this turn (RED/GREEN
  //    timestamps, reviews, outcomes), so replay restores per-turn .tdd state too.
  const cyclesSrc = cyclesRootDir(sftddDir);
  if (existsSync(cyclesSrc)) cpSync(cyclesSrc, join(turnDir, "tdd", "cycles"), { recursive: true, force: true });
  const expSrc = experimentsRootDir(sftddDir);
  if (existsSync(expSrc)) cpSync(expSrc, join(turnDir, "tdd", "experiments"), { recursive: true, force: true });

  return turnDir;
}
