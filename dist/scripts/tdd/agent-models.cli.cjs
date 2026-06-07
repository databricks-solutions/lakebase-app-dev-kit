#!/usr/bin/env node
"use strict";

// scripts/tdd/agent-models.ts
var import_fs = require("fs");
var import_path = require("path");
var RECOMMENDED_MODELS = {
  "spec-author": "opus",
  "architect-reviewer": "opus",
  "test-strategist": "sonnet",
  "ux-designer": "sonnet",
  navigator: "sonnet",
  driver: "sonnet",
  "product-owner": "opus",
  "release-engineer": "sonnet"
};
var ALL_AGENT_ROLES = Object.keys(RECOMMENDED_MODELS);
var AGENT_CONFIG_REL = (0, import_path.join)(".lakebase", "agent-config.json");
function readAgentConfig(projectDir) {
  const p = (0, import_path.join)(projectDir, AGENT_CONFIG_REL);
  if (!(0, import_fs.existsSync)(p)) return void 0;
  return JSON.parse((0, import_fs.readFileSync)(p, "utf8"));
}
function resolveModelForRole(role, projectDir) {
  const spawnable = role;
  const entry = readAgentConfig(projectDir)?.roles?.[spawnable];
  return entry?.override ?? entry?.recommended ?? RECOMMENDED_MODELS[spawnable] ?? "inherit";
}

// scripts/tdd/agent-models.cli.ts
function parse(argv) {
  const out = { projectDir: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--role") out.role = argv[++i];
    else if (a === "--list") out.list = true;
    else if (a === "--project-dir") out.projectDir = argv[++i];
    else if (a === "--json") out.json = true;
  }
  return out;
}
function main() {
  const args = parse(process.argv.slice(2));
  if (args.list) {
    const cfg = readAgentConfig(args.projectDir);
    const rows = ALL_AGENT_ROLES.map((role2) => ({
      role: role2,
      recommended: cfg?.roles?.[role2]?.recommended,
      resolved: resolveModelForRole(role2, args.projectDir)
    }));
    if (args.json) {
      process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    } else {
      for (const r of rows) process.stdout.write(`${r.role}	${r.resolved}
`);
    }
    return 0;
  }
  if (!args.role || !ALL_AGENT_ROLES.includes(args.role)) {
    process.stderr.write(
      `Usage: lakebase-tdd-agent-model --role <role> [--project-dir <dir>] [--json]
       lakebase-tdd-agent-model --list [--project-dir <dir>] [--json]
roles: ${ALL_AGENT_ROLES.join(", ")}
`
    );
    return 2;
  }
  const role = args.role;
  const resolved = resolveModelForRole(role, args.projectDir);
  if (args.json) {
    const entry = readAgentConfig(args.projectDir)?.roles?.[role];
    process.stdout.write(
      JSON.stringify({ role, resolved, recommended: entry?.recommended, override: entry?.override }, null, 2) + "\n"
    );
  } else {
    process.stdout.write(resolved + "\n");
  }
  return 0;
}
process.exit(main());
//# sourceMappingURL=agent-models.cli.cjs.map