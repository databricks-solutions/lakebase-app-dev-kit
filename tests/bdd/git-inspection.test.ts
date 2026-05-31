// BDD coverage for the P5a workflow-coordination git primitives:
// branches.ts, ancestry.ts, status.ts, migrations.ts. Each describe
// block spins up an isolated temp git repo so tests don't depend on
// the host's working tree.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { gitInit } from "../../scripts/git/init.js";
import {
  listLocalBranches,
  listRemoteBranches,
  hasRemoteBranch,
} from "../../scripts/git/branches.js";
import {
  resolveNearestParent,
  getNearestParentName,
  getMergeBase,
} from "../../scripts/git/ancestry.js";
import {
  hasUpstream,
  getAheadBehind,
  isDirty,
} from "../../scripts/git/status.js";
import { listMigrationsOnBranch } from "../../scripts/git/migrations.js";
import { exec } from "../../scripts/util/exec.js";

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  }
});

function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-gi-"));
  tmpDirs.push(dir);
  return dir;
}

async function configIdentity(cwd: string): Promise<void> {
  await exec("git config user.email test@example.com", { cwd });
  await exec("git config user.name 'Test User'", { cwd });
}

async function commitFile(
  cwd: string,
  name: string,
  contents: string,
  message: string,
  /**
   * Optional ISO date string. Forces author + committer date so tests
   * that depend on merge-base timestamp ordering (resolveNearestParent's
   * 3-tier case) don't collide at 1-second precision under fast runs.
   */
  date?: string
): Promise<string> {
  fs.writeFileSync(path.join(cwd, name), contents);
  await exec("git add -A", { cwd });
  const dateEnv = date
    ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
    : undefined;
  await exec(`git commit -m "${message}"`, { cwd, env: dateEnv });
  return await exec("git rev-parse HEAD", { cwd });
}

// ---------- branches.ts ----------

describe("listLocalBranches", () => {
  it("returns [] for a non-git directory", async () => {
    const dir = mkTmp();
    expect(await listLocalBranches({ cwd: dir })).toEqual([]);
  });

  it("lists local branches with the current branch flagged", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await commitFile(dir, "a.txt", "a", "initial");
    await exec("git checkout -b feature/x", { cwd: dir });

    const branches = await listLocalBranches({ cwd: dir });
    const names = branches.map((b) => b.name).sort();
    expect(names).toEqual(["feature/x", "main"]);
    expect(branches.find((b) => b.name === "feature/x")?.isCurrent).toBe(true);
    expect(branches.find((b) => b.name === "main")?.isCurrent).toBe(false);
    expect(branches.every((b) => b.isRemote === false)).toBe(true);
  });
});

describe("listRemoteBranches", () => {
  it("returns remotes not already checked out locally, stripped of prefix", async () => {
    // Create a "remote" bare repo, and a local repo that has it as origin
    // with two remote branches (main + feature/y) where only main is
    // checked out locally. listRemoteBranches should surface feature/y.
    const remoteBare = mkTmp();
    await exec("git init --bare -b main", { cwd: remoteBare });

    const seed = mkTmp();
    await gitInit(seed);
    await configIdentity(seed);
    await commitFile(seed, "a.txt", "a", "seed");
    await exec("git checkout -b feature/y", { cwd: seed });
    await commitFile(seed, "b.txt", "b", "y change");
    await exec("git checkout main", { cwd: seed });
    await exec(`git remote add origin "${remoteBare}"`, { cwd: seed });
    await exec("git push origin main", { cwd: seed });
    await exec("git push origin feature/y", { cwd: seed });

    const local = mkTmp();
    await exec(`git clone "${remoteBare}" "${local}"`, { cwd: os.tmpdir() });
    await configIdentity(local);
    // local now has main checked out + origin/feature/y available

    const remotes = await listRemoteBranches({ cwd: local });
    const names = remotes.map((b) => b.name);
    expect(names).toContain("feature/y");
    expect(names).not.toContain("main");
    expect(remotes.every((b) => b.isRemote === true)).toBe(true);
    expect(remotes.find((b) => b.name === "feature/y")?.tracking).toBe(
      "origin/feature/y"
    );
  });
});

describe("hasRemoteBranch", () => {
  it("returns true for an existing remote branch, false for a missing one", async () => {
    const remoteBare = mkTmp();
    await exec("git init --bare -b main", { cwd: remoteBare });

    const local = mkTmp();
    await gitInit(local);
    await configIdentity(local);
    await commitFile(local, "a.txt", "a", "seed");
    await exec(`git remote add origin "${remoteBare}"`, { cwd: local });
    await exec("git push origin main", { cwd: local });

    expect(await hasRemoteBranch({ cwd: local, branch: "main" })).toBe(true);
    expect(await hasRemoteBranch({ cwd: local, branch: "nope" })).toBe(false);
  });
});

// ---------- ancestry.ts ----------

describe("resolveNearestParent", () => {
  it("picks the candidate with the most recent merge-base timestamp (3-tier staging case)", async () => {
    // Simulate: main -> (some commits) -> staging branched -> staging
    // gets newer commits -> feature/z branches from staging. Expected:
    // feature/z's parent resolves to "staging", not "main", because
    // staging's merge-base with feature/z is more recent than main's.
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    // Force monotonically-increasing dates so merge-base timestamp
    // ordering is deterministic regardless of how fast the test runs.
    await commitFile(dir, "a.txt", "a", "initial on main", "2020-01-01T00:00:00Z");
    await commitFile(dir, "b.txt", "b", "second on main", "2020-01-02T00:00:00Z");

    await exec("git checkout -b staging", { cwd: dir });
    await commitFile(dir, "c.txt", "c", "staging-only commit", "2020-01-03T00:00:00Z");

    await exec("git checkout -b feature/z", { cwd: dir });
    await commitFile(dir, "d.txt", "d", "feature commit", "2020-01-04T00:00:00Z");

    const parent = await resolveNearestParent({
      cwd: dir,
      candidates: ["main", "staging"],
    });
    expect(parent?.name).toBe("staging");
    expect(parent?.baseSha).toBeTruthy();
  });

  it("skips the tip's own branch as a candidate", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await commitFile(dir, "a.txt", "a", "seed");
    // tip is HEAD on main; candidates includes main itself
    const parent = await resolveNearestParent({
      cwd: dir,
      candidates: ["main"],
    });
    expect(parent).toBeUndefined();
  });

  it("returns undefined when no candidate exists locally", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await commitFile(dir, "a.txt", "a", "seed");
    const parent = await resolveNearestParent({
      cwd: dir,
      candidates: ["does-not-exist", "also-missing"],
    });
    expect(parent).toBeUndefined();
  });
});

describe("getNearestParentName", () => {
  it("returns the name string (convenience wrapper)", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await commitFile(dir, "a.txt", "a", "seed");
    await exec("git checkout -b feature/n", { cwd: dir });
    await commitFile(dir, "b.txt", "b", "feat");
    expect(
      await getNearestParentName({ cwd: dir, candidates: ["main"] })
    ).toBe("main");
  });

  it("returns empty string when no candidate resolves", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await commitFile(dir, "a.txt", "a", "seed");
    expect(
      await getNearestParentName({ cwd: dir, candidates: ["missing"] })
    ).toBe("");
  });
});

describe("getMergeBase", () => {
  it("returns the resolved-parent merge-base SHA when a candidate matches", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    const mainSha = await commitFile(dir, "a.txt", "a", "seed");
    await exec("git checkout -b feature/m", { cwd: dir });
    await commitFile(dir, "b.txt", "b", "feat");
    const mb = await getMergeBase({ cwd: dir, candidates: ["main"] });
    expect(mb).toBe(mainSha);
  });

  it("falls back to direct merge-base against main/master when no candidate resolves", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    const mainSha = await commitFile(dir, "a.txt", "a", "seed");
    await exec("git checkout -b feature/m", { cwd: dir });
    await commitFile(dir, "b.txt", "b", "feat");
    // Candidates list is empty, fallback to ["main", "master"]
    const mb = await getMergeBase({ cwd: dir, candidates: [] });
    expect(mb).toBe(mainSha);
  });

  it("returns empty string when no candidate and no fallback resolves", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await commitFile(dir, "a.txt", "a", "seed");
    // rename main so neither candidate nor fallback exists
    await exec("git branch -m main trunk", { cwd: dir });
    const mb = await getMergeBase({
      cwd: dir,
      candidates: ["nope"],
      fallbacks: ["also-missing"],
    });
    expect(mb).toBe("");
  });
});

// ---------- status.ts ----------

describe("hasUpstream", () => {
  it("returns false when no upstream is set", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await commitFile(dir, "a.txt", "a", "seed");
    expect(await hasUpstream({ cwd: dir })).toBe(false);
  });

  it("returns true after setting upstream via push -u", async () => {
    const remoteBare = mkTmp();
    await exec("git init --bare -b main", { cwd: remoteBare });
    const local = mkTmp();
    await gitInit(local);
    await configIdentity(local);
    await commitFile(local, "a.txt", "a", "seed");
    await exec(`git remote add origin "${remoteBare}"`, { cwd: local });
    await exec("git push -u origin main", { cwd: local });
    expect(await hasUpstream({ cwd: local })).toBe(true);
  });
});

describe("getAheadBehind", () => {
  it("returns ahead/behind zeros + empty upstream when no upstream", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await commitFile(dir, "a.txt", "a", "seed");
    const ab = await getAheadBehind({ cwd: dir });
    expect(ab).toEqual({ ahead: 0, behind: 0, upstream: "" });
  });

  it("reports ahead count after a local commit on a tracked branch", async () => {
    const remoteBare = mkTmp();
    await exec("git init --bare -b main", { cwd: remoteBare });
    const local = mkTmp();
    await gitInit(local);
    await configIdentity(local);
    await commitFile(local, "a.txt", "a", "seed");
    await exec(`git remote add origin "${remoteBare}"`, { cwd: local });
    await exec("git push -u origin main", { cwd: local });
    await commitFile(local, "b.txt", "b", "second");
    const ab = await getAheadBehind({ cwd: local });
    expect(ab.ahead).toBe(1);
    expect(ab.behind).toBe(0);
    expect(ab.upstream).toBe("origin/main");
  });
});

describe("isDirty", () => {
  it("returns false for a clean repo", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await commitFile(dir, "a.txt", "a", "seed");
    expect(await isDirty({ cwd: dir })).toBe(false);
  });

  it("returns true with an unstaged modification", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await commitFile(dir, "a.txt", "a", "seed");
    fs.writeFileSync(path.join(dir, "a.txt"), "changed");
    expect(await isDirty({ cwd: dir })).toBe(true);
  });

  it("returns true with an untracked file", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await commitFile(dir, "a.txt", "a", "seed");
    fs.writeFileSync(path.join(dir, "new.txt"), "x");
    expect(await isDirty({ cwd: dir })).toBe(true);
  });
});

// ---------- migrations.ts ----------

describe("listMigrationsOnBranch", () => {
  it("returns Flyway-style migrations sorted, basenames only", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    const migDir = path.join(dir, "db", "migration");
    fs.mkdirSync(migDir, { recursive: true });
    fs.writeFileSync(path.join(migDir, "V002__b.sql"), "");
    fs.writeFileSync(path.join(migDir, "V001__a.sql"), "");
    fs.writeFileSync(path.join(migDir, "README.md"), "");
    await exec("git add -A", { cwd: dir });
    await exec(`git commit -m "seed"`, { cwd: dir });

    const files = await listMigrationsOnBranch({
      cwd: dir,
      branch: "main",
      migrationPath: "db/migration",
    });
    expect(files).toEqual(["V001__a.sql", "V002__b.sql"]);
  });

  it("respects a custom pattern (Alembic-style numeric prefix)", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    const migDir = path.join(dir, "alembic", "versions");
    fs.mkdirSync(migDir, { recursive: true });
    fs.writeFileSync(path.join(migDir, "0001_a.py"), "");
    fs.writeFileSync(path.join(migDir, "0002_b.py"), "");
    fs.writeFileSync(path.join(migDir, "ignored.txt"), "");
    await exec("git add -A", { cwd: dir });
    await exec(`git commit -m "seed"`, { cwd: dir });

    const files = await listMigrationsOnBranch({
      cwd: dir,
      branch: "main",
      migrationPath: "alembic/versions",
      pattern: /^\d{4}.*\.py$/,
    });
    expect(files).toEqual(["0001_a.py", "0002_b.py"]);
  });

  it("returns [] for a branch that does not exist", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await commitFile(dir, "a.txt", "a", "seed");
    const files = await listMigrationsOnBranch({
      cwd: dir,
      branch: "ghost",
      migrationPath: "db/migration",
    });
    expect(files).toEqual([]);
  });

  it("returns [] for empty branch / empty migrationPath inputs", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await commitFile(dir, "a.txt", "a", "seed");
    expect(
      await listMigrationsOnBranch({
        cwd: dir,
        branch: "",
        migrationPath: "db/migration",
      })
    ).toEqual([]);
    expect(
      await listMigrationsOnBranch({
        cwd: dir,
        branch: "main",
        migrationPath: "",
      })
    ).toEqual([]);
  });
});
