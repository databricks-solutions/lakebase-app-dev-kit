#!/usr/bin/env node

// scripts/lakebase/scm-state.cli.ts
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
function describeGates(state) {
  const currentIdx = STATE_INDEX[state.state];
  return SCM_STATES.map((name) => {
    const idx = STATE_INDEX[name];
    return {
      name,
      passed: idx <= currentIdx,
      current: name === state.state,
      invariants: invariantsForState(state, name)
    };
  });
}
function invariantsForState(state, forState) {
  const inv = [];
  const addIf = (cond, key) => {
    if (!cond) return;
    const raw = state[key];
    inv.push({
      key: String(key),
      present: raw !== void 0,
      value: typeof raw === "string" ? raw : void 0
    });
  };
  if (forState === "scaffold-complete") {
    addIf(true, "project_id");
    addIf(true, "tier_topology");
  }
  if (forState === "feature-claimed") {
    addIf(true, "feature_id");
    addIf(true, "branch");
    addIf(true, "parent_branch");
    addIf(true, "lakebase_branch_uid");
    addIf(true, "claimed_at");
  }
  if (forState === "pr-ready") {
    addIf(true, "pr_url");
    addIf(true, "pushed_at");
  }
  if (forState === "ci-green") {
    addIf(true, "ci_run_url");
    addIf(true, "ci_green_at");
  }
  if (forState === "merged") {
    addIf(true, "merged_at");
  }
  return inv;
}

// scripts/lakebase/scm-state.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--project-dir":
      case "--cwd":
        out.projectDir = argv[++i];
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
      default:
        break;
    }
  }
  return out;
}
var HELP = `lakebase-scm-state (phase A)

Inspect the SCM workflow state for a paired project. Reads
\`.lakebase/workflow-state.json\` and prints the current state plus the
gate ladder.

Usage:
  lakebase-scm-state [flags]

Flags:
  --project-dir <dir>    Project to inspect (default: cwd)
  --json                 Machine-readable JSON output
  --pretty               Pretty-print JSON (only with --json)
  -h, --help             Show this help

Exit codes:
  0 = state file readable
  1 = no state file
  2 = state file present but invalid
`;
function buildReport(projectDir) {
  const stateFile = path2.join(projectDir, ".lakebase/workflow-state.json");
  try {
    const state = readWorkflowState(projectDir);
    if (!state) {
      return { projectDir, stateFile, found: false };
    }
    return {
      projectDir,
      stateFile,
      found: true,
      state,
      gates: describeGates(state)
    };
  } catch (e) {
    return {
      projectDir,
      stateFile,
      found: true,
      error: e.message
    };
  }
}
function renderHuman(report) {
  const lines = [];
  lines.push(`SCM workflow state: ${report.stateFile}`);
  if (!report.found) {
    lines.push("");
    lines.push("  (no state file)");
    lines.push("");
    lines.push(
      "  This project has not been scaffolded with the SCM workflow"
    );
    lines.push(
      "  state machine, or pre-dates phase A. Run lakebase-create-project"
    );
    lines.push(
      "  to scaffold, or write an initial scaffold-complete state via"
    );
    lines.push("  the SCM helpers.");
    return lines.join("\n");
  }
  if (report.error) {
    lines.push("");
    lines.push("  INVALID:");
    for (const ln of report.error.split("\n")) {
      lines.push(`    ${ln}`);
    }
    return lines.join("\n");
  }
  const state = report.state;
  const gates = report.gates;
  if (!state || !gates) {
    return lines.join("\n");
  }
  lines.push("");
  lines.push(`  state          : ${state.state}`);
  lines.push(`  tier_topology  : ${tierLabel(state.tier_topology)}`);
  lines.push(`  project_id     : ${state.project_id}`);
  if (state.feature_id) {
    lines.push(`  feature_id     : ${state.feature_id}`);
  }
  if (state.branch) {
    lines.push(`  branch         : ${state.branch}`);
  }
  if (state.parent_branch) {
    lines.push(`  parent_branch  : ${state.parent_branch}`);
  }
  if (state.lakebase_branch_uid) {
    lines.push(`  lakebase_uid   : ${state.lakebase_branch_uid}`);
  }
  if (state.pr_url) {
    lines.push(`  pr_url         : ${state.pr_url}`);
  }
  if (state.ci_run_url) {
    lines.push(`  ci_run_url     : ${state.ci_run_url}`);
  }
  lines.push("");
  lines.push("  gates:");
  for (const gate of gates) {
    const marker = gate.current ? ">" : gate.passed ? "+" : " ";
    const label = gate.current ? "(current)" : gate.passed ? "(passed)" : "(pending)";
    lines.push(`    ${marker} ${gate.name.padEnd(20)} ${label}`);
    for (const inv of gate.invariants) {
      const checkmark = inv.present ? "ok " : "   ";
      lines.push(`        ${checkmark} ${inv.key}`);
    }
  }
  lines.push("");
  lines.push(
    "  (advisory: this CLI is read-only; phase B introduces transition CLIs)"
  );
  return lines.join("\n");
}
function tierLabel(t) {
  switch (t) {
    case 1:
      return "1 (prod only)";
    case 2:
      return "2 (prod + staging)";
    case 3:
      return "3 (prod + staging + dev)";
  }
}
function exitCodeFor(report) {
  if (!report.found) return 1;
  if (report.error) return 2;
  return 0;
}
function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}
`);
    return 0;
  }
  const projectDir = path2.resolve(args.projectDir ?? process.cwd());
  const report = buildReport(projectDir);
  if (args.json) {
    const indent = args.pretty ? 2 : 0;
    process.stdout.write(`${JSON.stringify(report, null, indent)}
`);
  } else {
    process.stdout.write(`${renderHuman(report)}
`);
  }
  return exitCodeFor(report);
}
if (isCliEntry(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
export {
  main as runScmStateCli
};
//# sourceMappingURL=scm-state.cli.js.map