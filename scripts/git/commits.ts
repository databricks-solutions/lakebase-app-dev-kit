// Commit-side workflow primitives. Lifted from lakebase-scm-extension's
// GitService commit / amend / signoff / undo / discard methods (P5b).
//
// All shell-out args go through JSON.stringify rather than the
// extension's naive double-quote escape, so messages containing
// backticks, dollar signs, or newlines round-trip correctly. The kit's
// commit-push.ts already uses this pattern.

import { exec, shq } from "../util/exec.js";

export interface CommitArgs {
  cwd: string;
  message: string;
}

export interface AmendArgs {
  cwd: string;
  /**
   * New message. When omitted, the existing message is preserved
   * (`git commit --amend --no-edit`). When provided, it replaces the
   * existing message (`git commit --amend -m ...`).
   */
  message?: string;
}

export interface UndoLastCommitArgs {
  cwd: string;
}

export interface DiscardAllChangesArgs {
  cwd: string;
  /**
   * Destructive: must be set to `true` to actually wipe the working
   * tree (runs `git checkout -- .` + `git clean -fd`). Required to
   * keep accidental invocations from nuking uncommitted work; the
   * extension's UI driver always sets it explicitly after user confirm.
   */
  confirm: true;
}

/** Commit ALREADY-staged changes. Throws when the message is empty. */
export async function commit(args: CommitArgs): Promise<void> {
  if (!args.message.trim()) {
    throw new Error("Commit message is required");
  }
  await exec(`git commit -m ${shq(args.message)}`, {
    cwd: args.cwd,
  });
}

/** `git add -A` + commit. Throws when the message is empty. */
export async function commitAll(args: CommitArgs): Promise<void> {
  if (!args.message.trim()) {
    throw new Error("Commit message is required");
  }
  await exec("git add -A", { cwd: args.cwd });
  await exec(`git commit -m ${shq(args.message)}`, {
    cwd: args.cwd,
  });
}

export interface CommitAllArgs extends CommitArgs {
  /**
   * Repo-relative path prefixes to NOT stage, e.g. orchestration metadata that
   * churns mid-run (`.tdd/`, `.lakebase/`). Excluded via a magic `:(exclude)`
   * pathspec paired with an inclusive `.`, so the commit captures CODE only.
   * Committing churny metadata onto a short-lived branch makes its committed
   * copy diverge from the branch it merges into, which then breaks a later
   * `git checkout` of that branch , scope to code to avoid it.
   */
  exclude?: string[];
}

/**
 * `git add -A` (optionally excluding path prefixes), then commit only if
 * something is actually staged. Returns true when a commit was made, false when
 * nothing matched (clean tree, or only excluded paths changed). Throws on a
 * genuine git failure (not a repo, detached HEAD, hook rejection); callers that
 * want best-effort behavior wrap it in try/catch.
 */
export async function commitAllIfChanged(args: CommitAllArgs): Promise<boolean> {
  if (!args.message.trim()) {
    throw new Error("Commit message is required");
  }
  const exclude = args.exclude ?? [];
  let addCmd = "git add -A";
  let diffCmd = "git diff --cached --name-only";
  if (exclude.length > 0) {
    // A trailing slash on a prefix is dropped (`.tdd/` -> exclude the `.tdd` dir).
    const ex = exclude.map((p) => shq(`:(exclude)${p.replace(/\/+$/, "")}`)).join(" ");
    addCmd = `git add -A -- . ${ex}`;
    diffCmd = `git diff --cached --name-only -- . ${ex}`;
  }
  await exec(addCmd, { cwd: args.cwd });
  const staged = await exec(diffCmd, { cwd: args.cwd });
  if (!staged.trim()) return false;
  await exec(`git commit -m ${shq(args.message)}`, { cwd: args.cwd });
  return true;
}

/** Commit with DCO sign-off. Throws when the message is empty. */
export async function commitSignedOff(args: CommitArgs): Promise<void> {
  if (!args.message.trim()) {
    throw new Error("Commit message is required");
  }
  await exec(`git commit -s -m ${shq(args.message)}`, {
    cwd: args.cwd,
  });
}

/** `git add -A` + commit with DCO sign-off. Throws when message is empty. */
export async function commitAllSignedOff(args: CommitArgs): Promise<void> {
  if (!args.message.trim()) {
    throw new Error("Commit message is required");
  }
  await exec("git add -A", { cwd: args.cwd });
  await exec(`git commit -s -m ${shq(args.message)}`, {
    cwd: args.cwd,
  });
}

/**
 * Amend the previous commit. Without `message`, keeps the existing
 * commit message (`--no-edit`). With `message`, replaces it.
 */
export async function commitAmend(args: AmendArgs): Promise<void> {
  if (args.message !== undefined) {
    if (!args.message.trim()) {
      throw new Error("Commit message is required");
    }
    await exec(
      `git commit --amend -m ${shq(args.message)}`,
      { cwd: args.cwd }
    );
  } else {
    await exec("git commit --amend --no-edit", { cwd: args.cwd });
  }
}

/**
 * Soft-reset to HEAD~1, keeping the working tree + index intact. The
 * commit is removed from history but its changes remain staged so the
 * caller can re-commit with a corrected message / scope.
 */
export async function undoLastCommit(args: UndoLastCommitArgs): Promise<void> {
  await exec("git reset --soft HEAD~1", { cwd: args.cwd });
}

/**
 * Hard-discard ALL changes in the working tree (tracked + untracked).
 * Requires `confirm: true` as a typed safety latch so accidental calls
 * don't wipe uncommitted work. Equivalent to:
 *
 *   git checkout -- .
 *   git clean -fd
 */
export async function discardAllChanges(
  args: DiscardAllChangesArgs
): Promise<void> {
  if (args.confirm !== true) {
    throw new Error(
      "discardAllChanges requires confirm: true (destructive operation)"
    );
  }
  await exec("git checkout -- .", { cwd: args.cwd });
  await exec("git clean -fd", { cwd: args.cwd });
}
