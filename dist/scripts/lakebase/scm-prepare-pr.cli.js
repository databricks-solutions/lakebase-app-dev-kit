#!/usr/bin/env node

// scripts/lakebase/scm-prepare-pr.cli.ts
import * as path2 from "path";

// scripts/util/cli-entry.ts
import { realpathSync } from "fs";
import { fileURLToPath } from "url";
function isCliEntry(importMetaUrl) {
  const invokedRaw = process.argv[1];
  if (!invokedRaw) return false;
  let invokedResolved;
  let moduleResolved;
  try {
    invokedResolved = realpathSync(invokedRaw);
  } catch {
    return false;
  }
  try {
    moduleResolved = realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
  return invokedResolved === moduleResolved;
}

// scripts/util/exec.ts
import * as cp from "child_process";
function shq(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
function exec2(command, opts = {}) {
  return new Promise((resolve2, reject) => {
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
      resolve2(String(stdout).trim());
    });
  });
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

// scripts/git/status.ts
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
    const raw = (await exec2("git remote get-url origin", { cwd, timeout: 5e3 })).trim();
    if (!raw) {
      return "";
    }
    const url = raw.replace(/\.git$/, "");
    const scp = url.match(/^(?:[^@/]+@)?[^/:]+:([^/].*)$/);
    if (scp) {
      return `https://github.com/${scp[1]}`;
    }
    const ssh = url.match(/^ssh:\/\/(?:[^@/]+@)?[^/]+\/(.+)$/);
    if (ssh) {
      return `https://github.com/${ssh[1]}`;
    }
    const https = url.match(/^https?:\/\/[^/]+\/(.+)$/);
    if (https) {
      return `https://github.com/${https[1]}`;
    }
    return "";
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

// scripts/github/pr.ts
import { Octokit, RequestError } from "octokit";

// scripts/github/auth.ts
import { execFileSync } from "child_process";
var GITHUB_SCOPES = ["repo", "workflow", "delete_repo"];
async function resolveGitHubToken(scopes = GITHUB_SCOPES) {
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const fromVsCode = await tryVsCodeSession({ scopes });
  if (fromVsCode) return fromVsCode;
  const fromGh = tryGhAuthToken();
  if (fromGh) return fromGh;
  throw new Error(
    "No GitHub auth available. Set GITHUB_TOKEN, sign in to GitHub in VS Code, or run `gh auth login`."
  );
}
async function tryVsCodeSession(opts = {}) {
  const scopes = opts.scopes ?? GITHUB_SCOPES;
  try {
    const vscode = await import("vscode");
    if (!vscode?.authentication?.getSession) return void 0;
    const session = await vscode.authentication.getSession("github", [...scopes], {
      createIfNone: !!opts.createIfNone
    });
    return session?.accessToken;
  } catch {
    return void 0;
  }
}
function tryGhAuthToken() {
  try {
    const raw = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5e3
    });
    const token = raw.trim();
    return token || void 0;
  } catch {
    return void 0;
  }
}

// scripts/lakebase/branch-delete.ts
import { execFile as execFile2 } from "child_process";
import { promisify as promisify2 } from "util";

// scripts/lakebase/branch-utils.ts
import { execFile } from "child_process";
import { promisify } from "util";

// scripts/lakebase/kit-config.ts
function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}
var DAY_MS = 24 * 60 * 60 * 1e3;
var KIT_TIMEOUTS = {
  cliDefault: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_DEFAULT_MS", 3e4),
  cliCreateBranch: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_CREATE_BRANCH_MS", 6e4),
  cliCreateEndpoint: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_CREATE_ENDPOINT_MS", 6e4),
  readyWait: intFromEnv("LAKEBASE_KIT_TIMEOUT_READY_WAIT_MS", 12e4),
  readyPoll: intFromEnv("LAKEBASE_KIT_TIMEOUT_READY_POLL_MS", 5e3),
  pgConnect: intFromEnv("LAKEBASE_KIT_TIMEOUT_PG_CONNECT_MS", 1e4),
  pgStatement: intFromEnv("LAKEBASE_KIT_TIMEOUT_PG_STATEMENT_MS", 15e3),
  gitDefault: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_DEFAULT_MS", 5e3),
  gitCheckout: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_CHECKOUT_MS", 1e4),
  gitNetwork: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_NETWORK_MS", 15e3),
  gitPush: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_PUSH_MS", 3e4),
  cliLong: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_LONG_MS", 6e4),
  cmdShort: intFromEnv("LAKEBASE_KIT_TIMEOUT_CMD_SHORT_MS", 5e3),
  initializrCacheTtl: intFromEnv("LAKEBASE_KIT_INITIALIZR_CACHE_TTL_MS", 10 * 60 * 1e3),
  featureBranchTtlMs: intFromEnv("LAKEBASE_KIT_FEATURE_BRANCH_TTL_MS", 30 * DAY_MS),
  testBranchTtlMs: intFromEnv("LAKEBASE_KIT_TEST_BRANCH_TTL_MS", 14 * DAY_MS),
  uatBranchTtlMs: intFromEnv("LAKEBASE_KIT_UAT_BRANCH_TTL_MS", 14 * DAY_MS),
  perfBranchTtlMs: intFromEnv("LAKEBASE_KIT_PERF_BRANCH_TTL_MS", 7 * DAY_MS)
};
function urlFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.replace(/\/+$/, "");
}
var KIT_REGISTRIES = {
  mavenCentral: urlFromEnv("LAKEBASE_KIT_REGISTRY_MAVEN_CENTRAL", "https://repo1.maven.org/maven2"),
  springInitializr: urlFromEnv("LAKEBASE_KIT_REGISTRY_SPRING_INITIALIZR", "https://start.spring.io")
};

// scripts/lakebase/branch-utils.ts
var execFileP = promisify(execFile);

// scripts/lakebase/branch-delete.ts
var execFileP2 = promisify2(execFile2);

// scripts/github/pr.ts
var GitHubPullRequestError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "GitHubPullRequestError";
  }
  status;
};
async function octokit() {
  const token = await resolveGitHubToken();
  return new Octokit({ auth: token });
}
function wrap(err, context) {
  if (err instanceof RequestError) {
    throw new GitHubPullRequestError(`${context}: ${err.message}`, err.status);
  }
  if (err instanceof Error) {
    throw new GitHubPullRequestError(`${context}: ${err.message}`);
  }
  throw new GitHubPullRequestError(context);
}
async function createPullRequest(args) {
  try {
    const { owner, repo } = parseOwnerRepo(args.ownerRepo);
    const ok = await octokit();
    let base = args.baseBranch;
    if (!base) {
      const { data: repoData } = await ok.rest.repos.get({ owner, repo });
      base = repoData.default_branch || "main";
    }
    const { data } = await ok.rest.pulls.create({
      owner,
      repo,
      title: args.title,
      head: args.headBranch,
      base,
      body: args.body
    });
    return data.html_url || "";
  } catch (err) {
    wrap(err, "Failed to create pull request");
  }
}
async function getPullRequest(ownerRepo, headBranch) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const ok = await octokit();
    const { data: pulls } = await ok.rest.pulls.list({
      owner,
      repo,
      state: "open",
      head: `${owner}:${headBranch}`,
      per_page: 1
    });
    if (pulls.length === 0) return void 0;
    const { data: pr } = await ok.rest.pulls.get({
      owner,
      repo,
      pull_number: pulls[0].number
    });
    if (pr.state !== "open") return void 0;
    let checks = [];
    let ciStatus = "pending";
    const headSha = pr.head?.sha;
    if (headSha) {
      try {
        const { data: checksData } = await ok.rest.checks.listForRef({
          owner,
          repo,
          ref: headSha
        });
        const runs = checksData.check_runs || [];
        checks = runs.map((c) => ({
          name: c.name || "unknown",
          status: (c.status || "").toUpperCase(),
          conclusion: (c.conclusion || "").toUpperCase(),
          detailsUrl: c.details_url || void 0
        }));
        ciStatus = parseCiStatus(runs);
      } catch {
        ciStatus = "pending";
      }
    }
    return {
      number: pr.number,
      title: pr.title,
      url: pr.html_url || "",
      state: (pr.state || "open").toUpperCase(),
      isDraft: pr.draft || false,
      ciStatus,
      checks,
      headBranch: pr.head?.ref || headBranch,
      baseBranch: pr.base?.ref || "",
      body: pr.body || void 0,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files
    };
  } catch {
    return void 0;
  }
}
function parseCiStatus(rawChecks) {
  if (rawChecks.length === 0) return "pending";
  const latestByName = /* @__PURE__ */ new Map();
  for (const c of rawChecks) {
    latestByName.set(c.name || "unknown", c);
  }
  const states = Array.from(latestByName.values()).map(
    (c) => (c.conclusion || c.status || "").toUpperCase()
  );
  if (states.some((s) => s === "FAILURE" || s === "ERROR" || s === "ACTION_REQUIRED")) {
    return "failure";
  }
  if (states.every((s) => s === "SUCCESS" || s === "NEUTRAL" || s === "SKIPPED")) {
    return "success";
  }
  return "pending";
}

// scripts/lakebase/scm-workflow-state.ts
import * as fs from "fs";
import * as path from "path";
var SCM_STATES = [
  "scaffold-complete",
  "feature-claimed",
  "pr-ready",
  "ci-green",
  "merged"
];
var STATE_INDEX = SCM_STATES.reduce(
  (acc, s, i) => ({ ...acc, [s]: i }),
  {}
);
var STATE_FILE_REL = ".lakebase/workflow-state.json";
function stateFilePath(projectDir) {
  return path.join(projectDir, STATE_FILE_REL);
}
function readWorkflowState(projectDir) {
  const p = stateFilePath(projectDir);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Failed to parse ${STATE_FILE_REL}: ${e.message}`
    );
  }
  const result = validateWorkflowState(parsed);
  if (!result.ok) {
    const summary = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");
    throw new Error(
      `Invalid ${STATE_FILE_REL}:
${summary}

Fix the file or delete it to re-init.`
    );
  }
  return result.value;
}
function writeWorkflowState(projectDir, state) {
  const result = validateWorkflowState(state);
  if (!result.ok) {
    const summary = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Refusing to write invalid SCM state:
${summary}`);
  }
  const dir = path.join(projectDir, ".lakebase");
  fs.mkdirSync(dir, { recursive: true });
  const target = stateFilePath(projectDir);
  const tmp = `${target}.tmp`;
  const ordered = orderForOutput(result.value);
  fs.writeFileSync(tmp, `${JSON.stringify(ordered, null, 2)}
`, "utf8");
  fs.renameSync(tmp, target);
}
function validateWorkflowState(value) {
  const errors = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      errors: [{ path: "$", message: "must be an object" }]
    };
  }
  const v = value;
  if (v.version !== 1) {
    errors.push({ path: "version", message: `must be 1, got ${String(v.version)}` });
  }
  if (typeof v.state !== "string" || !SCM_STATES.includes(v.state)) {
    errors.push({
      path: "state",
      message: `must be one of ${SCM_STATES.join(" | ")}`
    });
  }
  if (v.tier_topology !== 1 && v.tier_topology !== 2 && v.tier_topology !== 3) {
    errors.push({
      path: "tier_topology",
      message: "must be 1, 2, or 3"
    });
  }
  if (typeof v.project_id !== "string" || v.project_id.length === 0) {
    errors.push({
      path: "project_id",
      message: "must be a non-empty string"
    });
  }
  const stringFields = [
    "feature_id",
    "branch",
    "parent_branch",
    "lakebase_branch_uid",
    "claimed_at",
    "pr_url",
    "pushed_at",
    "ci_run_url",
    "ci_green_at",
    "merged_at",
    "migrate_run_url",
    "migrate_completed_at",
    "$schema"
  ];
  for (const key of stringFields) {
    if (v[key] === void 0) continue;
    if (typeof v[key] !== "string" || v[key].length === 0) {
      errors.push({
        path: key,
        message: "must be a non-empty string when present"
      });
    }
  }
  const requiredForState = {
    "scaffold-complete": [],
    "feature-claimed": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at"
    ],
    "pr-ready": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at"
    ],
    "ci-green": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at",
      "ci_run_url",
      "ci_green_at"
    ],
    merged: [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at",
      "ci_run_url",
      "ci_green_at",
      "merged_at"
    ]
  };
  if (typeof v.state === "string" && SCM_STATES.includes(v.state)) {
    for (const key of requiredForState[v.state]) {
      if (v[key] === void 0) {
        errors.push({
          path: key,
          message: `required when state is "${v.state}"`
        });
      }
    }
  }
  const allowedKeys = /* @__PURE__ */ new Set([
    "$schema",
    "version",
    "state",
    "tier_topology",
    "project_id",
    "feature_id",
    "branch",
    "parent_branch",
    "lakebase_branch_uid",
    "claimed_at",
    "pr_url",
    "pushed_at",
    "ci_run_url",
    "ci_green_at",
    "merged_at",
    "migrate_run_url",
    "migrate_completed_at"
  ]);
  for (const key of Object.keys(v)) {
    if (!allowedKeys.has(key)) {
      errors.push({ path: key, message: "unknown property" });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: v };
}
function orderForOutput(state) {
  const keyOrder = [
    "$schema",
    "version",
    "state",
    "tier_topology",
    "project_id",
    "feature_id",
    "branch",
    "parent_branch",
    "lakebase_branch_uid",
    "claimed_at",
    "pr_url",
    "pushed_at",
    "ci_run_url",
    "ci_green_at",
    "merged_at",
    "migrate_run_url",
    "migrate_completed_at"
  ];
  const out = {};
  for (const k of keyOrder) {
    if (state[k] !== void 0) {
      out[k] = state[k];
    }
  }
  return out;
}

// scripts/lakebase/scm-prepare-pr.ts
var ScmPreparePrError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ScmPreparePrError";
  }
  code;
};
async function preparePr(args) {
  const current = readWorkflowState(args.projectDir);
  if (!current) {
    throw new ScmPreparePrError(
      `No SCM workflow state at ${args.projectDir}/.lakebase/workflow-state.json. Claim a feature first.`,
      "no-state-file"
    );
  }
  if (current.state !== "feature-claimed") {
    throw new ScmPreparePrError(
      `prepare-pr refuses state "${current.state}". Allowed predecessor: feature-claimed.`,
      "bad-precondition"
    );
  }
  if (!current.branch || !current.parent_branch || !current.feature_id) {
    throw new ScmPreparePrError(
      "feature-claimed row missing branch / parent_branch / feature_id; refusing to push.",
      "bad-precondition"
    );
  }
  const headBranch = await getCurrentBranch({ cwd: args.projectDir });
  if (headBranch !== current.branch) {
    throw new ScmPreparePrError(
      `HEAD is on "${headBranch}" but workflow state says "${current.branch}". Checkout the feature branch first.`,
      "wrong-branch"
    );
  }
  if (!args.force) {
    const dirty = await isDirty({ cwd: args.projectDir, ignore: [".sftdd/", ".tdd/", ".lakebase/", ".claude/agent-memory/"] });
    if (dirty) {
      throw new ScmPreparePrError(
        "Working tree has uncommitted code changes; commit them before opening the PR (or pass --force).",
        "dirty-working-tree"
      );
    }
  }
  if (!args.allowNoCommits) {
    const ahead = await ensureAheadOfParent(
      args.projectDir,
      current.branch,
      current.parent_branch
    );
    if (ahead === 0) {
      throw new ScmPreparePrError(
        `Branch "${current.branch}" has 0 commits ahead of "${current.parent_branch}". Make at least one commit (or pass --allow-no-commits).`,
        "no-commits-ahead"
      );
    }
  }
  const ownerRepo = await getOwnerRepo(args.projectDir);
  if (!ownerRepo) {
    throw new ScmPreparePrError(
      "No GitHub remote found at origin (or origin is not a github.com URL). Add one before running prepare-pr.",
      "no-github-remote"
    );
  }
  const now = (args.now ?? (() => /* @__PURE__ */ new Date()))();
  let prUrl = args.prUrlOverride ?? "";
  let prCreated = false;
  if (!prUrl) {
    try {
      await exec2(
        `git push -u ${shellEscape(args.remote ?? "origin")} ${shellEscape(current.branch)}`,
        { cwd: args.projectDir, timeout: 6e4 }
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      throw new ScmPreparePrError(
        `git push failed: ${raw}${pushFailureHint(raw)}`,
        "push-failed"
      );
    }
    const existing = await getPullRequest(ownerRepo, current.branch);
    if (existing) {
      prUrl = existing.url;
    } else {
      try {
        prUrl = await createPullRequest({
          ownerRepo,
          headBranch: current.branch,
          baseBranch: current.parent_branch,
          title: args.title ?? `feat: ${current.feature_id}`,
          body: args.body ?? defaultBody(current.feature_id, current.parent_branch)
        });
        prCreated = true;
      } catch (err) {
        throw new ScmPreparePrError(
          `Failed to create pull request: ${err instanceof Error ? err.message : String(err)}`,
          "pr-failed"
        );
      }
    }
  }
  const next = {
    ...current,
    state: "pr-ready",
    pr_url: prUrl,
    pushed_at: now.toISOString()
  };
  writeWorkflowState(args.projectDir, next);
  return { state: next, prUrl, prCreated };
}
async function ensureAheadOfParent(cwd, branch, parent) {
  try {
    const out = (await exec2(
      `git rev-list --count ${shellEscape(`${parent}..${branch}`)}`,
      { cwd, timeout: 1e4 }
    )).trim();
    return Number.parseInt(out, 10) || 0;
  } catch {
    try {
      const out = (await exec2(
        `git rev-list --count ${shellEscape(`origin/${parent}..${branch}`)}`,
        { cwd, timeout: 1e4 }
      )).trim();
      return Number.parseInt(out, 10) || 0;
    } catch {
      const ab = await getAheadBehind({ cwd });
      return ab.ahead;
    }
  }
}
function pushFailureHint(rawMessage) {
  const looksLikeAccess = /repository not found|not found|\b403\b|\b401\b|permission denied|access denied|could not read (?:username|password)|authentication failed|fatal: could not read/i.test(
    rawMessage
  );
  if (!looksLikeAccess) return "";
  return [
    "",
    "",
    "  The remote rejected the push. For a PRIVATE repo this usually means git",
    "  authenticated as a GitHub account WITHOUT access - GitHub returns",
    '  "Repository not found" rather than a permission error, so it looks like a',
    "  wrong URL when it is really the wrong account. Check `gh auth status`; if",
    "  the repo lives under an org only one of your accounts can see, make that",
    "  account active (`gh auth switch --user <account>`) or fix the `origin`",
    "  remote, then re-run prepare-pr."
  ].join("\n");
}
function defaultBody(featureId, parentBranch) {
  return [
    `Feature: \`${featureId}\``,
    "",
    `Forks from \`${parentBranch}\`.`,
    "",
    "PR opened by `lakebase-scm-prepare-pr` (phase B+)."
  ].join("\n");
}
function shellEscape(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// scripts/lakebase/scm-prepare-pr.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--project-dir":
      case "--cwd":
        out.projectDir = argv[++i];
        break;
      case "--title":
        out.title = argv[++i];
        break;
      case "--body":
        out.body = argv[++i];
        break;
      case "--remote":
        out.remote = argv[++i];
        break;
      case "--allow-no-commits":
        out.allowNoCommits = true;
        break;
      case "--force":
        out.force = true;
        break;
      case "--json":
        out.json = true;
        break;
      case "--pretty":
        out.pretty = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
    }
  }
  return out;
}
var HELP = `lakebase-scm-prepare-pr (phase B+)

Transition feature-claimed -> pr-ready: push the feature branch and
open a GitHub PR against the parent branch. Re-runs reuse an existing
open PR for the same branch.

Usage:
  lakebase-scm-prepare-pr [flags]

Flags:
  --project-dir <dir>     Project root (default: cwd)
  --title <str>           PR title (default: "feat: <feature-id>")
  --body <str>            PR body (default: generated stub)
  --remote <name>         git remote to push to (default: origin)
  --allow-no-commits      Open a PR with 0 commits ahead of parent
  --force                 Push even with a dirty working tree
  --json                  Machine-readable JSON output
  --pretty                Pretty-print JSON
  -h, --help              Show this help

Exit codes:
  0 = pr-ready
  1 = no state file
  2 = precondition refused (wrong state, dirty tree, 0 commits, wrong branch)
  3 = substrate failure (push / PR create)
`;
function renderHuman(r) {
  if (!r.ok) {
    return `lakebase-scm-prepare-pr: ${r.error?.code}

  ${r.error?.message}`;
  }
  const res = r.result;
  const lines = ["PR ready:"];
  lines.push(`  state       : ${res.state.state}`);
  lines.push(`  branch      : ${res.state.branch}`);
  lines.push(`  pr_url      : ${res.prUrl}`);
  lines.push(`  pushed_at   : ${res.state.pushed_at}`);
  lines.push(`  pr_created  : ${res.prCreated}`);
  return lines.join("\n");
}
function exitCodeForError(err) {
  if (err instanceof ScmPreparePrError) {
    if (err.code === "no-state-file") return 1;
    if (err.code === "push-failed" || err.code === "pr-failed" || err.code === "no-github-remote")
      return 3;
    return 2;
  }
  return 3;
}
async function runScmPreparePrCli(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}
`);
    return 0;
  }
  const projectDir = path2.resolve(args.projectDir ?? process.cwd());
  try {
    const result = await preparePr({
      projectDir,
      title: args.title,
      body: args.body,
      remote: args.remote,
      allowNoCommits: args.allowNoCommits,
      force: args.force
    });
    const report = { ok: true, result };
    if (args.json) {
      const indent = args.pretty ? 2 : 0;
      process.stdout.write(`${JSON.stringify(report, null, indent)}
`);
    } else {
      process.stdout.write(`${renderHuman(report)}
`);
    }
    return 0;
  } catch (e) {
    const err = e;
    const code = err instanceof ScmPreparePrError ? err.code : "substrate-failure";
    const report = {
      ok: false,
      error: { code, message: err.message }
    };
    if (args.json) {
      const indent = args.pretty ? 2 : 0;
      process.stdout.write(`${JSON.stringify(report, null, indent)}
`);
    } else {
      process.stderr.write(`${renderHuman(report)}
`);
    }
    return exitCodeForError(err);
  }
}
if (isCliEntry(import.meta.url)) {
  void runScmPreparePrCli(process.argv.slice(2)).then((c) => process.exit(c));
}
export {
  runScmPreparePrCli
};
//# sourceMappingURL=scm-prepare-pr.cli.js.map