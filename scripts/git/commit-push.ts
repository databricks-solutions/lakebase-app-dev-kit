// Initial commit + (optional) push for a freshly-scaffolded project.
//
// Mirrors the tail of ProjectCreationService.createProject. The
// workflow-scope error message is preserved verbatim: the raw remote
// rejection ("without `workflow` scope") is opaque if you haven't seen it.
//
// The general-purpose `commit` / `commitAll` / `commitAmend` / etc.
// primitives live in ./commits.ts. This module's surface is now
// strictly the project-scaffold + push flow.

import { exec } from "../util/exec.js";

export interface CommitAndPushArgs {
  projectDir: string;
  message: string;
  /** Push to "origin main" after commit. Default: true. */
  push?: boolean;
  /** Remote name. Default: "origin". */
  remote?: string;
  /** Branch name. Default: "main". */
  branch?: string;
}

export class WorkflowScopeError extends Error {
  constructor(projectDir: string) {
    super(
      `Push rejected: GitHub token lacks the \`workflow\` OAuth scope required for ` +
        `commits touching \`.github/workflows/*\`. The project on disk is fine; ` +
        `only the initial push failed.\n\n` +
        `To finish:\n` +
        `  1. Re-sign in to GitHub in VS Code and grant the workflow scope (or set ` +
        `     GITHUB_TOKEN to a token with workflow scope)\n` +
        `  2. Then from the project dir:  cd ${projectDir} && git push -u origin main`
    );
    this.name = "WorkflowScopeError";
  }
}

/**
 * Commit and (by default) push to origin/main with -u. Stages
 * everything first (`git add -A`), then commits with the given message,
 * then pushes. Throws {@link WorkflowScopeError} when the remote
 * rejects due to the GitHub token lacking the `workflow` OAuth scope.
 *
 * For non-initial-commit flows, prefer the primitives in ./commits.ts.
 */
export async function commitAndPush(args: CommitAndPushArgs): Promise<void> {
  await exec("git add -A", { cwd: args.projectDir });
  await exec(`git commit -m ${JSON.stringify(args.message)}`, {
    cwd: args.projectDir,
    timeout: 30_000,
  });
  if (args.push === false) return;
  const remote = args.remote ?? "origin";
  const branch = args.branch ?? "main";
  try {
    await exec(`git push -u ${remote} ${branch}`, {
      cwd: args.projectDir,
      timeout: 30_000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/without `?workflow`? scope|workflow scope/i.test(msg)) {
      throw new WorkflowScopeError(args.projectDir);
    }
    throw err;
  }
}
