#!/usr/bin/env node

// scripts/lakebase/deploy-app-endpoint.ts
import { spawn } from "child_process";

// scripts/util/exec.ts
import * as cp from "child_process";
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

// scripts/lakebase/deploy-workspace-upload.ts
import { readdirSync, statSync } from "fs";
import { join, sep } from "path";

// scripts/lakebase/deploy-app-endpoint.ts
async function getCiAppEndpoint(args2) {
  const appName = args2.appName ?? deriveCiAppName(args2.instance, args2.branch);
  const timeoutMs = args2.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const profileFlag = args2.profile ? ` --profile "${escapeShellArg(args2.profile)}"` : "";
  try {
    const stdout = await exec2(
      `databricks apps get "${escapeShellArg(appName)}"${profileFlag} -o json`,
      { timeout: timeoutMs }
    );
    const info = JSON.parse(stdout);
    return {
      appName,
      exists: true,
      url: typeof info.url === "string" ? info.url : void 0
    };
  } catch (err) {
    const msg = err.message;
    if (/RESOURCE_DOES_NOT_EXIST|does not exist or is deleted|App .* does not exist|status:? 404\b/i.test(msg)) {
      return { appName, exists: false, url: void 0 };
    }
    throw err;
  }
}
function deriveCiAppName(instance, branch) {
  const raw = `${instance}-${branch}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return raw.slice(0, 26).replace(/-+$/, "");
}
function escapeShellArg(s) {
  return s.replace(/"/g, '\\"');
}

// scripts/lakebase/ci-app-endpoint.cli.ts
function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      printHelpAndExit();
    } else if (a === "--instance" && i + 1 < argv.length) {
      parsed.instance = argv[++i];
    } else if (a === "--branch" && i + 1 < argv.length) {
      parsed.branch = argv[++i];
    } else if (a === "--profile" && i + 1 < argv.length) {
      parsed.profile = argv[++i];
    } else if (a === "--app-name" && i + 1 < argv.length) {
      parsed.appName = argv[++i];
    }
  }
  return parsed;
}
function printHelpAndExit() {
  process.stdout.write(
    `lakebase-ci-app-endpoint \u2013 resolve the deployed Databricks Apps URL for a Lakebase CI branch

Usage:
  lakebase-ci-app-endpoint --instance <id> --branch <name> [--profile <p>] [--app-name <name>]

Output (stdout):
  The app URL on a single line when the app exists.
  Empty (with a stderr note) when the app does not exist yet.

Exit codes:
  0  app resolved, OR app missing (graceful no-op).
  1  bad invocation (missing --instance / --branch) or infrastructure error.
`
  );
  process.exit(0);
}
var args = parseArgs(process.argv.slice(2));
if (!args.instance || !args.branch) {
  process.stderr.write(
    `lakebase-ci-app-endpoint: --instance and --branch are required
`
  );
  process.exit(1);
}
getCiAppEndpoint({
  instance: args.instance,
  branch: args.branch,
  profile: args.profile,
  appName: args.appName
}).then((result) => {
  if (result.url) {
    process.stdout.write(`${result.url}
`);
  } else {
    process.stderr.write(
      `lakebase-ci-app-endpoint: app "${result.appName}" does not exist; LAKEBASE_APP_ENDPOINT will remain unset.
`
    );
  }
  process.exit(0);
}).catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`lakebase-ci-app-endpoint: ${msg}
`);
  process.exit(1);
});
//# sourceMappingURL=ci-app-endpoint.cli.js.map