#!/usr/bin/env node
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

// scripts/lakebase/scm-feature-branch.cli.ts
var scm_feature_branch_cli_exports = {};
__export(scm_feature_branch_cli_exports, {
  runScmFeatureBranchCli: () => runScmFeatureBranchCli
});
module.exports = __toCommonJS(scm_feature_branch_cli_exports);

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// scripts/util/cli-entry.ts
var import_node_fs = require("fs");
var import_node_url = require("url");
function isCliEntry(importMetaUrl2) {
  const invokedRaw = process.argv[1];
  if (!invokedRaw) return false;
  let invokedResolved;
  let moduleResolved;
  try {
    invokedResolved = (0, import_node_fs.realpathSync)(invokedRaw);
  } catch {
    return false;
  }
  try {
    moduleResolved = (0, import_node_fs.realpathSync)((0, import_node_url.fileURLToPath)(importMetaUrl2));
  } catch {
    return false;
  }
  return invokedResolved === moduleResolved;
}

// scripts/lakebase/scm-claim-feature.ts
var fs5 = __toESM(require("fs"), 1);
var path4 = __toESM(require("path"), 1);

// scripts/lakebase/branch-create.ts
var import_node_child_process3 = require("child_process");
var import_node_util3 = require("util");

// scripts/util/sanitize-branch-name.ts
function sanitizeBranchName(gitBranch) {
  let name = gitBranch.replace(/\//g, "-").toLowerCase().replace(/[^a-z0-9-]/g, "-").substring(0, 63);
  while (name.length < 3) name += "-x";
  return name;
}

// scripts/lakebase/branch-utils.ts
var import_node_child_process = require("child_process");
var import_node_util = require("util");

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
function formatLakebaseTtl(ms) {
  return `${Math.floor(ms / 1e3)}s`;
}
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
var execFileP = (0, import_node_util.promisify)(import_node_child_process.execFile);

// scripts/lakebase/lakebase-project.ts
var import_node_child_process2 = require("child_process");
var import_node_util2 = require("util");
var execFileP2 = (0, import_node_util2.promisify)(import_node_child_process2.execFile);

// scripts/lakebase/branch-create.ts
var execFileP3 = (0, import_node_util3.promisify)(import_node_child_process3.execFile);

// scripts/lakebase/paired-branch.ts
var fs3 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
var import_node_child_process7 = require("child_process");

// scripts/lakebase/branch-delete.ts
var import_node_child_process4 = require("child_process");
var import_node_util4 = require("util");
var execFileP4 = (0, import_node_util4.promisify)(import_node_child_process4.execFile);

// scripts/lakebase/branch-endpoint.ts
var import_node_child_process6 = require("child_process");

// scripts/lakebase/get-connection.ts
var import_node_child_process5 = require("child_process");
var import_lakebase = require("@databricks/lakebase");
var import_pg = require("pg");

// scripts/lakebase/env-file.ts
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);

// scripts/lakebase/databricks-profile.ts
var fs2 = __toESM(require("fs"), 1);

// scripts/util/exec.ts
var cp = __toESM(require("child_process"), 1);

// scripts/lakebase/convention-branches.ts
var CONVENTION_TIER_DEFAULTS = {
  feature: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.featureBranchTtlMs), parentBranch: "staging" },
  test: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.testBranchTtlMs), parentBranch: "staging" },
  uat: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.uatBranchTtlMs), parentBranch: "staging" },
  perf: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.perfBranchTtlMs), parentBranch: "staging" }
};

// scripts/lakebase/scm-workflow-state.ts
var fs4 = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);
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

// scripts/lakebase/scm-claim-feature.ts
var ScmClaimError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ScmClaimError";
  }
  code;
};
function sanitizeFeatureSlug(featureId) {
  const trimmed = featureId.trim();
  if (trimmed.length === 0) {
    throw new ScmClaimError("feature-id is empty", "invalid-feature-id");
  }
  const sanitized = sanitizeBranchName(trimmed);
  if (!/[a-z0-9]/.test(sanitized)) {
    throw new ScmClaimError(
      `feature-id ${JSON.stringify(featureId)} contains no letters/digits; choose an identifier with at least one alphanumeric.`,
      "invalid-feature-id"
    );
  }
  return sanitized;
}
function featureBranchName(slug) {
  return sanitizeBranchName(`feature/${slug}`);
}

// scripts/lakebase/scm-feature-branch.cli.ts
function runScmFeatureBranchCli(argv) {
  const featureId = argv.find((a) => !a.startsWith("-"));
  if (!featureId) {
    process.stderr.write("Usage: lakebase-scm-feature-branch <feature-id>\n");
    return 2;
  }
  try {
    process.stdout.write(`${featureBranchName(sanitizeFeatureSlug(featureId))}
`);
    return 0;
  } catch (e) {
    const msg = e instanceof ScmClaimError ? e.message : e.message;
    process.stderr.write(`lakebase-scm-feature-branch: ${msg}
`);
    return 2;
  }
}
if (isCliEntry(importMetaUrl)) {
  process.exit(runScmFeatureBranchCli(process.argv.slice(2)));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runScmFeatureBranchCli
});
//# sourceMappingURL=scm-feature-branch.cli.cjs.map