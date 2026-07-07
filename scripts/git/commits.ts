// Commit-side workflow primitives. Lifted from lakebase-scm-extension's
// GitService commit / amend / signoff / undo / discard methods (P5b).
//
// All shell-out args go through JSON.stringify rather than the
// extension's naive double-quote escape, so messages containing
// backticks, dollar signs, or newlines round-trip correctly. The kit's
// commit-push.ts already uses this pattern.

import { existsSync } from "fs";
import { join } from "path";
import { exec, shq } from "../util/exec.js";

/** Extensions the allow-list commit treats as source/artifact worth staging even
 *  at the repo root (so a minimal app's root `app.py`/`main.ts` is committed).
 *  A file with no extension or a non-source one (e.g. a stray `"` or a `.log`)
 *  outside the source roots is left untracked, so agent junk never rides a commit. */
const SOURCE_EXTENSIONS = new Set<string>([
  ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".java", ".kt", ".kts",
  ".go", ".rb", ".rs", ".php", ".cs", ".scala", ".sql", ".html", ".htm", ".css",
  ".scss", ".less", ".vue", ".svelte", ".json", ".yaml", ".yml", ".toml", ".ini",
  ".cfg", ".conf", ".xml", ".md", ".sh", ".bash", ".env", ".gradle", ".properties",
]);

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
  /**
   * Repo-relative paths to FORCE-stage in addition to (and after) the
   * exclude-aware `git add -A`, even when they sit UNDER an `exclude` prefix.
   * The stable project-level `.tdd/design/` corpus is the motivating case: the
   * broad `.tdd` exclude (churn control) would otherwise drop the design guide,
   * so it never rides the feature branch's PR to the parent tier and the next
   * feature re-authors the whole design system. The churny `.tdd` state
   * (workflow-state.json, cycles/) must stay uncommitted so its copy doesn't
   * diverge from the feature branch and break accept's `git checkout`; the
   * design corpus is different, written ONCE in the design phase and never
   * touched during build, so committing it is safe. A path that does not exist
   * is skipped (git errors on an unmatched pathspec).
   */
  include?: string[];
  /**
   * Allow-list the UNTRACKED files that get staged: stage every TRACKED change
   * (anywhere, minus `exclude`) so no edit to committed config/source is ever
   * dropped, but stage NEW untracked files ONLY when they sit under one of these
   * repo-relative prefixes (the project's source/test/migration roots). Stray
   * untracked files elsewhere , e.g. agent junk written to the repo root by a
   * mis-quoted shell command , are then never committed onto the experiment
   * branch. When omitted, the legacy `git add -A` (minus `exclude`) behavior is
   * used (stage everything, tracked and untracked).
   */
  untrackedAllow?: string[];
}

/**
 * `git add -A` (optionally excluding path prefixes, then force-staging explicit
 * `include` paths), then commit only if something is actually staged. Returns
 * true when a commit was made, false when nothing matched (clean tree, or only
 * excluded paths changed). Throws on a genuine git failure (not a repo,
 * detached HEAD, hook rejection); callers that want best-effort behavior wrap it
 * in try/catch.
 */
export async function commitAllIfChanged(args: CommitAllArgs): Promise<boolean> {
  if (!args.message.trim()) {
    throw new Error("Commit message is required");
  }
  const exclude = args.exclude ?? [];
  // A trailing slash on a prefix is dropped (`.tdd/` -> exclude the `.tdd` dir).
  const ex = exclude.length > 0 ? " " + exclude.map((p) => shq(`:(exclude)${p.replace(/\/+$/, "")}`)).join(" ") : "";
  const allow = args.untrackedAllow ?? [];
  if (allow.length > 0) {
    // Allow-list mode: stage every TRACKED change (anywhere, minus excludes) so
    // no committed-file edit is dropped, then stage NEW untracked files only when
    // they sit under an allow-listed source root OR carry a recognized source
    // extension (so root-level code like `app.py` is committed). Stray junk with
    // no/unknown extension outside the source roots , e.g. an agent's mis-quoted
    // file named `"` , is never staged, so it cannot ride onto the experiment.
    await exec(`git add -u -- .${ex}`, { cwd: args.cwd });
    const excludeDirs = exclude.map((p) => p.replace(/\/+$/, ""));
    const underDir = (f: string, d: string): boolean => f === d || f.startsWith(`${d}/`);
    const untracked = (await exec("git ls-files --others --exclude-standard", { cwd: args.cwd }))
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const f of untracked) {
      if (excludeDirs.some((d) => underDir(f, d))) continue;
      const dot = f.lastIndexOf(".");
      const ext = dot > f.lastIndexOf("/") ? f.slice(dot).toLowerCase() : "";
      if (allow.some((d) => underDir(f, d)) || SOURCE_EXTENSIONS.has(ext)) {
        await exec(`git add -- ${shq(f)}`, { cwd: args.cwd });
      }
    }
  } else if (exclude.length > 0) {
    await exec(`git add -A -- .${ex}`, { cwd: args.cwd });
  } else {
    await exec("git add -A", { cwd: args.cwd });
  }
  // Force-stage the explicit includes the exclude above would otherwise drop
  // (e.g. the stable `.tdd/design` corpus). Skip a path that isn't present so
  // git doesn't error on an unmatched pathspec.
  for (const inc of args.include ?? []) {
    if (existsSync(join(args.cwd, inc))) {
      await exec(`git add -f -- ${shq(inc)}`, { cwd: args.cwd });
    }
  }
  // The commit decision reads the actual index after exclude + include staging,
  // so it reflects exactly what this commit will contain (and skips a commit
  // when only excluded paths changed).
  const staged = await exec("git diff --cached --name-only", { cwd: args.cwd });
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
