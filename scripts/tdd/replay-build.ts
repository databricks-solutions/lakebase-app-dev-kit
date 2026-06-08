// Replay a story's BUILD from a recorded-build corpus instead of running the
// live Navigator/Driver loop , the engine behind "fast-forward to the Release
// Engineer". It is the build-stage analog of replay-artifacts.ts (which stubs
// the DESIGN stages "until the navigator"); this stubs the BUILD stage "until
// the release engineer".
//
// HOW IT FITS: in a fast-forward-to-release run, the deterministic driver still
// VISITS every stage. Design turns replay via replayDesignTurn; then, right
// AFTER cut-experiment (the experiment branch is freshly checked out), this
// restores the recorded build , the whole code tree the Driver produced + the
// GREEN, reviewed cycle records + the experiment outcomes. The next readState
// then sees the story as testsWritten + codeWritten (all cycles green) with no
// review/refactor pending, so nextBuildAction skips straight to await-acceptance
// , i.e. the (now deterministic) Release Engineer deploy + the PO gate. The
// Navigator/Driver are never spawned for a story the build corpus covers.
//
// FAITHFULNESS: experimentBranchName(story) is deterministic, so a recorded
// cycle's branch_id (e.g. experiment-s1-create-bug-exp1) matches the freshly-cut
// branch on a new run , the recorded green cycles line up. The code tree is
// overlaid EXCLUDING scaffold-owned paths (scripts/, .lakebase/, .claude/,
// .github/, .git/, .tdd/), so the fresh project's lk resolver + kit pin + hooks
// are never clobbered by the snapshot's copies.

import { existsSync, cpSync } from "fs";
import { join } from "path";
import { featuresDir, cyclesRootDir, experimentsRootDir } from "./tdd-paths.js";

export interface RestoreBuildArgs {
  /** The recorded-build corpus root (LAKEBASE_TDD_REPLAY_BUILD_DIR). */
  replayBuildDir: string;
  /** The target project working tree (the experiment branch is checked out). */
  projectDir: string;
  /** The target project .tdd dir. */
  tddDir: string;
  featureId: string;
  story: string;
}

/** Project paths the scaffold owns , never overwrite them from the snapshot, or
 *  the fresh run's kit resolver / pin / hooks break. Matched on the first path
 *  segment of each source entry relative to the corpus `code/` root. */
const SCAFFOLD_OWNED = new Set([".git", ".tdd", ".lakebase", "scripts", ".claude", ".github", "node_modules"]);

/**
 * Restore a story's recorded build into the project. Returns false (a miss) when
 * the corpus lacks this story, so the caller falls back to the live
 * Navigator/Driver build. On a hit: overlays the code tree (minus scaffold-owned
 * paths) onto the project and copies the recorded cycles + experiment records
 * into the project `.tdd`, so the driver reads the story as fully built + reviewed.
 */
export function restoreBuildTurn(args: RestoreBuildArgs): boolean {
  const { replayBuildDir, projectDir, tddDir, featureId, story } = args;
  const storyCorpus = join(featuresDir(replayBuildDir), featureId, "stories", story);
  const codeSrc = join(storyCorpus, "code");
  if (!existsSync(codeSrc)) return false; // corpus lacks this story -> live build

  // 1. Overlay the recorded code tree onto the project working tree, skipping the
  //    scaffold-owned paths (filter receives the SOURCE path; reject when its
  //    segment under codeSrc starts with a scaffold-owned dir).
  cpSync(codeSrc, projectDir, {
    recursive: true,
    force: true,
    filter: (src) => {
      const rel = src.slice(codeSrc.length).replace(/^[/\\]+/, "");
      if (rel === "") return true;
      const top = rel.split(/[/\\]/)[0];
      return !SCAFFOLD_OWNED.has(top);
    },
  });

  // 2. Restore the build records into .tdd: the GREEN + reviewed cycles and the
  //    experiment outcomes (so storyTestProgress.allGreen + no review/refactor
  //    pending -> nextBuildAction returns await-acceptance).
  const cyclesSrc = join(storyCorpus, "tdd", "cycles");
  if (existsSync(cyclesSrc)) cpSync(cyclesSrc, cyclesRootDir(tddDir), { recursive: true, force: true });
  const expSrc = join(storyCorpus, "tdd", "experiments");
  if (existsSync(expSrc)) cpSync(expSrc, experimentsRootDir(tddDir), { recursive: true, force: true });

  return true;
}
