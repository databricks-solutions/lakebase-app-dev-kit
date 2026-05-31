// BDD coverage for the P6 substrate lift: stash.ts, rebase.ts,
// worktree.ts, remote.ts (additions), sync.ts (additions), log.ts,
// inspect.ts, mutation.ts. Each describe block uses an isolated temp
// git repo (plus a bare-remote pair where network ops are exercised).

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { gitInit } from "../../scripts/git/init.js";
import {
  stash,
  stashStaged,
  stashIncludeUntracked,
  stashList,
  stashApply,
  stashPop,
  stashDrop,
  stashDropAll,
} from "../../scripts/git/stash.js";
import {
  abortRebase,
  isRebasing,
  rebaseBranch,
  pullRebase,
} from "../../scripts/git/rebase.js";
import {
  createWorktree,
  listWorktrees,
  removeWorktree,
} from "../../scripts/git/worktree.js";
import {
  addRemote,
  removeRemote,
  listRemotes,
  deleteRemoteBranch,
} from "../../scripts/git/remote.js";
import {
  fetch as gitFetch,
  pullFrom,
  pushTo,
  sync as gitSync,
} from "../../scripts/git/sync.js";
import {
  getLogRaw,
  getLogShortstat,
  getOutgoingCommits,
  getIncomingCommits,
  getRecentMerges,
  getBranchesAtCommit,
  getCommitFiles,
  getDiffFiles,
} from "../../scripts/git/log.js";
import {
  getCurrentBranch,
  getRepoRoot,
  getFileAtRef,
  listTags,
} from "../../scripts/git/inspect.js";
import {
  checkoutBranch,
  checkoutDetached,
  revert,
  cherryPick,
} from "../../scripts/git/mutation.js";
import { commit, commitAll } from "../../scripts/git/commits.js";
import { publishBranch } from "../../scripts/git/sync.js";
import { createTag } from "../../scripts/git/branch-tag.js";
import { exec, shq } from "../../scripts/util/exec.js";

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-p6-"));
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
  await exec(`git add ${shq(name)}`, { cwd });
}

async function seed(cwd: string, file = "a.txt"): Promise<string> {
  await gitInit(cwd);
  await configIdentity(cwd);
  await writeAndStage(cwd, file, "a");
  await commit({ cwd, message: "seed" });
  return await exec("git rev-parse HEAD", { cwd });
}

async function makeLocalAndRemote(): Promise<{
  local: string;
  remote: string;
}> {
  const remote = mkTmp();
  await exec("git init --bare -b main", { cwd: remote });
  const local = mkTmp();
  await seed(local);
  await exec(`git remote add origin ${shq(remote)}`, { cwd: local });
  return { local, remote };
}

// ---------- stash.ts ----------

describe("stash", () => {
  it("stashes tracked changes with a message", async () => {
    const dir = mkTmp();
    await seed(dir);
    fs.writeFileSync(path.join(dir, "a.txt"), "modified");
    await stash({ cwd: dir, message: "wip change" });
    const list = await stashList({ cwd: dir });
    expect(list.length).toBe(1);
    expect(list[0]).toMatch(/wip change/);
  });

  it("stashes without a message when none provided", async () => {
    const dir = mkTmp();
    await seed(dir);
    fs.writeFileSync(path.join(dir, "a.txt"), "modified");
    await stash({ cwd: dir });
    const list = await stashList({ cwd: dir });
    expect(list.length).toBe(1);
  });
});

describe("stashStaged", () => {
  it("stashes only the index, leaving working-tree-only changes in place", async () => {
    const dir = mkTmp();
    await seed(dir);
    // staged change on one file
    fs.writeFileSync(path.join(dir, "staged-file.txt"), "staged-content");
    await exec("git add -A", { cwd: dir });
    // working-tree-only change on a different file (untracked)
    fs.writeFileSync(path.join(dir, "wt-only.txt"), "wt-content");
    await stashStaged({ cwd: dir });
    // After stashStaged: staged file is gone (stashed), wt-only file remains
    expect(fs.existsSync(path.join(dir, "staged-file.txt"))).toBe(false);
    expect(fs.readFileSync(path.join(dir, "wt-only.txt"), "utf8")).toBe(
      "wt-content"
    );
    const list = await stashList({ cwd: dir });
    expect(list.length).toBe(1);
  });
});

describe("stashIncludeUntracked", () => {
  it("captures untracked files", async () => {
    const dir = mkTmp();
    await seed(dir);
    fs.writeFileSync(path.join(dir, "untracked.txt"), "x");
    await stashIncludeUntracked({ cwd: dir, message: "with-untracked" });
    expect(fs.existsSync(path.join(dir, "untracked.txt"))).toBe(false);
    const list = await stashList({ cwd: dir });
    expect(list[0]).toMatch(/with-untracked/);
  });
});

describe("stashApply + stashDrop", () => {
  it("apply restores changes without removing the stash; drop removes it", async () => {
    const dir = mkTmp();
    await seed(dir);
    fs.writeFileSync(path.join(dir, "a.txt"), "v2");
    await stash({ cwd: dir, message: "v2-change" });
    expect(fs.readFileSync(path.join(dir, "a.txt"), "utf8")).toBe("a");
    await stashApply({ cwd: dir });
    expect(fs.readFileSync(path.join(dir, "a.txt"), "utf8")).toBe("v2");
    expect((await stashList({ cwd: dir })).length).toBe(1);
    await stashDrop({ cwd: dir });
    expect((await stashList({ cwd: dir })).length).toBe(0);
  });
});

describe("stashPop", () => {
  it("applies AND drops the most recent stash", async () => {
    const dir = mkTmp();
    await seed(dir);
    fs.writeFileSync(path.join(dir, "a.txt"), "popped");
    await stash({ cwd: dir });
    await stashPop({ cwd: dir });
    expect(fs.readFileSync(path.join(dir, "a.txt"), "utf8")).toBe("popped");
    expect((await stashList({ cwd: dir })).length).toBe(0);
  });
});

describe("stashDropAll", () => {
  it("clears every stash entry", async () => {
    const dir = mkTmp();
    await seed(dir);
    fs.writeFileSync(path.join(dir, "a.txt"), "v2");
    await stash({ cwd: dir, message: "1" });
    fs.writeFileSync(path.join(dir, "a.txt"), "v3");
    await stash({ cwd: dir, message: "2" });
    expect((await stashList({ cwd: dir })).length).toBe(2);
    await stashDropAll({ cwd: dir });
    expect((await stashList({ cwd: dir })).length).toBe(0);
  });
});

// ---------- rebase.ts ----------

describe("isRebasing", () => {
  it("returns false on a clean repo", async () => {
    const dir = mkTmp();
    await seed(dir);
    expect(await isRebasing({ cwd: dir })).toBe(false);
  });

  it("returns false on a non-git directory", async () => {
    const dir = mkTmp();
    expect(await isRebasing({ cwd: dir })).toBe(false);
  });
});

describe("rebaseBranch", () => {
  it("fast-forward-rebases the current branch onto target", async () => {
    const dir = mkTmp();
    await seed(dir);
    // make main advance
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "main-2" });
    // branch off earlier point and rebase onto main
    const headSha = await exec("git rev-parse HEAD", { cwd: dir });
    await exec(`git checkout -b feature HEAD~1`, { cwd: dir });
    await writeAndStage(dir, "c.txt", "c");
    await commit({ cwd: dir, message: "feature-1" });
    await rebaseBranch({ cwd: dir, branch: "main" });
    // After rebase, feature should contain b.txt + c.txt
    expect(fs.existsSync(path.join(dir, "b.txt"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "c.txt"))).toBe(true);
    expect(headSha).toBeTruthy();
  });
});

// ---------- worktree.ts ----------

describe("worktree", () => {
  it("creates, lists, and removes a worktree", async () => {
    const dir = mkTmp();
    await seed(dir);
    const wtPath = path.join(mkTmp(), "wt");
    await createWorktree({
      cwd: dir,
      path: wtPath,
      branch: "feature/wt",
    });
    expect(fs.existsSync(wtPath)).toBe(true);
    const list = await listWorktrees({ cwd: dir });
    expect(list.some((l) => l.includes(wtPath))).toBe(true);
    await removeWorktree({ cwd: dir, path: wtPath });
    expect(fs.existsSync(wtPath)).toBe(false);
  });

  it("listWorktrees returns [] on non-git cwd", async () => {
    const dir = mkTmp();
    expect(await listWorktrees({ cwd: dir })).toEqual([]);
  });
});

// ---------- remote.ts (additions) ----------

describe("addRemote / removeRemote / listRemotes", () => {
  it("adds a remote, lists it, removes it", async () => {
    const dir = mkTmp();
    await seed(dir);
    expect(await listRemotes({ cwd: dir })).toEqual([]);
    await addRemote({
      cwd: dir,
      name: "upstream",
      url: "https://github.com/o/r.git",
    });
    expect(await listRemotes({ cwd: dir })).toEqual(["upstream"]);
    await removeRemote({ cwd: dir, name: "upstream" });
    expect(await listRemotes({ cwd: dir })).toEqual([]);
  });
});

describe("deleteRemoteBranch", () => {
  it("deletes a branch on the remote", async () => {
    const { local, remote } = await makeLocalAndRemote();
    await publishBranch({ cwd: local });
    await exec("git checkout -b feature/x", { cwd: local });
    await writeAndStage(local, "x.txt", "x");
    await commit({ cwd: local, message: "x" });
    await exec("git push -u origin feature/x", { cwd: local });
    // Remote now has main + feature/x; delete feature/x
    await deleteRemoteBranch({ cwd: local, branch: "feature/x" });
    const heads = await exec(`git ls-remote --heads ${shq(remote)}`, {
      cwd: local,
    });
    expect(heads).not.toMatch(/feature\/x/);
  });
});

// ---------- sync.ts (additions) ----------

describe("fetch", () => {
  it("fetches updates from origin", async () => {
    const { local, remote } = await makeLocalAndRemote();
    await publishBranch({ cwd: local });
    // peer pushes a new commit via a second clone
    const peer = mkTmp();
    await exec(`git clone ${shq(remote)} ${shq(peer)}`, { cwd: os.tmpdir() });
    await configIdentity(peer);
    await writeAndStage(peer, "from-peer.txt", "x");
    await commit({ cwd: peer, message: "peer" });
    await exec("git push", { cwd: peer });

    await gitFetch({ cwd: local });
    const peerSha = await exec("git rev-parse HEAD", { cwd: peer });
    const localOriginSha = await exec("git rev-parse origin/main", {
      cwd: local,
    });
    expect(localOriginSha).toBe(peerSha);
  });

  it("supports prune + all flags together", async () => {
    const { local } = await makeLocalAndRemote();
    await publishBranch({ cwd: local });
    // Should not throw with both flags
    await gitFetch({ cwd: local, prune: true, all: true });
  });
});

describe("pullFrom / pushTo", () => {
  it("pull from a specific remote+branch and push to a specific remote+branch", async () => {
    const { local, remote } = await makeLocalAndRemote();
    await pushTo({ cwd: local, remote: "origin", branch: "main" });
    // Verify push: remote has the seed
    const heads = await exec(`git ls-remote --heads ${shq(remote)} main`, {
      cwd: local,
    });
    expect(heads.trim().length).toBeGreaterThan(0);
    // Now pull explicitly
    await pullFrom({ cwd: local, remote: "origin", branch: "main" });
  });
});

describe("sync", () => {
  it("pulls then pushes (composite)", async () => {
    const { local } = await makeLocalAndRemote();
    await publishBranch({ cwd: local });
    await writeAndStage(local, "b.txt", "b");
    await commit({ cwd: local, message: "second" });
    await gitSync({ cwd: local });
    const remoteSha = await exec("git rev-parse origin/main", { cwd: local });
    const localSha = await exec("git rev-parse HEAD", { cwd: local });
    expect(remoteSha).toBe(localSha);
  });
});

// ---------- log.ts ----------

describe("getLogRaw / getLogShortstat", () => {
  it("returns formatted log output", async () => {
    const dir = mkTmp();
    await seed(dir);
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "second" });
    const raw = await getLogRaw({
      cwd: dir,
      format: "%s",
      limit: 10,
      refArgs: "",
    });
    const lines = raw.split("\n").filter(Boolean);
    expect(lines).toContain("seed");
    expect(lines).toContain("second");
  });

  it("getLogShortstat appends per-commit stats", async () => {
    const dir = mkTmp();
    await seed(dir);
    const raw = await getLogShortstat({
      cwd: dir,
      format: "%s",
      limit: 5,
      refArgs: "",
    });
    expect(raw).toMatch(/\d+ insertion/);
  });

  it("returns empty string on non-git cwd", async () => {
    const dir = mkTmp();
    const out = await getLogRaw({
      cwd: dir,
      format: "%s",
      limit: 1,
      refArgs: "",
    });
    expect(out).toBe("");
  });
});

describe("getOutgoingCommits / getIncomingCommits", () => {
  it("returns ahead/behind commit shas relative to upstream", async () => {
    const { local } = await makeLocalAndRemote();
    await publishBranch({ cwd: local });
    await writeAndStage(local, "b.txt", "b");
    await commit({ cwd: local, message: "ahead" });
    const out = await getOutgoingCommits({ cwd: local });
    expect(out.length).toBe(1);
    const inc = await getIncomingCommits({ cwd: local });
    expect(inc.length).toBe(0);
  });

  it("returns [] when no upstream is configured", async () => {
    const dir = mkTmp();
    await seed(dir);
    expect(await getOutgoingCommits({ cwd: dir })).toEqual([]);
    expect(await getIncomingCommits({ cwd: dir })).toEqual([]);
  });
});

describe("getRecentMerges", () => {
  it("returns merge commits with sha + message", async () => {
    const dir = mkTmp();
    await seed(dir);
    await exec("git checkout -b feature/m", { cwd: dir });
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "feature-1" });
    await exec("git checkout main", { cwd: dir });
    // force a merge commit (not fast-forward)
    await exec("git merge --no-ff -m 'merge feature/m' feature/m", {
      cwd: dir,
    });
    const merges = await getRecentMerges({ cwd: dir });
    expect(merges.length).toBe(1);
    expect(merges[0].message).toContain("merge feature/m");
  });
});

describe("getBranchesAtCommit", () => {
  it("returns branches pointing at a given sha", async () => {
    const dir = mkTmp();
    await seed(dir);
    const sha = await exec("git rev-parse HEAD", { cwd: dir });
    await exec("git checkout -b alt", { cwd: dir });
    const branches = await getBranchesAtCommit({ cwd: dir, sha });
    expect(branches.sort()).toEqual(["alt", "main"]);
  });
});

describe("getCommitFiles", () => {
  it("returns files changed by a non-merge commit", async () => {
    const dir = mkTmp();
    await seed(dir);
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "add b" });
    const sha = await exec("git rev-parse HEAD", { cwd: dir });
    const files = await getCommitFiles({ cwd: dir, sha });
    expect(files).toEqual([{ status: "A", path: "b.txt" }]);
  });
});

describe("getDiffFiles", () => {
  it("returns files changed between two refs", async () => {
    const dir = mkTmp();
    await seed(dir);
    const oldSha = await exec("git rev-parse HEAD", { cwd: dir });
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "add b" });
    const files = await getDiffFiles({
      cwd: dir,
      fromRef: oldSha,
      toRef: "HEAD",
    });
    expect(files).toEqual([{ status: "A", path: "b.txt" }]);
  });

  it("returns files between a ref and working tree when toRef is null", async () => {
    const dir = mkTmp();
    await seed(dir);
    fs.writeFileSync(path.join(dir, "a.txt"), "modified");
    const files = await getDiffFiles({
      cwd: dir,
      fromRef: "HEAD",
      toRef: null,
    });
    expect(files).toEqual([{ status: "M", path: "a.txt" }]);
  });
});

// ---------- inspect.ts ----------

describe("getCurrentBranch", () => {
  it("returns the current branch name", async () => {
    const dir = mkTmp();
    await seed(dir);
    expect(await getCurrentBranch({ cwd: dir })).toBe("main");
  });

  it("returns empty string on detached HEAD", async () => {
    const dir = mkTmp();
    await seed(dir);
    const sha = await exec("git rev-parse HEAD", { cwd: dir });
    await exec(`git checkout --detach ${sha}`, { cwd: dir });
    expect(await getCurrentBranch({ cwd: dir })).toBe("");
  });

  it("returns empty string on non-git cwd", async () => {
    const dir = mkTmp();
    expect(await getCurrentBranch({ cwd: dir })).toBe("");
  });
});

describe("getRepoRoot", () => {
  it("returns the absolute repo root path", async () => {
    const dir = mkTmp();
    await seed(dir);
    const root = await getRepoRoot({ cwd: dir });
    // macOS may resolve /tmp -> /private/tmp; compare via realpath
    expect(fs.realpathSync(root)).toBe(fs.realpathSync(dir));
  });

  it("returns empty string on non-git cwd", async () => {
    const dir = mkTmp();
    expect(await getRepoRoot({ cwd: dir })).toBe("");
  });
});

describe("getFileAtRef", () => {
  it("returns the file contents at the given ref", async () => {
    const dir = mkTmp();
    await seed(dir, "hello.txt");
    fs.writeFileSync(path.join(dir, "hello.txt"), "modified");
    const contents = await getFileAtRef({
      cwd: dir,
      ref: "HEAD",
      filePath: "hello.txt",
    });
    expect(contents).toBe("a");
  });

  it("returns empty string for a file that didn't exist at that ref", async () => {
    const dir = mkTmp();
    await seed(dir);
    const out = await getFileAtRef({
      cwd: dir,
      ref: "HEAD",
      filePath: "never-existed.txt",
    });
    expect(out).toBe("");
  });
});

describe("listTags", () => {
  it("returns local tag names sorted by git's default order", async () => {
    const dir = mkTmp();
    await seed(dir);
    await createTag({ cwd: dir, name: "v0.1" });
    await createTag({ cwd: dir, name: "v0.2" });
    const tags = await listTags({ cwd: dir });
    expect(tags.sort()).toEqual(["v0.1", "v0.2"]);
  });

  it("returns [] when no tags exist", async () => {
    const dir = mkTmp();
    await seed(dir);
    expect(await listTags({ cwd: dir })).toEqual([]);
  });
});

// ---------- mutation.ts ----------

describe("checkoutBranch", () => {
  it("checks out an existing branch", async () => {
    const dir = mkTmp();
    await seed(dir);
    await exec("git branch other", { cwd: dir });
    await checkoutBranch({ cwd: dir, branch: "other" });
    expect(await getCurrentBranch({ cwd: dir })).toBe("other");
  });

  it("creates and checks out a new branch with create: true", async () => {
    const dir = mkTmp();
    await seed(dir);
    await checkoutBranch({ cwd: dir, branch: "feature/new", create: true });
    expect(await getCurrentBranch({ cwd: dir })).toBe("feature/new");
  });

  it("creates a new branch from an explicit start point", async () => {
    const dir = mkTmp();
    await seed(dir);
    const oldSha = await exec("git rev-parse HEAD", { cwd: dir });
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "second" });
    await checkoutBranch({
      cwd: dir,
      branch: "feature/at-old",
      create: true,
      startPoint: oldSha,
    });
    const headSha = await exec("git rev-parse HEAD", { cwd: dir });
    expect(headSha).toBe(oldSha);
  });
});

describe("checkoutDetached", () => {
  it("checks out a specific sha in detached HEAD state", async () => {
    const dir = mkTmp();
    await seed(dir);
    const sha = await exec("git rev-parse HEAD", { cwd: dir });
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "second" });
    await checkoutDetached({ cwd: dir, sha });
    expect(await getCurrentBranch({ cwd: dir })).toBe("");
  });
});

describe("revert", () => {
  it("reverts a non-merge commit", async () => {
    const dir = mkTmp();
    await seed(dir);
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "add b" });
    const bSha = await exec("git rev-parse HEAD", { cwd: dir });
    await revert({ cwd: dir, sha: bSha });
    expect(fs.existsSync(path.join(dir, "b.txt"))).toBe(false);
  });

  it("reverts a merge commit with auto -m 1", async () => {
    const dir = mkTmp();
    await seed(dir);
    await exec("git checkout -b feature/m", { cwd: dir });
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "feature" });
    await exec("git checkout main", { cwd: dir });
    await exec("git merge --no-ff -m 'merge' feature/m", { cwd: dir });
    const mergeSha = await exec("git rev-parse HEAD", { cwd: dir });
    // Should NOT throw (auto-detects merge -> uses -m 1)
    await revert({ cwd: dir, sha: mergeSha });
    expect(fs.existsSync(path.join(dir, "b.txt"))).toBe(false);
  });
});

describe("cherryPick", () => {
  it("cherry-picks a commit onto the current branch", async () => {
    const dir = mkTmp();
    await seed(dir);
    await exec("git checkout -b source", { cwd: dir });
    await writeAndStage(dir, "b.txt", "b");
    await commit({ cwd: dir, message: "source-1" });
    const sha = await exec("git rev-parse HEAD", { cwd: dir });
    await exec("git checkout main", { cwd: dir });
    await cherryPick({ cwd: dir, sha });
    expect(fs.existsSync(path.join(dir, "b.txt"))).toBe(true);
  });
});
