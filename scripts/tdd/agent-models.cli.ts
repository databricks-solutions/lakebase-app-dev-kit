#!/usr/bin/env node
// resolve the model the orchestrator should spawn a TDD-workflow
// role agent with, given the project's .lakebase/agent-config.json (override ->
// recommended -> inherit). Used by the /plan, /design, /build, /deploy command
// orchestrator to pass the right model per role.
//
// Usage:
//   lakebase-tdd-agent-model --role <role> [--project-dir <dir>] [--json]
//   lakebase-tdd-agent-model --list        [--project-dir <dir>] [--json]
//
// Exit: 0 ok; 2 bad args (unknown role / missing --role and --list).

import {
  ALL_AGENT_ROLES,
  resolveModelForRole,
  readAgentConfig,
  type SpawnableAgentRole,
} from "./agent-models";

interface Args {
  role?: string;
  list?: boolean;
  projectDir: string;
  json?: boolean;
}

function parse(argv: string[]): Args {
  const out: Args = { projectDir: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--role") out.role = argv[++i];
    else if (a === "--list") out.list = true;
    else if (a === "--project-dir") out.projectDir = argv[++i];
    else if (a === "--json") out.json = true;
  }
  return out;
}

function main(): number {
  const args = parse(process.argv.slice(2));

  if (args.list) {
    const cfg = readAgentConfig(args.projectDir);
    const rows = ALL_AGENT_ROLES.map((role) => ({
      role,
      recommended: cfg?.roles?.[role]?.recommended,
      resolved: resolveModelForRole(role, args.projectDir),
    }));
    if (args.json) {
      process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    } else {
      for (const r of rows) process.stdout.write(`${r.role}\t${r.resolved}\n`);
    }
    return 0;
  }

  if (!args.role || !ALL_AGENT_ROLES.includes(args.role as SpawnableAgentRole)) {
    process.stderr.write(
      `Usage: lakebase-tdd-agent-model --role <role> [--project-dir <dir>] [--json]\n` +
        `       lakebase-tdd-agent-model --list [--project-dir <dir>] [--json]\n` +
        `roles: ${ALL_AGENT_ROLES.join(", ")}\n`,
    );
    return 2;
  }

  const role = args.role as SpawnableAgentRole;
  const resolved = resolveModelForRole(role, args.projectDir);
  if (args.json) {
    const entry = readAgentConfig(args.projectDir)?.roles?.[role];
    process.stdout.write(
      JSON.stringify({ role, resolved, recommended: entry?.recommended, override: entry?.override }, null, 2) + "\n",
    );
  } else {
    process.stdout.write(resolved + "\n");
  }
  return 0;
}

process.exit(main());
