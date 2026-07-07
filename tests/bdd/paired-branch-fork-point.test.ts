// A feature branch must fork from its PARENT tier's pushed tip, not from
// whatever happens to be checked out. The live smoke cut F2 from
// `main` (trunk, no F1 work) while its paired Lakebase branch carried staging's
// lineage, so F2 re-authored F1's migration and Alembic could not locate the
// DB's stamped revision at accept. Root cause: `git checkout -b <branch>` with
// no start point. These tests pin the fix: resolveFeatureStartPoint prefers
// origin/<parent>, and assertCleanForFork refuses a dirty fork.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveFeatureStartPoint, assertCleanForFork } from "../../scripts/lakebase/paired-branch.js";

let root: string;
let originDir: string;
let workDir: string;

const git = (cwd: string, ...argv: string[]): string =>
  execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "commit.gpgsign", "false");
}

function commit(dir: string, file: string, body: string, msg: string): void {
  writeFileSync(join(dir, file), body);
  git(dir, "add", file);
  git(dir, "commit", "-q", "-m", msg);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pb-fork-"));
  // origin: a bare repo with main + a staging branch that has an extra commit.
  const seed = join(root, "seed");
  originDir = join(root, "origin.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", originDir]);
  initRepo(seed);
  commit(seed, "a.txt", "A", "feat: A on main");
  git(seed, "remote", "add", "origin", originDir);
  git(seed, "push", "-q", "origin", "main");
  git(seed, "checkout", "-q", "-b", "staging");
  commit(seed, "b.txt", "B", "feat: B on staging");
  git(seed, "push", "-q", "origin", "staging");

  // work: a fresh clone sitting on main (no b.txt). origin/staging has b.txt.
  workDir = join(root, "work");
  execFileSync("git", ["clone", "-q", originDir, workDir]);
  git(workDir, "config", "user.email", "t@example.com");
  git(workDir, "config", "user.name", "Test");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("resolveFeatureStartPoint", () => {
  it("prefers origin/<parent> (fetches it) over the checked-out HEAD", () => {
    expect(resolveFeatureStartPoint(workDir, "staging")).toBe("origin/staging");
  });

  it("forking from the resolved start point lands the PARENT's content, not HEAD's", () => {
    const sp = resolveFeatureStartPoint(workDir, "staging")!;
    git(workDir, "checkout", "-q", "-b", "feature/x", sp);
    // feature/x must contain staging's b.txt (forked from staging), and its tip
    // must equal origin/staging, NOT local main.
    expect(git(workDir, "rev-parse", "HEAD")).toBe(git(workDir, "rev-parse", "origin/staging"));
    expect(git(workDir, "rev-parse", "HEAD")).not.toBe(git(workDir, "rev-parse", "main"));
  });

  it("falls back to a local parent ref when there is no origin", () => {
    const local = join(root, "local");
    initRepo(local);
    commit(local, "a.txt", "A", "init");
    git(local, "checkout", "-q", "-b", "staging");
    commit(local, "b.txt", "B", "staging work");
    git(local, "checkout", "-q", "main");
    expect(resolveFeatureStartPoint(local, "staging")).toBe("staging");
  });

  it("returns undefined (fork from HEAD) when neither origin nor local parent resolves", () => {
    expect(resolveFeatureStartPoint(workDir, "no-such-tier")).toBeUndefined();
    expect(resolveFeatureStartPoint(workDir, undefined)).toBeUndefined();
  });
});

describe("assertCleanForFork", () => {
  it("throws on a dirty tree when forking from a parent (changes would be carried)", async () => {
    writeFileSync(join(workDir, "a.txt"), "A dirty");
    await expect(assertCleanForFork(workDir, "origin/staging")).rejects.toThrow(/uncommitted changes/i);
  });

  it("resolves on a clean tree", async () => {
    await expect(assertCleanForFork(workDir, "origin/staging")).resolves.toBeUndefined();
  });

  it("is a no-op when there is no start point (forking from HEAD carries nothing new)", async () => {
    writeFileSync(join(workDir, "a.txt"), "A dirty");
    await expect(assertCleanForFork(workDir, undefined)).resolves.toBeUndefined();
  });

  it("tolerates .tdd/ + .lakebase/ workflow-metadata churn (uncommitted CODE only)", async () => {
    mkdirSync(join(workDir, ".tdd"), { recursive: true });
    mkdirSync(join(workDir, ".lakebase"), { recursive: true });
    writeFileSync(join(workDir, ".tdd", "agent-log.jsonl"), '{"e":1}\n');
    writeFileSync(join(workDir, ".lakebase", "workflow-state.json"), "{}");
    await expect(assertCleanForFork(workDir, "origin/staging")).resolves.toBeUndefined();
  });

  it("tolerates a stray UNTRACKED file (agent junk): it rides the fork but the allow-list build never commits it", async () => {
    // The live F1 stall: a design-lane agent wrote a mis-quoted file named `"` at
    // the repo root. It is untracked, so it must NOT block the experiment cut.
    writeFileSync(join(workDir, '"'), '"component =\n');
    writeFileSync(join(workDir, "stray-junk.txt"), "oops");
    await expect(assertCleanForFork(workDir, "origin/staging")).resolves.toBeUndefined();
  });
});
