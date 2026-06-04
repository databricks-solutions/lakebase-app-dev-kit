#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// scripts/tdd/feature-status.ts
var import_fs6 = require("fs");
var import_path6 = require("path");

// scripts/tdd/test-list.ts
var import_fs = require("fs");
var import_path = require("path");
function readMasterTestList(tddDir, featureId) {
  const dir = findFeatureDir(tddDir, featureId);
  const file = (0, import_path.join)(dir, "test-list.json");
  if (!(0, import_fs.existsSync)(file)) {
    throw new Error(`master test-list.json not found for ${featureId} at ${file}`);
  }
  return JSON.parse((0, import_fs.readFileSync)(file, "utf8"));
}
function findFeatureDir(tddDir, featureId) {
  const featuresDir = (0, import_path.join)(tddDir, "features");
  if (!(0, import_fs.existsSync)(featuresDir)) {
    throw new Error(`${featuresDir} does not exist`);
  }
  const candidates = (0, import_fs.readdirSync)(featuresDir).filter((d) => d.startsWith(featureId));
  if (candidates.length === 0) {
    throw new Error(`feature ${featureId} not found under ${featuresDir}`);
  }
  return (0, import_path.join)(featuresDir, candidates[0]);
}

// scripts/tdd/design-spec-gate.ts
var import_fs3 = require("fs");
var import_path3 = require("path");

// scripts/lakebase/get-connection.ts
var import_node_child_process2 = require("child_process");
var import_lakebase = require("@databricks/lakebase");
var import_pg = require("pg");

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

// scripts/tdd/experiment.ts
var import_fs2 = require("fs");
var import_path2 = require("path");

// scripts/lakebase/branch-create.ts
var import_node_child_process4 = require("child_process");
var import_node_util3 = require("util");

// scripts/lakebase/lakebase-project.ts
var import_node_child_process3 = require("child_process");
var import_node_util2 = require("util");
var execFileP2 = (0, import_node_util2.promisify)(import_node_child_process3.execFile);

// scripts/lakebase/branch-create.ts
var execFileP3 = (0, import_node_util3.promisify)(import_node_child_process4.execFile);

// scripts/lakebase/paired-branch.ts
var fs2 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
var import_node_child_process7 = require("child_process");

// scripts/lakebase/branch-delete.ts
var import_node_child_process5 = require("child_process");
var import_node_util4 = require("util");
var execFileP4 = (0, import_node_util4.promisify)(import_node_child_process5.execFile);

// scripts/lakebase/branch-endpoint.ts
var import_node_child_process6 = require("child_process");

// scripts/lakebase/env-file.ts
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);

// scripts/lakebase/convention-branches.ts
var CONVENTION_TIER_DEFAULTS = {
  feature: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.featureBranchTtlMs), parentBranch: "staging" },
  test: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.testBranchTtlMs), parentBranch: "staging" },
  uat: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.uatBranchTtlMs), parentBranch: "staging" },
  perf: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.perfBranchTtlMs), parentBranch: "staging" }
};

// scripts/tdd/experiment.ts
function listExperiments(tddDir, featureId) {
  const root = (0, import_path2.join)(tddDir, "experiments", featureId);
  if (!(0, import_fs2.existsSync)(root)) return [];
  const out = [];
  for (const slug of (0, import_fs2.readdirSync)(root)) {
    const dir = (0, import_path2.join)(root, slug);
    if (!(0, import_fs2.statSync)(dir).isDirectory()) continue;
    const branchFile = (0, import_path2.join)(dir, "branch.txt");
    if (!(0, import_fs2.existsSync)(branchFile)) continue;
    out.push({
      feature_id: featureId,
      experiment_slug: slug,
      branch_id: (0, import_fs2.readFileSync)(branchFile, "utf8").trim(),
      created_at: (0, import_fs2.statSync)(branchFile).birthtime.toISOString(),
      dir
    });
  }
  return out;
}
function readOutcomes(tddDir, featureId, slug) {
  const file = (0, import_path2.join)(tddDir, "experiments", featureId, slug, "outcomes.json");
  if (!(0, import_fs2.existsSync)(file)) return null;
  return JSON.parse((0, import_fs2.readFileSync)(file, "utf8"));
}

// scripts/tdd/design-spec-gate.ts
function readPlan(tddDir, featureId) {
  const planPath = (0, import_path3.join)(tddDir, "features", `${featureId}`, "plan.json");
  if (!(0, import_fs3.existsSync)(planPath)) return null;
  return JSON.parse((0, import_fs3.readFileSync)(planPath, "utf8"));
}

// scripts/tdd/smells.ts
var import_fs4 = require("fs");
var import_path4 = require("path");
function readSmellsLog(tddDir) {
  const file = (0, import_path4.join)(tddDir, "smells.json");
  if (!(0, import_fs4.existsSync)(file)) return { detected: [] };
  return JSON.parse((0, import_fs4.readFileSync)(file, "utf8"));
}

// scripts/tdd/gates.ts
var import_fs5 = require("fs");
var import_path5 = require("path");
var GATES_SCHEMA_VERSION = 1;
var GATE_NAMES = ["spec", "plan", "test_list", "promote"];
var GATE_STATUSES = ["open", "approved", "superseded", "withdrawn"];
function defaultGatesState(featureId) {
  return {
    feature_id: featureId,
    schema_version: GATES_SCHEMA_VERSION,
    gates: {
      spec: { status: "open", history: [] },
      plan: { status: "open", history: [] },
      test_list: { status: "open", history: [] },
      promote: { status: "open", history: [] }
    }
  };
}
function readGates(featureId, opts = {}) {
  const tddDir = opts.tddDir ?? "./.tdd";
  const file = gatesFilePath(tddDir, featureId);
  if (!(0, import_fs5.existsSync)(file)) {
    return defaultGatesState(featureId);
  }
  const raw = (0, import_fs5.readFileSync)(file, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`gates.json at ${file} is not valid JSON: ${cause}`);
  }
  return validateGatesState(parsed, file);
}
function gatesFilePath(tddDir, featureId) {
  return (0, import_path5.join)(findFeatureDir2(tddDir, featureId), "gates.json");
}
function findFeatureDir2(tddDir, featureId) {
  const featuresDir = (0, import_path5.join)(tddDir, "features");
  if (!(0, import_fs5.existsSync)(featuresDir)) {
    throw new Error(`${featuresDir} does not exist`);
  }
  const candidates = (0, import_fs5.readdirSync)(featuresDir).filter((d) => d.startsWith(featureId));
  if (candidates.length === 0) {
    throw new Error(`feature ${featureId} not found under ${featuresDir}`);
  }
  return (0, import_path5.join)(featuresDir, candidates[0]);
}
function validateGatesState(parsed, file) {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`gates.json at ${file} is not an object`);
  }
  const obj = parsed;
  if (typeof obj.feature_id !== "string" || obj.feature_id.length === 0) {
    throw new Error(`gates.json at ${file}: missing or invalid feature_id`);
  }
  if (typeof obj.schema_version !== "number") {
    throw new Error(`gates.json at ${file}: missing or invalid schema_version`);
  }
  if (typeof obj.gates !== "object" || obj.gates === null) {
    throw new Error(`gates.json at ${file}: missing or invalid gates`);
  }
  const gates = obj.gates;
  const out = {
    spec: validateGateRecord(gates.spec, "spec", file),
    plan: validateGateRecord(gates.plan, "plan", file),
    test_list: validateGateRecord(gates.test_list, "test_list", file),
    promote: validateGateRecord(gates.promote, "promote", file)
  };
  return {
    feature_id: obj.feature_id,
    schema_version: obj.schema_version,
    gates: out
  };
}
function validateGateRecord(parsed, gateName, file) {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`gates.json at ${file}: gate ${gateName} is not an object`);
  }
  const obj = parsed;
  const status = obj.status;
  if (typeof status !== "string" || !GATE_STATUSES.includes(status)) {
    throw new Error(
      `gates.json at ${file}: gate ${gateName} has invalid status (${String(status)}); expected one of ${GATE_STATUSES.join(", ")}`
    );
  }
  const history = obj.history;
  if (history !== void 0 && !Array.isArray(history)) {
    throw new Error(`gates.json at ${file}: gate ${gateName} history must be an array`);
  }
  return {
    status,
    approver: typeof obj.approver === "string" ? obj.approver : void 0,
    approved_at: typeof obj.approved_at === "string" ? obj.approved_at : void 0,
    artifact_hashes: obj.artifact_hashes && typeof obj.artifact_hashes === "object" ? obj.artifact_hashes : void 0,
    withdrawal_reason: typeof obj.withdrawal_reason === "string" ? obj.withdrawal_reason : void 0,
    history: history ?? []
  };
}

// scripts/tdd/feature-status.ts
var MAX_RECENT_LOG_ENTRIES = 5;
function readJsonIfExists(path3) {
  if (!(0, import_fs6.existsSync)(path3)) return null;
  return JSON.parse((0, import_fs6.readFileSync)(path3, "utf8"));
}
function timelineCycleCount(experimentDir) {
  const timeline = readJsonIfExists(
    (0, import_path6.join)(experimentDir, "timeline.json")
  );
  return timeline?.entries?.length ?? 0;
}
function summarizeTestList(tddDir, featureId) {
  try {
    const list = readMasterTestList(tddDir, featureId);
    const counters = {
      pending: 0,
      red: 0,
      green: 0,
      refactored: 0,
      skipped: 0
    };
    for (const item of list.items) counters[item.status]++;
    const total = list.items.length;
    const done = counters.green + counters.refactored;
    return {
      total,
      by_status: counters,
      completion_pct: total === 0 ? 0 : Math.round(done / total * 100)
    };
  } catch {
    return null;
  }
}
function readSelectionLogRecent(tddDir, limit) {
  const path3 = (0, import_path6.join)(tddDir, "selection-log.md");
  if (!(0, import_fs6.existsSync)(path3)) return [];
  const text = (0, import_fs6.readFileSync)(path3, "utf8");
  const entries = [];
  const headingRe = /^##\s+(\S+T\S+?)\s+–\s+(.+?)$/gm;
  let match;
  while ((match = headingRe.exec(text)) !== null) {
    entries.push({ timestamp: match[1], title: match[2].trim() });
  }
  return entries.slice(-limit);
}
function readGatesSummary(tddDir, featureId) {
  try {
    const state = readGates(featureId, { tddDir });
    const out = {};
    for (const name of GATE_NAMES) {
      const rec = state.gates[name];
      out[name] = {
        status: rec.status,
        approver: rec.approver ?? null,
        approved_at: rec.approved_at ?? null
      };
    }
    return out;
  } catch {
    return null;
  }
}
function readWorkflowState(tddDir) {
  const state = readJsonIfExists((0, import_path6.join)(tddDir, "workflow-state.json"));
  if (!state) return { phase: null, pointer: null };
  return {
    phase: state.phase ?? null,
    pointer: {
      feature_id: state.feature_id ?? null,
      story_id: state.story_id ?? null,
      ac_id: state.ac_id ?? null,
      cycle_id: state.cycle_id ?? null,
      experiment_id: state.experiment_id ?? null
    }
  };
}
function getFeatureStatus(tddDir, featureId) {
  const plan = readPlan(tddDir, featureId);
  const experimentRecords = listExperiments(tddDir, featureId);
  const experiments = experimentRecords.map((rec) => {
    const outcomes = readOutcomes(tddDir, featureId, rec.experiment_slug);
    return {
      slug: rec.experiment_slug,
      branch_id: rec.branch_id,
      status: outcomes?.status ?? null,
      tests_passed: outcomes?.tests_passed ?? null,
      tests_failed: outcomes?.tests_failed ?? null,
      schema_diff_summary: outcomes?.schema_diff_summary ?? null,
      cycle_count: timelineCycleCount(rec.dir)
    };
  });
  let smells = [];
  try {
    smells = readSmellsLog(tddDir).detected.filter((d) => !d.resolution);
  } catch {
    smells = [];
  }
  const { phase, pointer } = readWorkflowState(tddDir);
  return {
    feature_id: featureId,
    current_workflow_phase: phase,
    current_workflow_pointer: pointer,
    plan,
    test_list: summarizeTestList(tddDir, featureId),
    experiments,
    selection_log_recent: readSelectionLogRecent(tddDir, MAX_RECENT_LOG_ENTRIES),
    open_smells: smells,
    gates: readGatesSummary(tddDir, featureId)
  };
}
function formatTestPassRatio(exp) {
  if (exp.tests_passed === null && exp.tests_failed === null) {
    return "tests=n/a";
  }
  const passed = exp.tests_passed ?? 0;
  const failed = exp.tests_failed ?? 0;
  return `tests=${passed}/${passed + failed} pass`;
}
function renderFeatureStatus(snapshot) {
  const lines = [];
  lines.push(`Feature: ${snapshot.feature_id}`);
  if (snapshot.current_workflow_phase) {
    const ptr = snapshot.current_workflow_pointer;
    const focus = ptr?.feature_id === snapshot.feature_id ? " (active workflow)" : ptr?.feature_id ? ` (active workflow on ${ptr.feature_id})` : "";
    lines.push(`  Phase: ${snapshot.current_workflow_phase}${focus}`);
  } else {
    lines.push(`  Phase: unknown (no workflow-state.json)`);
  }
  if (snapshot.plan) {
    const plural = snapshot.plan.strategies.length === 1 ? "y" : "ies";
    lines.push(
      `  Plan: ${snapshot.plan.mode} (N=${snapshot.plan.N}, ${snapshot.plan.strategies.length} strateg${plural})`
    );
  } else {
    lines.push(`  Plan: not yet approved (design-spec gate pending)`);
  }
  if (snapshot.test_list) {
    const s = snapshot.test_list;
    const breakdown = Object.entries(s.by_status).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).join(" ");
    const done = s.by_status.green + s.by_status.refactored;
    lines.push(
      `  Test list: ${done}/${s.total} (${s.completion_pct}%)${breakdown ? `  [${breakdown}]` : ""}`
    );
  } else {
    lines.push(`  Test list: not yet written`);
  }
  lines.push(``);
  if (snapshot.experiments.length > 0) {
    lines.push(`Experiments (${snapshot.experiments.length}):`);
    for (const exp of snapshot.experiments) {
      lines.push(
        `  ${exp.slug.padEnd(28)} branch=${exp.branch_id.padEnd(22)} status=${(exp.status ?? "unknown").padEnd(11)} ${formatTestPassRatio(exp)}  cycles=${exp.cycle_count}`
      );
    }
  } else {
    lines.push(`Experiments: none cut yet`);
  }
  if (snapshot.gates) {
    lines.push(``);
    lines.push(`Gates:`);
    for (const name of GATE_NAMES) {
      const g = snapshot.gates[name];
      const when = g.approved_at ? ` @ ${g.approved_at}` : "";
      const by = g.approver ? ` by ${g.approver}` : "";
      lines.push(`  ${name.padEnd(10)} ${g.status}${when}${by}`);
    }
  }
  if (snapshot.selection_log_recent.length > 0) {
    lines.push(``);
    lines.push(`Recent decisions (${snapshot.selection_log_recent.length}):`);
    for (const entry of snapshot.selection_log_recent) {
      lines.push(`  ${entry.timestamp} \u2013 ${entry.title}`);
    }
  }
  lines.push(``);
  if (snapshot.open_smells.length > 0) {
    lines.push(`Open smells (${snapshot.open_smells.length}):`);
    for (const hit of snapshot.open_smells) {
      lines.push(`  ${hit.smell} \u2013 ${hit.detail}`);
    }
  } else {
    lines.push(`Open smells: none`);
  }
  return lines.join("\n") + "\n";
}

// scripts/tdd/feature-status.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--tdd":
        out.tdd = argv[++i];
        break;
      case "--json":
        out.json = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        if (!a.startsWith("--") && !out.featureId) {
          out.featureId = a;
        }
        break;
    }
  }
  return out;
}
var HELP = `lakebase-feature-status \u2014 one-screen snapshot of a feature's TDD workflow state

Usage:
  lakebase-feature-status <feature-id> [--tdd <dir>] [--json]

Flags:
  --tdd <dir>   Path to the .tdd/ directory (default: ./.tdd)
  --json        Print the snapshot as JSON instead of human-readable text
  --help, -h    Show this help message

Examples:
  lakebase-feature-status F1-checkout
  lakebase-feature-status F1-checkout --json | jq '.experiments[].slug'
  lakebase-feature-status F1-checkout --tdd path/to/.tdd
`;
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!args.featureId) {
    process.stderr.write(`Error: feature-id is required.

${HELP}`);
    return 2;
  }
  const tddDir = args.tdd ?? "./.tdd";
  const snapshot = getFeatureStatus(tddDir, args.featureId);
  if (args.json) {
    process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
  } else {
    process.stdout.write(renderFeatureStatus(snapshot));
  }
  return 0;
}
try {
  process.exit(main());
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
  process.exit(1);
}
//# sourceMappingURL=feature-status.cli.cjs.map