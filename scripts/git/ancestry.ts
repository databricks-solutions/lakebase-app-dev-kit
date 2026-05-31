// Branch-ancestry primitives: pick the nearest parent across candidate
// branches and resolve the merge-base SHA. Lifted from the extension's
// resolveNearestParent / getNearestParentName / getMergeBase.
//
// Why this matters: PSA uses a 3-tier release flow (prod -> staging ->
// feature). When a feature forks from staging, staging's merge-base
// commit is more recent than main's, so picking the parent by max
// merge-base timestamp resolves to the right branch automatically. A
// hardcoded "main" would diff against the wrong base content.

import { exec } from "../util/exec.js";

export interface ResolveNearestParentArgs {
  cwd: string;
  /** Ref to find the parent of. Default: "HEAD". */
  tip?: string;
  /**
   * Candidate parent branches in preference order. The extension passes
   * the deduped union of [trunkBranch, "main", "master", stagingBranch,
   * "staging"]; the substrate stays config-agnostic and trusts the
   * caller to pre-merge VS Code / .env / repo conventions.
   */
  candidates: string[];
}

export interface NearestParent {
  name: string;
  baseSha: string;
}

export interface GetMergeBaseArgs extends ResolveNearestParentArgs {
  /**
   * Branches to try with `git merge-base <tip> <fallback>` if none of the
   * candidates have a reachable merge-base. Default: ["main", "master"].
   * Useful for legacy two-branch projects.
   */
  fallbacks?: string[];
}

/**
 * Pick the candidate branch whose merge-base with `tip` has the most
 * recent commit timestamp. Skips the tip's own branch (so a feature
 * branch named "main" wouldn't resolve to itself). Returns undefined
 * when no candidate exists locally / has a reachable merge-base.
 */
export async function resolveNearestParent(
  args: ResolveNearestParentArgs
): Promise<NearestParent | undefined> {
  const { cwd } = args;
  const tipRef = args.tip && args.tip.length > 0 ? args.tip : "HEAD";

  // The "tip branch name" is what we exclude from the candidate list, so
  // a branch can't be its own parent. When `tip` is an explicit name,
  // use it directly; otherwise resolve HEAD's branch.
  let tipBranchName = "";
  if (args.tip && args.tip.length > 0) {
    tipBranchName = args.tip;
  } else {
    try {
      tipBranchName = await exec("git rev-parse --abbrev-ref HEAD", { cwd });
    } catch {
      // ignore: we can still try candidates with HEAD
    }
  }

  let best: { name: string; baseSha: string; ts: number } | undefined;
  for (const c of args.candidates) {
    if (!c || c === tipBranchName) continue;
    try {
      const baseSha = await exec(`git merge-base "${tipRef}" "${c}"`, { cwd });
      if (!baseSha) continue;
      const tsStr = await exec(`git log -1 --format=%at "${baseSha}"`, {
        cwd,
      });
      const ts = parseInt(tsStr, 10) || 0;
      if (!best || ts > best.ts) {
        best = { name: c, baseSha, ts };
      }
    } catch {
      // candidate missing locally / unreachable - skip
    }
  }

  return best ? { name: best.name, baseSha: best.baseSha } : undefined;
}

/**
 * Convenience wrapper for callers that only need the parent branch name
 * (e.g. tree labels). Returns empty string when no candidate resolves.
 */
export async function getNearestParentName(
  args: ResolveNearestParentArgs
): Promise<string> {
  const parent = await resolveNearestParent(args);
  return parent?.name ?? "";
}

/**
 * Return the merge-base SHA between `tip` and its nearest parent across
 * `candidates`. Falls back to direct merge-base against `fallbacks`
 * (default ["main", "master"]) when no candidate resolves, so legacy
 * two-branch projects still get a useful diff base.
 */
export async function getMergeBase(args: GetMergeBaseArgs): Promise<string> {
  const parent = await resolveNearestParent(args);
  if (parent?.baseSha) return parent.baseSha;

  const { cwd } = args;
  const tipRef = args.tip && args.tip.length > 0 ? args.tip : "HEAD";
  const fallbacks = args.fallbacks ?? ["main", "master"];
  for (const fb of fallbacks) {
    try {
      await exec(`git rev-parse --verify ${fb}`, { cwd });
      return await exec(`git merge-base ${fb} ${tipRef}`, { cwd });
    } catch {
      // try next
    }
  }
  return "";
}
