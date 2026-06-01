// BDD coverage for the P5b/c/d mutation git primitives: commits.ts,
// sync.ts, branch-tag.ts. Each describe block uses an isolated temp
// repo so tests don't depend on the host's working tree.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { gitInit } from "../../scripts/git/init.js";
import {
  commit,
  commitAll,
  commitAmend,
  commitSignedOff,
  commitAllSignedOff,
  undoLastCommit,
  discardAllChanges,
} from "../../scripts/git/commits.js";
import {
  push,
  pull,
  publishBranch,
  pushCurrentBranchForPr,
} from "../../scripts/git/sync.js";
import {
  deleteLocalBranch,
  renameBranch,
  mergeBranch,
  createTag,
  deleteTag,
  deleteRemoteTag,
  ProtectedBranchError,
} from "../../scripts/git/branch-tag.js";
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-gm-"));
  tmpDirs.push(dir);
  return dir;
}

async function configIdentity(cwd: string): Promise<void> {
  await exec("git config user.email test@example.com", { cwd });
  await exec("git config user.name 'Test User'", { cwd });
}

async function writeAndStage(
  cwd: string,
  name: string,
  contents: string
): Promise<void> {
  fs.writeFileSync(path.join(cwd, name), contents);
  await exec(`git add ${JSON.stringify(name)}`, { cwd });
}

async function lastCommitMessage(cwd: string): Promise<string> {
  return await exec("git log -1 --pretty=%B", { cwd });
}

async function lastCommitSha(cwd: string): Promise<string> {
  return await exec("git rev-parse HEAD", { cwd });
}

// ---------- commits.ts ----------

describe("commit", () => {
  it("commits already-staged changes with the given message", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "first" });
    expect((await lastCommitMessage(dir)).trim()).toBe("first");
  });

  it("does NOT auto-stage unstaged files", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    // Seed commit so HEAD exists for rev-list later
    await writeAndStage(dir, "seed.txt", "");
    await commit({ cwd: dir, message: "seed" });
    // Unstaged write
    fs.writeFileSync(path.join(dir, "unstaged.txt"), "x");
    // commit with no staged changes should throw
    await expect(commit({ cwd: dir, message: "should fail" })).rejects.toThrow();
  });

  it("throws on empty / whitespace-only message", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await expect(commit({ cwd: dir, message: "" })).rejects.toThrow(
      /required/
    );
    await expect(commit({ cwd: dir, message: "   " })).rejects.toThrow(
      /required/
    );
  });

  it("handles messages with shell-special characters", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    const msg = 'a (b/c): "x" $y `z`';
    await commit({ cwd: dir, message: msg });
    expect((await lastCommitMessage(dir)).trim()).toBe(msg);
  });
});

describe("commitAll", () => {
  it("stages everything and commits", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    fs.writeFileSync(path.join(dir, "b.txt"), "b");
    await commitAll({ cwd: dir, message: "both" });
    const log = await exec(
      "git log -1 --name-only --pretty=format:",
      { cwd: dir }
    );
    expect(log.split("\n").filter(Boolean).sort()).toEqual(["a.txt", "b.txt"]);
  });
});

describe("commitSignedOff", () => {
  it("commits with a DCO Signed-off-by trailer", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commitSignedOff({ cwd: dir, message: "signed" });
    const body = await lastCommitMessage(dir);
    expect(body).toMatch(/Signed-off-by: Test User <test@example.com>/);
  });
});

describe("commitAllSignedOff", () => {
  it("stages everything AND adds the Signed-off-by trailer", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    fs.writeFileSync(path.join(dir, "b.txt"), "b");
    await commitAllSignedOff({ cwd: dir, message: "both signed" });
    const body = await lastCommitMessage(dir);
    expect(body).toMatch(/Signed-off-by:/);
    const log = await exec(
      "git log -1 --name-only --pretty=format:",
      { cwd: dir }
    );
    expect(log.split("\n").filter(Boolean).sort()).toEqual(["a.txt", "b.txt"]);
  });
});

describe("commitAmend", () => {
  it("preserves the previous message when called without a new one", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "original" });
    // stage additional change and amend
    fs.writeFileSync(path.join(dir, "a.txt"), "a2");
    await exec("git add -A", { cwd: dir });
    await commitAmend({ cwd: dir });
    expect((await lastCommitMessage(dir)).trim()).toBe("original");
  });

  it("replaces the message when a new one is provided", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "original" });
    await commitAmend({ cwd: dir, message: "rewritten" });
    expect((await lastCommitMessage(dir)).trim()).toBe("rewritten");
  });

  it("throws when message is provided but empty", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "seed" });
    await expect(commitAmend({ cwd: dir, message: "" })).rejects.toThrow(
      /required/
    );
  });
});

describe("undoLastCommit", () => {
  it("removes the last commit but keeps changes staged (--soft)", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "seed" });
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "to-undo" });
    const beforeSha = await lastCommitSha(dir);
    await undoLastCommit({ cwd: dir });
    const afterSha = await lastCommitSha(dir);
    expect(afterSha).not.toBe(beforeSha);
    expect((await lastCommitMessage(dir)).trim()).toBe("seed");
    // b.txt remains in the working tree + staged
    expect(fs.existsSync(path.join(dir, "b.txt"))).toBe(true);
    const staged = await exec("git diff --cached --name-only", { cwd: dir });
    expect(staged.split("\n")).toContain("b.txt");
  });
});

describe("discardAllChanges", () => {
  it("requires confirm: true (typed safety latch)", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    // @ts-expect-error - intentionally omitting required confirm flag
    await expect(discardAllChanges({ cwd: dir })).rejects.toThrow(
      /confirm: true/
    );
  });

  it("wipes tracked + untracked changes with confirm: true", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "seed" });
    // Both an unstaged modification and an untracked file
    fs.writeFileSync(path.join(dir, "a.txt"), "modified");
    fs.writeFileSync(path.join(dir, "untracked.txt"), "x");
    await discardAllChanges({ cwd: dir, confirm: true });
    expect(fs.readFileSync(path.join(dir, "a.txt"), "utf8")).toBe("a");
    expect(fs.existsSync(path.join(dir, "untracked.txt"))).toBe(false);
  });
});

// ---------- sync.ts ----------

async function makeLocalAndRemote(): Promise<{
  local: string;
  remote: string;
}> {
  const remote = mkTmp();
  await exec("git init --bare -b main", { cwd: remote });
  const local = mkTmp();
  await gitInit(local);
  await configIdentity(local);
  await writeAndStage(local, "a.txt", "a");
  await commit({ cwd: local, message: "seed" });
  await exec(`git remote add origin ${JSON.stringify(remote)}`, { cwd: local });
  return { local, remote };
}

describe("publishBranch", () => {
  it("pushes the current branch with -u origin", async () => {
    const { local, remote } = await makeLocalAndRemote();
    await publishBranch({ cwd: local });
    const heads = await exec("git ls-remote --heads origin main", {
      cwd: local,
    });
    expect(heads.trim().length).toBeGreaterThan(0);
    // upstream is now set
    const upstream = await exec("git rev-parse --abbrev-ref @{u}", {
      cwd: local,
    });
    expect(upstream).toBe("origin/main");
    expect(remote).toBeTruthy();
  });

  it("propagates git's error on detached HEAD (no current-branch detection)", async () => {
    // Note: `git rev-parse --abbrev-ref HEAD` returns the literal "HEAD"
    // in detached state, not an empty string. Substrate matches the
    // extension's existing behavior (no detached-HEAD detection): it
    // attempts `git push -u origin "HEAD"` which git rejects with a
    // refname error. A future hardening pass could detect this and
    // throw a friendlier error, but for the lift we preserve behavior.
    const { local } = await makeLocalAndRemote();
    const sha = await lastCommitSha(local);
    await exec(`git checkout --detach ${sha}`, { cwd: local });
    await expect(publishBranch({ cwd: local })).rejects.toThrow();
  });
});

describe("push", () => {
  it("succeeds with a configured upstream", async () => {
    const { local } = await makeLocalAndRemote();
    await publishBranch({ cwd: local });
    // make a new commit, then push
    await writeAndStage(local, "b.txt", "b");
    await commit({ cwd: local, message: "second" });
    await push({ cwd: local });
    const remoteSha = await exec("git rev-parse origin/main", { cwd: local });
    const localSha = await lastCommitSha(local);
    expect(remoteSha).toBe(localSha);
  });

  it("rejects when no upstream is set", async () => {
    const { local } = await makeLocalAndRemote();
    await expect(push({ cwd: local })).rejects.toThrow();
  });
});

describe("pull", () => {
  it("fast-forwards local from upstream", async () => {
    const { local, remote } = await makeLocalAndRemote();
    await publishBranch({ cwd: local });
    // Second clone simulates a peer pushing a new commit
    const peer = mkTmp();
    await exec(`git clone ${JSON.stringify(remote)} ${JSON.stringify(peer)}`, {
      cwd: os.tmpdir(),
    });
    await configIdentity(peer);
    await writeAndStage(peer, "from-peer.txt", "x");
    await commit({ cwd: peer, message: "peer commit" });
    await push({ cwd: peer });

    await pull({ cwd: local });
    expect(fs.existsSync(path.join(local, "from-peer.txt"))).toBe(true);
  });
});

describe("pushCurrentBranchForPr", () => {
  it("publishes with -u when no upstream", async () => {
    const { local } = await makeLocalAndRemote();
    await pushCurrentBranchForPr({ cwd: local });
    const upstream = await exec("git rev-parse --abbrev-ref @{u}", {
      cwd: local,
    });
    expect(upstream).toBe("origin/main");
  });

  it("plain-pushes when upstream is already set", async () => {
    const { local } = await makeLocalAndRemote();
    await publishBranch({ cwd: local });
    await writeAndStage(local, "b.txt", "b");
    await commit({ cwd: local, message: "second" });
    await pushCurrentBranchForPr({ cwd: local });
    const remoteSha = await exec("git rev-parse origin/main", { cwd: local });
    const localSha = await lastCommitSha(local);
    expect(remoteSha).toBe(localSha);
  });
});

// ---------- branch-tag.ts ----------

describe("deleteLocalBranch", () => {
  it("deletes a merged branch with -d", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "seed" });
    await exec("git checkout -b feature/x", { cwd: dir });
    await exec("git checkout main", { cwd: dir });
    await deleteLocalBranch({ cwd: dir, branch: "feature/x" });
    const list = await exec("git branch", { cwd: dir });
    expect(list).not.toMatch(/feature\/x/);
  });

  it("refuses to -d an unmerged branch without force", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "seed" });
    await exec("git checkout -b feature/y", { cwd: dir });
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "diverge" });
    await exec("git checkout main", { cwd: dir });
    await expect(
      deleteLocalBranch({ cwd: dir, branch: "feature/y" })
    ).rejects.toThrow();
  });

  it("force-deletes an unmerged branch with force: true", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "seed" });
    await exec("git checkout -b feature/y", { cwd: dir });
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "diverge" });
    await exec("git checkout main", { cwd: dir });
    await deleteLocalBranch({ cwd: dir, branch: "feature/y", force: true });
    const list = await exec("git branch", { cwd: dir });
    expect(list).not.toMatch(/feature\/y/);
  });

  for (const protectedName of ["production", "main", "master"]) {
    it(`refuses to delete protected branch "${protectedName}"`, async () => {
      const dir = mkTmp();
      await gitInit(dir);
      await configIdentity(dir);
      await writeAndStage(dir, "a.txt", "a");
      await commit({ cwd: dir, message: "seed" });
      // create branch + checkout away so deleteBranch isn't blocked by "current"
      if (protectedName !== "main") {
        await exec(`git branch ${protectedName}`, { cwd: dir });
      }
      await exec("git checkout -b sandbox", { cwd: dir });
      await expect(
        deleteLocalBranch({ cwd: dir, branch: protectedName, force: true })
      ).rejects.toBeInstanceOf(ProtectedBranchError);
    });
  }

  it("deletes a protected branch with allowProtected: true override", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "seed" });
    await exec("git branch production", { cwd: dir });
    await deleteLocalBranch({
      cwd: dir,
      branch: "production",
      allowProtected: true,
    });
    const list = await exec("git branch", { cwd: dir });
    expect(list).not.toMatch(/production/);
  });
});

describe("renameBranch", () => {
  it("renames the current branch", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "seed" });
    await exec("git checkout -b old-name", { cwd: dir });
    await renameBranch({ cwd: dir, newName: "new-name" });
    const current = await exec("git rev-parse --abbrev-ref HEAD", {
      cwd: dir,
    });
    expect(current).toBe("new-name");
  });
});

describe("mergeBranch", () => {
  it("merges a branch into current", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "seed" });
    await exec("git checkout -b feature/m", { cwd: dir });
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "feature commit" });
    await exec("git checkout main", { cwd: dir });
    await mergeBranch({ cwd: dir, branch: "feature/m" });
    expect(fs.existsSync(path.join(dir, "b.txt"))).toBe(true);
  });
});

describe("createTag", () => {
  it("creates a lightweight tag on HEAD", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "seed" });
    await createTag({ cwd: dir, name: "v1.0" });
    const tags = await exec("git tag", { cwd: dir });
    expect(tags).toMatch(/^v1\.0$/m);
  });

  it("creates an annotated tag with a message", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "seed" });
    await createTag({
      cwd: dir,
      name: "v1.1",
      message: "first annotated tag",
    });
    const out = await exec("git for-each-ref refs/tags/v1.1 --format='%(objecttype) %(contents:subject)'", {
      cwd: dir,
    });
    expect(out).toMatch(/tag first annotated tag/);
  });

  it("tags a specific sha", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "seed" });
    const firstSha = await lastCommitSha(dir);
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "second" });
    await createTag({ cwd: dir, name: "first", sha: firstSha });
    const sha = await exec("git rev-parse first", { cwd: dir });
    expect(sha).toBe(firstSha);
  });
});

describe("deleteTag", () => {
  it("deletes a local tag", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeAndStage(dir, "a.txt", "a");
    await commit({ cwd: dir, message: "seed" });
    await createTag({ cwd: dir, name: "tmp" });
    await deleteTag({ cwd: dir, name: "tmp" });
    const tags = await exec("git tag", { cwd: dir });
    expect(tags).not.toMatch(/tmp/);
  });
});

describe("deleteRemoteTag", () => {
  it("deletes a tag from the remote", async () => {
    const { local } = await makeLocalAndRemote();
    await publishBranch({ cwd: local });
    await createTag({ cwd: local, name: "remote-tag" });
    await exec("git push origin remote-tag", { cwd: local });
    await deleteRemoteTag({ cwd: local, name: "remote-tag" });
    const remoteTags = await exec("git ls-remote --tags origin", {
      cwd: local,
    });
    expect(remoteTags).not.toMatch(/remote-tag/);
  });
});
