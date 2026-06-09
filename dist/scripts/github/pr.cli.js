#!/usr/bin/env node

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

// scripts/lakebase/branch-delete.ts
import { execFile as execFile2 } from "child_process";
import { promisify as promisify2 } from "util";

// scripts/lakebase/branch-utils.ts
import { execFile } from "child_process";
import { promisify } from "util";

// scripts/lakebase/branch-id.ts
var UID_PATTERN = /^br-[a-z0-9-]+$/;
function looksLikeBranchUid(s) {
  return UID_PATTERN.test(s);
}
function asBranchName(s) {
  if (!s) throw new TypeError("BranchName cannot be empty");
  if (looksLikeBranchUid(s)) {
    throw new TypeError(
      `'${s}' looks like a BranchUid (br-\u2026 pattern), not a BranchName. BranchName is the resource-path leaf (e.g. 'production', 'staging', 'feature-add-orders'); BranchUid is the system identifier returned by list-branches as the 'uid' field. The Lakebase API rejects a BranchUid in any path-shaped field. If you really mean a BranchUid, use asBranchUid() instead \u2013 but verify you're calling a function that takes one.`
    );
  }
  return s;
}
function asBranchUid(s) {
  if (!s) throw new TypeError("BranchUid cannot be empty");
  if (!looksLikeBranchUid(s)) {
    throw new TypeError(
      `'${s}' is not a BranchUid (must match the br-\u2026 pattern). If you have a BranchName (resource-path leaf like 'production'), use asBranchName() instead.`
    );
  }
  return s;
}
function branchNameFromResourcePath(path) {
  if (!path.includes("/branches/")) return null;
  const leaf = path.split("/branches/").pop();
  if (!leaf) return null;
  try {
    return asBranchName(leaf);
  } catch {
    return null;
  }
}

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
var LakebaseBranchError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LakebaseBranchError";
  }
};
function projectPath(instance) {
  return `projects/${instance}`;
}
async function listBranches(opts) {
  const raw = await dbcli(
    ["postgres", "list-branches", projectPath(opts.instance), "-o", "json"],
    opts.host
  );
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LakebaseBranchError(`Unexpected CLI output: ${raw.slice(0, 200)}`);
  }
  const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
  return items.map(parseBranch).filter((b) => b !== void 0);
}
async function getBranchByName(branchNameOrUid, opts) {
  const branches = await listBranches(opts);
  return branches.find(
    (b) => b.uid === branchNameOrUid || b.name === branchNameOrUid || b.name.endsWith(`/${branchNameOrUid}`)
  );
}
async function resolveBranchPath(branchNameOrUid, opts) {
  if (branchNameOrUid.startsWith("projects/") && branchNameOrUid.includes("/branches/")) {
    return branchNameOrUid;
  }
  const branch = await getBranchByName(branchNameOrUid, opts);
  return branch?.name;
}
function parseBranch(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const r = raw;
  const name = r.name ?? "";
  if (!name) return void 0;
  const nameLeaf = branchNameFromResourcePath(name);
  if (!nameLeaf) return void 0;
  if (!r.uid) return void 0;
  let uid;
  try {
    uid = asBranchUid(r.uid);
  } catch {
    return void 0;
  }
  const sourceBranchName = r.status?.source_branch ?? r.spec?.source_branch;
  const sourceBranchId = sourceBranchName ? branchNameFromResourcePath(sourceBranchName) ?? void 0 : void 0;
  return {
    uid,
    nameLeaf,
    name,
    state: r.status?.current_state ?? r.state ?? "UNKNOWN",
    sourceBranchName,
    sourceBranchId,
    isDefault: r.status?.default === true || r.is_default === true,
    expireTime: r.status?.expire_time,
    isProtected: r.status?.is_protected
  };
}
async function dbcli(args, host) {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...process.env, DATABRICKS_HOST: trimmedHost } : process.env;
  try {
    const { stdout } = await execFileP("databricks", args, { env, timeout: KIT_TIMEOUTS.cliDefault });
    return stdout.toString();
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new LakebaseBranchError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/lakebase/branch-delete.ts
var execFileP2 = promisify2(execFile2);
async function deleteBranch(args) {
  const fullPath = await resolveBranchPath(args.branch, {
    instance: args.instance,
    host: args.host
  });
  if (!fullPath) {
    throw new LakebaseBranchError(`Branch "${args.branch}" not found in instance "${args.instance}"`);
  }
  if (!args.allowDefault) {
    const info = await getBranchByName(args.branch, {
      instance: args.instance,
      host: args.host
    });
    if (info?.isDefault) {
      const leaf = info.name.split("/branches/").pop() ?? info.uid;
      throw new LakebaseBranchError(
        `Refusing to delete the project's default Lakebase branch "${leaf}". This branch is the trunk every other branch was forked from. Pass allowDefault=true (or --allow-default on the CLI) only when you intend to tear down the entire project.`
      );
    }
  }
  await dbcli2(["postgres", "delete-branch", fullPath], args.host);
}
async function dbcli2(args, host) {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...process.env, DATABRICKS_HOST: trimmedHost } : process.env;
  try {
    const { stdout } = await execFileP2("databricks", args, { env, timeout: KIT_TIMEOUTS.cliDefault });
    return stdout.toString();
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new LakebaseBranchError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/util/sanitize-branch-name.ts
function sanitizeBranchName(gitBranch) {
  let name = gitBranch.replace(/\//g, "-").toLowerCase().replace(/[^a-z0-9-]/g, "-").substring(0, 63);
  while (name.length < 3) name += "-x";
  return name;
}

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
async function getPullRequestReviews(ownerRepo, pullNumber) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const ok = await octokit();
    const { data } = await ok.rest.pulls.listReviews({ owner, repo, pull_number: pullNumber });
    return data.map((r) => ({
      author: r.user?.login || "unknown",
      state: r.state || "COMMENTED",
      body: r.body || "",
      submittedAt: r.submitted_at || void 0
    }));
  } catch {
    return [];
  }
}
async function getPullRequestFiles(ownerRepo, pullNumber) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const ok = await octokit();
    const { data } = await ok.rest.pulls.listFiles({ owner, repo, pull_number: pullNumber });
    const statusMap = {
      added: "added",
      removed: "deleted",
      modified: "modified",
      renamed: "renamed"
    };
    return data.map((f) => ({
      path: f.filename || "",
      status: statusMap[(f.status || "").toLowerCase()] || "modified",
      additions: f.additions || 0,
      deletions: f.deletions || 0
    }));
  } catch {
    return [];
  }
}
async function getPullRequestComments(ownerRepo, pullNumber) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const ok = await octokit();
    const { data } = await ok.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber
    });
    return data.map((c) => ({
      author: c.user?.login || "unknown",
      body: c.body || ""
    }));
  } catch {
    return [];
  }
}
async function mergePullRequest(args) {
  const method = args.method ?? "merge";
  const deleteRemoteBranch = args.deleteRemoteBranch !== false;
  try {
    const { owner, repo } = parseOwnerRepo(args.ownerRepo);
    const ok = await octokit();
    const { data } = await ok.rest.pulls.merge({
      owner,
      repo,
      pull_number: args.pullNumber,
      merge_method: method
    });
    if (deleteRemoteBranch) {
      try {
        const pr = await ok.rest.pulls.get({ owner, repo, pull_number: args.pullNumber });
        const headRef = pr.data.head.ref;
        await ok.rest.git.deleteRef({
          owner,
          repo,
          ref: `heads/${headRef}`
        });
      } catch {
      }
    }
    return data.message || `Merged PR #${args.pullNumber}`;
  } catch (err) {
    wrap(err, "Failed to merge pull request");
  }
}
async function mergePairedPullRequest(args) {
  const warnings = [];
  const deleteLakebaseBranch = args.deleteLakebaseBranch !== false;
  let headBranch = "";
  try {
    const { owner, repo } = parseOwnerRepo(args.ownerRepo);
    const ok = await octokit();
    const pr = await ok.rest.pulls.get({ owner, repo, pull_number: args.pullNumber });
    headBranch = pr.data.head?.ref ?? "";
  } catch (err) {
    warnings.push(
      `Could not read PR head branch before merge: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const message = await mergePullRequest({
    ownerRepo: args.ownerRepo,
    pullNumber: args.pullNumber,
    method: args.method,
    deleteRemoteBranch: args.deleteRemoteBranch
  });
  let lakebaseBranchDeleted = false;
  if (deleteLakebaseBranch && headBranch) {
    const sanitized = sanitizeBranchName(headBranch);
    try {
      await deleteBranch({ instance: args.lakebaseInstance, branch: sanitized });
      lakebaseBranchDeleted = true;
    } catch (err) {
      warnings.push(
        `Lakebase branch "${sanitized}" cleanup failed (PR merge succeeded): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else if (deleteLakebaseBranch && !headBranch) {
    warnings.push("Skipped Lakebase branch cleanup \u2013 could not resolve PR head branch name");
  }
  return { message, headBranch, lakebaseBranchDeleted, warnings };
}

// scripts/github/pr.cli.ts
function parseArgs(argv) {
  const out = {};
  if (argv.length === 0) return out;
  let startIdx = 0;
  if (!argv[0].startsWith("-")) {
    out.subcommand = argv[0];
    startIdx = 1;
  }
  for (let i = startIdx; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--owner-repo":
        out.ownerRepo = argv[++i];
        break;
      case "--head":
        out.head = argv[++i];
        break;
      case "--base":
        out.base = argv[++i];
        break;
      case "--title":
        out.title = argv[++i];
        break;
      case "--body":
        out.body = argv[++i];
        break;
      case "--pull-number":
      case "--pr":
        out.pullNumber = parseInt(argv[++i], 10);
        break;
      case "--method":
        out.method = argv[++i];
        break;
      case "--keep-remote":
        out.keepRemote = true;
        break;
      case "--instance":
        out.instance = argv[++i];
        break;
      case "--keep-lakebase":
        out.keepLakebase = true;
        break;
      case "--pretty":
        out.pretty = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        break;
    }
  }
  return out;
}
var HELP = `lakebase-pr

Subcommands:
  open          Create a new PR (returns html_url)
  merge         Merge a PR via GitHub REST API (delete remote head by default)
  merge-paired  Merge a PR + delete the matching Lakebase feature branch
  status        Show PR state + checks + counts (looks up by --head, JSON)
  files         List PR file changes (by --pull-number)
  reviews       List PR reviews (by --pull-number)
  comments      List PR issue-level comments (by --pull-number)

Common flags:
  --owner-repo <o/r>     GitHub repo slug (required)
  --pull-number <N>      PR number (required for merge/merge-paired/status/files/reviews/comments)
  --pretty               Pretty-print JSON output

Open-specific:
  --head <branch>        Head branch (required)
  --title <text>         PR title (required)
  --body <text>          PR body (required)
  --base <branch>        Base branch (default: repo default branch)

Merge-specific:
  --method <m>           "merge" | "squash" | "rebase" (default: merge)
  --keep-remote          Keep the remote head branch after merge (default: delete)

merge-paired (Lakebase feature-branch cleanup as well as git):
  --instance <id>        Lakebase project id (required)
  --keep-lakebase        Skip Lakebase branch deletion (default: delete)

Authentication:
  Uses the same GitHub auth pipeline as lakebase-github-token (PAT from
  GITHUB_TOKEN env var, or gh-cli token, or workspace secret).

Examples:
  lakebase-pr open --owner-repo o/r --head feat/x --title "feat: x" --body "..."
  lakebase-pr status --owner-repo o/r --pull-number 42 --pretty
  lakebase-pr merge --owner-repo o/r --pull-number 42 --method squash
  lakebase-pr merge-paired --owner-repo o/r --pull-number 42 --instance proj-x
`;
function printJson(result, pretty) {
  process.stdout.write(
    (pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result)) + "\n"
  );
}
function requireFlags(sub, args, required) {
  const missing = required.filter((k) => args[k] === void 0);
  if (missing.length === 0) return true;
  process.stderr.write(
    `${sub}: missing required flag(s): ${missing.map((m) => "--" + String(m).replace(/([A-Z])/g, "-$1").toLowerCase()).join(", ")}
`
  );
  return false;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.subcommand) {
    process.stdout.write(HELP);
    return args.help ? 0 : 2;
  }
  const pretty = args.pretty ?? false;
  try {
    switch (args.subcommand) {
      case "open": {
        if (!requireFlags("open", args, [
          "ownerRepo",
          "head",
          "title",
          "body"
        ]))
          return 2;
        const url = await createPullRequest({
          ownerRepo: args.ownerRepo,
          headBranch: args.head,
          baseBranch: args.base,
          title: args.title,
          body: args.body
        });
        printJson({ url }, pretty);
        return 0;
      }
      case "merge": {
        if (!requireFlags("merge", args, ["ownerRepo", "pullNumber"]))
          return 2;
        const message = await mergePullRequest({
          ownerRepo: args.ownerRepo,
          pullNumber: args.pullNumber,
          method: args.method,
          deleteRemoteBranch: !args.keepRemote
        });
        printJson({ message }, pretty);
        return 0;
      }
      case "merge-paired": {
        if (!requireFlags("merge-paired", args, [
          "ownerRepo",
          "pullNumber",
          "instance"
        ]))
          return 2;
        const result = await mergePairedPullRequest({
          ownerRepo: args.ownerRepo,
          pullNumber: args.pullNumber,
          lakebaseInstance: args.instance,
          method: args.method,
          deleteRemoteBranch: !args.keepRemote,
          deleteLakebaseBranch: !args.keepLakebase
        });
        printJson(result, pretty);
        return 0;
      }
      case "status": {
        if (!requireFlags("status", args, ["ownerRepo", "head"])) return 2;
        const info = await getPullRequest(args.ownerRepo, args.head);
        if (!info) {
          process.stderr.write(
            `No open PR found for ${args.ownerRepo} head=${args.head}
`
          );
          return 1;
        }
        printJson(info, pretty);
        return 0;
      }
      case "files": {
        if (!requireFlags("files", args, ["ownerRepo", "pullNumber"]))
          return 2;
        const files = await getPullRequestFiles(
          args.ownerRepo,
          args.pullNumber
        );
        printJson(files, pretty);
        return 0;
      }
      case "reviews": {
        if (!requireFlags("reviews", args, ["ownerRepo", "pullNumber"]))
          return 2;
        const reviews = await getPullRequestReviews(
          args.ownerRepo,
          args.pullNumber
        );
        printJson(reviews, pretty);
        return 0;
      }
      case "comments": {
        if (!requireFlags("comments", args, ["ownerRepo", "pullNumber"]))
          return 2;
        const comments = await getPullRequestComments(
          args.ownerRepo,
          args.pullNumber
        );
        printJson(comments, pretty);
        return 0;
      }
      default:
        process.stderr.write(
          `Unknown subcommand: ${args.subcommand}

${HELP}`
        );
        return 2;
    }
  } catch (err) {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}
`
    );
    return 1;
  }
}
main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}
`
    );
    process.exit(1);
  }
);
//# sourceMappingURL=pr.cli.js.map