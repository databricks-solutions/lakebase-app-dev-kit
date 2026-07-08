#!/usr/bin/env node
// lakebase-sftdd-response-formatter: the AGENT-SIDE precheck a role runs on its
// OWN output before returning. It type-checks the artifact the role just wrote
// against that role's contract and THROWS (exit 1) listing the specific
// violations, so a role catches its own nonconformance locally instead of
// handing back null/garbage and forcing an orchestrator retry. A role whose
// output conforms exits 0.
//
//   lakebase-sftdd-response-formatter --role test-strategist --feature F1 --story S2 [--tdd-dir D]
//
// Exit: 0 conforms; 1 violations (printed to stderr); 2 bad args.

import { join } from "path";
import { resolveSftddDir } from "./sftdd-paths.js";
import { formatRoleResponse, FORMATTED_ROLES } from "./response-formatter.js";

interface Args {
  role?: string;
  feature?: string;
  story?: string;
  sftddDir?: string;
}

function parse(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--role": out.role = argv[++i]; break;
      case "--feature": out.feature = argv[++i]; break;
      case "--story": out.story = argv[++i]; break;
      case "--tdd-dir": out.sftddDir = argv[++i]; break;
    }
  }
  return out;
}

function usage(msg: string): number {
  process.stderr.write(
    `${msg}\nUsage: lakebase-sftdd-response-formatter --role <role> --feature <F> [--story <S>] [--tdd-dir <D>]\n` +
      `Type-checked roles: ${[...FORMATTED_ROLES].join(", ")} (others pass , no deterministic contract yet).\n`,
  );
  return 2;
}

function main(): number {
  const a = parse(process.argv.slice(2));
  if (!a.role) return usage("Error: --role is required.");
  if (!a.feature) return usage("Error: --feature is required.");
  const sftddDir = a.sftddDir ?? resolveSftddDir();

  const result = formatRoleResponse({ role: a.role, sftddDir, featureId: a.feature, story: a.story });
  if (result.ok) {
    process.stdout.write(`response-formatter: ${a.role}${a.story ? ` (${a.story})` : ""} output conforms.\n`);
    return 0;
  }
  process.stderr.write(
    `response-formatter: ${a.role}${a.story ? ` (${a.story})` : ""} output does NOT conform , fix it before returning:\n` +
      result.violations.map((v) => `  - ${v.artifact}: ${v.problem}`).join("\n") +
      "\n",
  );
  return 1;
}

process.exit(main());
