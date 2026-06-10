"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/git/index.ts
var git_exports = {};
__export(git_exports, {
  ProtectedBranchError: () => ProtectedBranchError,
  WorkflowScopeError: () => WorkflowScopeError,
  abortRebase: () => abortRebase,
  addRemote: () => addRemote,
  checkoutBranch: () => checkoutBranch,
  checkoutDetached: () => checkoutDetached,
  cherryPick: () => cherryPick,
  cloneRepo: () => cloneRepo,
  commit: () => commit,
  commitAll: () => commitAll,
  commitAllIfChanged: () => commitAllIfChanged,
  commitAllSignedOff: () => commitAllSignedOff,
  commitAmend: () => commitAmend,
  commitAndPush: () => commitAndPush,
  commitSignedOff: () => commitSignedOff,
  createTag: () => createTag,
  createWorktree: () => createWorktree,
  deleteLocalBranch: () => deleteLocalBranch,
  deleteRemoteBranch: () => deleteRemoteBranch,
  deleteRemoteTag: () => deleteRemoteTag,
  deleteTag: () => deleteTag,
  discardAllChanges: () => discardAllChanges,
  fetch: () => fetch,
  getAheadBehind: () => getAheadBehind,
  getBranchesAtCommit: () => getBranchesAtCommit,
  getCommitFiles: () => getCommitFiles,
  getCurrentBranch: () => getCurrentBranch,
  getDiffFiles: () => getDiffFiles,
  getFileAtRef: () => getFileAtRef,
  getGitHubUrl: () => getGitHubUrl,
  getIncomingCommits: () => getIncomingCommits,
  getLogRaw: () => getLogRaw,
  getLogShortstat: () => getLogShortstat,
  getMergeBase: () => getMergeBase,
  getNearestParentName: () => getNearestParentName,
  getOutgoingCommits: () => getOutgoingCommits,
  getOwnerRepo: () => getOwnerRepo,
  getRecentMerges: () => getRecentMerges,
  getRepoRoot: () => getRepoRoot,
  gitInit: () => gitInit,
  hasRemoteBranch: () => hasRemoteBranch,
  hasUpstream: () => hasUpstream,
  isDirty: () => isDirty,
  isRebasing: () => isRebasing,
  listLocalBranches: () => listLocalBranches,
  listMigrationsOnBranch: () => listMigrationsOnBranch,
  listRemoteBranches: () => listRemoteBranches,
  listRemotes: () => listRemotes,
  listTags: () => listTags,
  listWorktrees: () => listWorktrees,
  mergeBranch: () => mergeBranch,
  publishBranch: () => publishBranch,
  pull: () => pull,
  pullFrom: () => pullFrom,
  pullRebase: () => pullRebase,
  push: () => push,
  pushCurrentBranchForPr: () => pushCurrentBranchForPr,
  pushTo: () => pushTo,
  rebaseBranch: () => rebaseBranch,
  removeRemote: () => removeRemote,
  removeWorktree: () => removeWorktree,
  renameBranch: () => renameBranch,
  resolveNearestParent: () => resolveNearestParent,
  revert: () => revert,
  stash: () => stash,
  stashApply: () => stashApply,
  stashDrop: () => stashDrop,
  stashDropAll: () => stashDropAll,
  stashIncludeUntracked: () => stashIncludeUntracked,
  stashList: () => stashList,
  stashPop: () => stashPop,
  stashStaged: () => stashStaged,
  sync: () => sync,
  undoLastCommit: () => undoLastCommit
});
module.exports = __toCommonJS(git_exports);

// scripts/util/exec.ts
var cp = __toESM(require("child_process"), 1);
function shq(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
function exec2(command, opts = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      cwd: opts.cwd,
      timeout: opts.timeout ?? 6e4
    };
    if (opts.env) {
      options.env = { ...process.env, ...opts.env };
    }
    cp.exec(command, options, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message);
        reject(new Error(`${command}: ${msg}`));
        return;
      }
      resolve(String(stdout).trim());
    });
  });
}

// scripts/git/init.ts
async function gitInit(projectDir) {
  await exec2("git init -b main", { cwd: projectDir, timeout: 15e3 });
}

// scripts/git/clone.ts
async function cloneRepo(args) {
  await exec2(`git clone ${shq(args.repoUrl)}`, {
    cwd: args.parentDir,
    timeout: args.timeoutMs ?? 6e4
  });
}

// scripts/git/commit-push.ts
var WorkflowScopeError = class extends Error {
  constructor(projectDir) {
    super(
      `Push rejected: GitHub token lacks the \`workflow\` OAuth scope required for commits touching \`.github/workflows/*\`. The project on disk is fine; only the initial push failed.

To finish:
  1. Re-sign in to GitHub in VS Code and grant the workflow scope (or set      GITHUB_TOKEN to a token with workflow scope)
  2. Then from the project dir:  cd ${projectDir} && git push -u origin main`
    );
    this.name = "WorkflowScopeError";
  }
};
async function commitAndPush(args) {
  await exec2("git add -A", { cwd: args.projectDir });
  await exec2(`git commit -m ${JSON.stringify(args.message)}`, {
    cwd: args.projectDir,
    timeout: 3e4
  });
  if (args.push === false) return;
  const remote = args.remote ?? "origin";
  const branch = args.branch ?? "main";
  try {
    await exec2(`git push -u ${remote} ${branch}`, {
      cwd: args.projectDir,
      timeout: 3e4
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/without `?workflow`? scope|workflow scope/i.test(msg)) {
      throw new WorkflowScopeError(args.projectDir);
    }
    throw err;
  }
}

// scripts/util/parse-owner-repo.ts
function parseOwnerRepo(urlOrSlug) {
  const trimmed = urlOrSlug.trim().replace(/\.git$/, "");
  if (trimmed.includes("/")) {
    const slugMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+)/);
    if (slugMatch) {
      return { owner: slugMatch[1], repo: slugMatch[2] };
    }
    const parts = trimmed.split("/");
    if (parts.length >= 2) {
      return {
        owner: parts[parts.length - 2],
        repo: parts[parts.length - 1]
      };
    }
  }
  throw new Error(`Invalid GitHub repo reference: ${urlOrSlug}`);
}
function formatOwnerRepo(owner, repo) {
  return `${owner}/${repo}`;
}

// scripts/git/remote.ts
async function getGitHubUrl(cwd) {
  try {
    const url = (await exec2("git remote get-url origin", { cwd, timeout: 5e3 })).trim();
    return url.replace(/\.git$/, "").replace(/^git@github\.com:/, "https://github.com/").replace(/^ssh:\/\/git@github\.com\//, "https://github.com/");
  } catch {
    return "";
  }
}
async function getOwnerRepo(cwd) {
  const url = await getGitHubUrl(cwd);
  if (!url) return "";
  try {
    const { owner, repo } = parseOwnerRepo(url);
    return formatOwnerRepo(owner, repo);
  } catch {
    return "";
  }
}
async function addRemote(args) {
  await exec2(`git remote add ${shq(args.name)} ${shq(args.url)}`, {
    cwd: args.cwd
  });
}
async function removeRemote(args) {
  await exec2(`git remote remove ${shq(args.name)}`, { cwd: args.cwd });
}
async function listRemotes(args) {
  try {
    const raw = await exec2("git remote", { cwd: args.cwd });
    return raw ? raw.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}
async function deleteRemoteBranch(args) {
  const remote = args.remote ?? "origin";
  await exec2(`git push ${remote} --delete ${shq(args.branch)}`, {
    cwd: args.cwd
  });
}

// scripts/git/branches.ts
async function currentBranchName(cwd) {
  try {
    return await exec2("git rev-parse --abbrev-ref HEAD", { cwd });
  } catch {
    return "";
  }
}
async function listLocalBranches(args) {
  const { cwd } = args;
  let raw;
  try {
    raw = await exec2(
      'git branch --format="%(refname:short)|%(upstream:short)|%(upstream:track)"',
      { cwd }
    );
  } catch {
    return [];
  }
  if (!raw) return [];
  const current = await currentBranchName(cwd);
  return raw.split("\n").filter(Boolean).map((line) => {
    const [name, tracking, trackInfo] = line.split("|");
    let ahead = 0;
    let behind = 0;
    if (trackInfo) {
      const aheadMatch = trackInfo.match(/ahead (\d+)/);
      const behindMatch = trackInfo.match(/behind (\d+)/);
      if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
      if (behindMatch) behind = parseInt(behindMatch[1], 10);
    }
    return {
      name,
      isCurrent: name === current,
      isRemote: false,
      tracking: tracking || void 0,
      ahead,
      behind
    };
  });
}
async function listRemoteBranches(args) {
  const { cwd, remote = "origin" } = args;
  try {
    const localBranches = await listLocalBranches({ cwd });
    const localNames = new Set(localBranches.map((b) => b.name));
    const raw = await exec2(`git branch -r --format="%(refname:short)"`, {
      cwd
    });
    if (!raw) return [];
    const remotePrefix = `${remote}/`;
    return raw.split("\n").filter(Boolean).filter((name) => !name.includes("HEAD")).map((name) => {
      const shortName = name.startsWith(remotePrefix) ? name.slice(remotePrefix.length) : name;
      return { fullName: name, shortName };
    }).filter(({ shortName }) => !localNames.has(shortName)).map(({ fullName, shortName }) => ({
      name: shortName,
      isCurrent: false,
      isRemote: true,
      tracking: fullName
    }));
  } catch {
    return [];
  }
}
async function hasRemoteBranch(args) {
  const { cwd, branch, remote = "origin" } = args;
  try {
    const out = await exec2(
      `git ls-remote --heads "${remote}" "${branch}"`,
      { cwd }
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

// scripts/git/ancestry.ts
async function resolveNearestParent(args) {
  const { cwd } = args;
  const tipRef = args.tip && args.tip.length > 0 ? args.tip : "HEAD";
  let tipBranchName = "";
  if (args.tip && args.tip.length > 0) {
    tipBranchName = args.tip;
  } else {
    try {
      tipBranchName = await exec2("git rev-parse --abbrev-ref HEAD", { cwd });
    } catch {
    }
  }
  let best;
  for (const c of args.candidates) {
    if (!c || c === tipBranchName) continue;
    try {
      const baseSha = await exec2(`git merge-base "${tipRef}" "${c}"`, { cwd });
      if (!baseSha) continue;
      const tsStr = await exec2(`git log -1 --format=%at "${baseSha}"`, {
        cwd
      });
      const ts = parseInt(tsStr, 10) || 0;
      if (!best || ts > best.ts) {
        best = { name: c, baseSha, ts };
      }
    } catch {
    }
  }
  return best ? { name: best.name, baseSha: best.baseSha } : void 0;
}
async function getNearestParentName(args) {
  const parent = await resolveNearestParent(args);
  return parent?.name ?? "";
}
async function getMergeBase(args) {
  const parent = await resolveNearestParent(args);
  if (parent?.baseSha) return parent.baseSha;
  const { cwd } = args;
  const tipRef = args.tip && args.tip.length > 0 ? args.tip : "HEAD";
  const fallbacks = args.fallbacks ?? ["main", "master"];
  for (const fb of fallbacks) {
    try {
      await exec2(`git rev-parse --verify ${fb}`, { cwd });
      return await exec2(`git merge-base ${fb} ${tipRef}`, { cwd });
    } catch {
    }
  }
  return "";
}

// scripts/git/status.ts
async function hasUpstream(args) {
  try {
    await exec2("git rev-parse --abbrev-ref @{u}", { cwd: args.cwd });
    return true;
  } catch {
    return false;
  }
}
async function getAheadBehind(args) {
  const { cwd } = args;
  try {
    const upstream = await exec2("git rev-parse --abbrev-ref @{u}", { cwd });
    const raw = await exec2("git rev-list --left-right --count HEAD...@{u}", {
      cwd
    });
    const parts = raw.trim().split(/\s+/);
    return {
      ahead: parseInt(parts[0], 10) || 0,
      behind: parseInt(parts[1], 10) || 0,
      upstream
    };
  } catch {
    return { ahead: 0, behind: 0, upstream: "" };
  }
}
async function isDirty(args) {
  try {
    const ignore = args.ignore ?? [];
    let command = "git status --porcelain";
    if (ignore.length > 0) {
      const excludes = ignore.map((p) => shq(`:(exclude)${p.replace(/\/+$/, "")}`)).join(" ");
      command = `git status --porcelain -- . ${excludes}`;
    }
    const out = await exec2(command, { cwd: args.cwd });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

// scripts/git/migrations.ts
var DEFAULT_PATTERN = /^V\d+.*\.sql$/i;
async function listMigrationsOnBranch(args) {
  const { cwd, branch, migrationPath, pattern = DEFAULT_PATTERN } = args;
  if (!branch || !migrationPath) return [];
  try {
    const raw = await exec2(
      `git ls-tree --name-only "${branch}" -- "${migrationPath}/"`,
      { cwd }
    );
    if (!raw) return [];
    return raw.split("\n").map((f) => f.split("/").pop() || f).filter((f) => pattern.test(f)).sort();
  } catch {
    return [];
  }
}

// scripts/git/commits.ts
async function commit(args) {
  if (!args.message.trim()) {
    throw new Error("Commit message is required");
  }
  await exec2(`git commit -m ${shq(args.message)}`, {
    cwd: args.cwd
  });
}
async function commitAll(args) {
  if (!args.message.trim()) {
    throw new Error("Commit message is required");
  }
  await exec2("git add -A", { cwd: args.cwd });
  await exec2(`git commit -m ${shq(args.message)}`, {
    cwd: args.cwd
  });
}
async function commitAllIfChanged(args) {
  if (!args.message.trim()) {
    throw new Error("Commit message is required");
  }
  await exec2("git add -A", { cwd: args.cwd });
  const staged = await exec2("git diff --cached --name-only", { cwd: args.cwd });
  if (!staged.trim()) return false;
  await exec2(`git commit -m ${shq(args.message)}`, { cwd: args.cwd });
  return true;
}
async function commitSignedOff(args) {
  if (!args.message.trim()) {
    throw new Error("Commit message is required");
  }
  await exec2(`git commit -s -m ${shq(args.message)}`, {
    cwd: args.cwd
  });
}
async function commitAllSignedOff(args) {
  if (!args.message.trim()) {
    throw new Error("Commit message is required");
  }
  await exec2("git add -A", { cwd: args.cwd });
  await exec2(`git commit -s -m ${shq(args.message)}`, {
    cwd: args.cwd
  });
}
async function commitAmend(args) {
  if (args.message !== void 0) {
    if (!args.message.trim()) {
      throw new Error("Commit message is required");
    }
    await exec2(
      `git commit --amend -m ${shq(args.message)}`,
      { cwd: args.cwd }
    );
  } else {
    await exec2("git commit --amend --no-edit", { cwd: args.cwd });
  }
}
async function undoLastCommit(args) {
  await exec2("git reset --soft HEAD~1", { cwd: args.cwd });
}
async function discardAllChanges(args) {
  if (args.confirm !== true) {
    throw new Error(
      "discardAllChanges requires confirm: true (destructive operation)"
    );
  }
  await exec2("git checkout -- .", { cwd: args.cwd });
  await exec2("git clean -fd", { cwd: args.cwd });
}

// scripts/git/sync.ts
async function currentBranchName2(cwd) {
  try {
    return await exec2("git rev-parse --abbrev-ref HEAD", { cwd });
  } catch {
    return "";
  }
}
async function push(args) {
  await exec2("git push", { cwd: args.cwd });
}
async function pull(args) {
  await exec2("git pull", { cwd: args.cwd });
}
async function publishBranch(args) {
  const remote = args.remote ?? "origin";
  const branch = await currentBranchName2(args.cwd);
  if (!branch) throw new Error("No current branch");
  await exec2(`git push -u ${remote} ${shq(branch)}`, {
    cwd: args.cwd
  });
}
async function pushCurrentBranchForPr(args) {
  const remote = args.remote ?? "origin";
  const branch = await currentBranchName2(args.cwd);
  if (!branch) throw new Error("No current branch");
  const upstreamSet = await hasUpstream({ cwd: args.cwd });
  if (!upstreamSet) {
    await exec2(`git push -u ${remote} ${shq(branch)}`, {
      cwd: args.cwd
    });
  } else {
    await exec2("git push", { cwd: args.cwd });
  }
}
async function fetch(args) {
  const parts = ["git fetch"];
  if (args.prune) parts.push("--prune");
  if (args.all) parts.push("--all");
  await exec2(parts.join(" "), { cwd: args.cwd });
}
async function pullFrom(args) {
  await exec2(`git pull ${shq(args.remote)} ${shq(args.branch)}`, {
    cwd: args.cwd
  });
}
async function pushTo(args) {
  await exec2(`git push ${shq(args.remote)} ${shq(args.branch)}`, {
    cwd: args.cwd
  });
}
async function sync(args) {
  await exec2("git pull", { cwd: args.cwd });
  await exec2("git push", { cwd: args.cwd });
}

// scripts/git/branch-tag.ts
var PROTECTED_BRANCHES = /* @__PURE__ */ new Set(["production", "main", "master"]);
var ProtectedBranchError = class extends Error {
  constructor(branch) {
    super(
      `Refusing to delete protected branch "${branch}". Pass allowProtected: true to override (only after explicit user confirmation).`
    );
    this.name = "ProtectedBranchError";
  }
};
async function deleteLocalBranch(args) {
  if (PROTECTED_BRANCHES.has(args.branch) && !args.allowProtected) {
    throw new ProtectedBranchError(args.branch);
  }
  const flag = args.force ? "-D" : "-d";
  await exec2(`git branch ${flag} ${shq(args.branch)}`, {
    cwd: args.cwd
  });
}
async function renameBranch(args) {
  await exec2(`git branch -m ${shq(args.newName)}`, { cwd: args.cwd });
}
async function mergeBranch(args) {
  await exec2(`git merge ${shq(args.branch)}`, { cwd: args.cwd });
}
async function createTag(args) {
  const parts = ["git", "tag"];
  if (args.message) parts.push("-a");
  parts.push(shq(args.name));
  if (args.message) parts.push("-m", shq(args.message));
  if (args.sha) parts.push(shq(args.sha));
  await exec2(parts.join(" "), { cwd: args.cwd });
}
async function deleteTag(args) {
  await exec2(`git tag -d ${shq(args.name)}`, { cwd: args.cwd });
}
async function deleteRemoteTag(args) {
  const remote = args.remote ?? "origin";
  await exec2(`git push ${remote} --delete ${shq(`refs/tags/${args.name}`)}`, {
    cwd: args.cwd
  });
}

// scripts/git/stash.ts
function maybeMessageFlag(message) {
  return message ? ` -m ${shq(message)}` : "";
}
async function stash(args) {
  await exec2(`git stash push${maybeMessageFlag(args.message)}`, {
    cwd: args.cwd
  });
}
async function stashStaged(args) {
  await exec2(`git stash push --staged${maybeMessageFlag(args.message)}`, {
    cwd: args.cwd
  });
}
async function stashIncludeUntracked(args) {
  await exec2(
    `git stash push --include-untracked${maybeMessageFlag(args.message)}`,
    { cwd: args.cwd }
  );
}
async function stashList(args) {
  try {
    const raw = await exec2("git stash list", { cwd: args.cwd });
    return raw ? raw.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}
async function stashApply(args) {
  const index = args.index ?? 0;
  await exec2(`git stash apply stash@{${index}}`, { cwd: args.cwd });
}
async function stashPop(args) {
  await exec2("git stash pop", { cwd: args.cwd });
}
async function stashDrop(args) {
  const index = args.index ?? 0;
  await exec2(`git stash drop stash@{${index}}`, { cwd: args.cwd });
}
async function stashDropAll(args) {
  await exec2("git stash clear", { cwd: args.cwd });
}

// scripts/git/rebase.ts
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
async function abortRebase(args) {
  await exec2("git rebase --abort", { cwd: args.cwd });
}
async function isRebasing(args) {
  try {
    return fs.existsSync(path.join(args.cwd, ".git/rebase-merge")) || fs.existsSync(path.join(args.cwd, ".git/rebase-apply"));
  } catch {
    return false;
  }
}
async function rebaseBranch(args) {
  await exec2(`git rebase ${shq(args.branch)}`, { cwd: args.cwd });
}
async function pullRebase(args) {
  await exec2("git pull --rebase", { cwd: args.cwd });
}

// scripts/git/worktree.ts
async function createWorktree(args) {
  await exec2(
    `git worktree add ${shq(args.path)} -b ${shq(args.branch)}`,
    { cwd: args.cwd }
  );
}
async function listWorktrees(args) {
  try {
    const raw = await exec2("git worktree list", { cwd: args.cwd });
    return raw ? raw.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}
async function removeWorktree(args) {
  await exec2(`git worktree remove ${shq(args.path)}`, { cwd: args.cwd });
}

// scripts/git/log.ts
async function getLogRaw(args) {
  try {
    return await exec2(
      `git log --date-order --format=${shq(args.format)} -${args.limit}${args.refArgs}`,
      { cwd: args.cwd }
    );
  } catch {
    return "";
  }
}
async function getLogShortstat(args) {
  try {
    return await exec2(
      `git log --date-order --format=${shq(args.format)} --shortstat -${args.limit}${args.refArgs}`,
      { cwd: args.cwd }
    );
  } catch {
    return "";
  }
}
async function getOutgoingCommits(args) {
  try {
    const raw = await exec2("git log --oneline @{u}..HEAD", { cwd: args.cwd });
    return raw.split("\n").filter(Boolean).map((l) => l.split(" ")[0]);
  } catch {
    return [];
  }
}
async function getIncomingCommits(args) {
  try {
    const raw = await exec2("git log --oneline HEAD..@{u}", { cwd: args.cwd });
    return raw.split("\n").filter(Boolean).map((l) => l.split(" ")[0]);
  } catch {
    return [];
  }
}
async function getRecentMerges(args) {
  const limit = args.limit ?? 5;
  try {
    const raw = await exec2(`git log --merges --oneline -${limit}`, {
      cwd: args.cwd
    });
    return raw.split("\n").filter(Boolean).map((line) => {
      const sp = line.indexOf(" ");
      return { sha: line.substring(0, sp), message: line.substring(sp + 1) };
    });
  } catch {
    return [];
  }
}
async function getBranchesAtCommit(args) {
  try {
    const raw = await exec2(
      `git branch -a --points-at ${shq(args.sha)} --format=${shq("%(refname:short)")}`,
      { cwd: args.cwd }
    );
    return raw.trim().split("\n").filter(Boolean).filter((b) => !b.includes("HEAD") && b !== "origin");
  } catch {
    return [];
  }
}
async function getCommitFiles(args) {
  try {
    let raw = await exec2(
      `git diff-tree --no-commit-id --name-status -r ${shq(args.sha)}`,
      { cwd: args.cwd }
    );
    if (!raw.trim()) {
      try {
        raw = await exec2(
          `git diff --name-status ${shq(`${args.sha}^1`)} ${shq(args.sha)}`,
          { cwd: args.cwd }
        );
      } catch {
        return [];
      }
    }
    return raw.split("\n").filter(Boolean).map((line) => {
      const parts = line.split("	");
      return { status: parts[0][0], path: parts[parts.length - 1] };
    });
  } catch {
    return [];
  }
}
async function getDiffFiles(args) {
  try {
    const cmd = args.toRef ? `git diff --name-status ${shq(args.fromRef)} ${shq(args.toRef)}` : `git diff --name-status ${shq(args.fromRef)}`;
    const raw = await exec2(cmd, { cwd: args.cwd });
    return raw.split("\n").filter(Boolean).map((line) => {
      const parts = line.split("	");
      return { status: parts[0][0], path: parts[parts.length - 1] };
    });
  } catch {
    return [];
  }
}

// scripts/git/inspect.ts
async function getCurrentBranch(args) {
  try {
    const name = await exec2("git rev-parse --abbrev-ref HEAD", {
      cwd: args.cwd
    });
    return name === "HEAD" ? "" : name;
  } catch {
    return "";
  }
}
async function getRepoRoot(args) {
  try {
    return await exec2("git rev-parse --show-toplevel", { cwd: args.cwd });
  } catch {
    return "";
  }
}
async function getFileAtRef(args) {
  try {
    return await exec2(
      `git show ${shq(`${args.ref}:${args.filePath}`)}`,
      { cwd: args.cwd }
    );
  } catch {
    return "";
  }
}
async function listTags(args) {
  try {
    const raw = await exec2("git tag -l", { cwd: args.cwd });
    return raw ? raw.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

// scripts/git/mutation.ts
async function checkoutBranch(args) {
  const flag = args.create ? "-b " : "";
  const sp = args.startPoint ? ` ${shq(args.startPoint)}` : "";
  await exec2(`git checkout ${flag}${shq(args.branch)}${sp}`, {
    cwd: args.cwd
  });
}
async function checkoutDetached(args) {
  await exec2(`git checkout --detach ${shq(args.sha)}`, { cwd: args.cwd });
}
async function revert(args) {
  const parents = (await exec2(`git rev-parse ${shq(`${args.sha}^@`)}`, { cwd: args.cwd })).trim().split("\n").filter(Boolean);
  const mFlag = parents.length > 1 ? " -m 1" : "";
  await exec2(`git revert --no-edit${mFlag} ${shq(args.sha)}`, {
    cwd: args.cwd
  });
}
async function cherryPick(args) {
  await exec2(`git cherry-pick ${shq(args.sha)}`, { cwd: args.cwd });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ProtectedBranchError,
  WorkflowScopeError,
  abortRebase,
  addRemote,
  checkoutBranch,
  checkoutDetached,
  cherryPick,
  cloneRepo,
  commit,
  commitAll,
  commitAllIfChanged,
  commitAllSignedOff,
  commitAmend,
  commitAndPush,
  commitSignedOff,
  createTag,
  createWorktree,
  deleteLocalBranch,
  deleteRemoteBranch,
  deleteRemoteTag,
  deleteTag,
  discardAllChanges,
  fetch,
  getAheadBehind,
  getBranchesAtCommit,
  getCommitFiles,
  getCurrentBranch,
  getDiffFiles,
  getFileAtRef,
  getGitHubUrl,
  getIncomingCommits,
  getLogRaw,
  getLogShortstat,
  getMergeBase,
  getNearestParentName,
  getOutgoingCommits,
  getOwnerRepo,
  getRecentMerges,
  getRepoRoot,
  gitInit,
  hasRemoteBranch,
  hasUpstream,
  isDirty,
  isRebasing,
  listLocalBranches,
  listMigrationsOnBranch,
  listRemoteBranches,
  listRemotes,
  listTags,
  listWorktrees,
  mergeBranch,
  publishBranch,
  pull,
  pullFrom,
  pullRebase,
  push,
  pushCurrentBranchForPr,
  pushTo,
  rebaseBranch,
  removeRemote,
  removeWorktree,
  renameBranch,
  resolveNearestParent,
  revert,
  stash,
  stashApply,
  stashDrop,
  stashDropAll,
  stashIncludeUntracked,
  stashList,
  stashPop,
  stashStaged,
  sync,
  undoLastCommit
});
//# sourceMappingURL=index.cjs.map