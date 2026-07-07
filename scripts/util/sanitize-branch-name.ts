// Normalize a git branch name into a Lakebase-compatible branch id.
// Ported verbatim from src/services/lakebaseService.ts:sanitizeBranchName.
//
// Lakebase rules: lowercase, alphanumeric + hyphens only, max 63 chars,
// min 3 chars (padded with "-x" if shorter).

/** Max Lakebase branch-name length (the Postgres identifier limit). A name over
 *  this is truncated on create, so any name a caller also uses to LOOK UP the
 *  branch must already be within it, or the read misses ("branch id not found"). */
export const LAKEBASE_BRANCH_NAME_MAX = 63;

export function sanitizeBranchName(gitBranch: string): string {
  let name = gitBranch
    .replace(/\//g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .substring(0, LAKEBASE_BRANCH_NAME_MAX);
  while (name.length < 3) name += "-x";
  return name;
}
