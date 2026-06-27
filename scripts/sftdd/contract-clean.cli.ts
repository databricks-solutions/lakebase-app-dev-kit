#!/usr/bin/env node
// CLI for the contract-clean gate: prove that no production code still references a
// column/symbol a migration DROPPED (software-design-principles hard rule 9, the
// contract half of expand/contract). Deterministic + model-independent, mirroring
// lakebase-sftdd-layering-clean / lakebase-sftdd-imports-clean.
//
// Exit 0 = clean (no migration drops, or every dropped symbol is gone from the code).
// Exit 1 = production code still references a net-dropped symbol , the
//          `contract-incompleteness` smell. Prints the exact file:line list +
//          remediation (the same precise directive the GREEN-verify self-heal feeds
//          the Driver).
//
// Usage:
//   lakebase-sftdd-contract-clean [--project-dir <path>] [--migrations <rel> ...]
//                               [--code <rel> ...] [--json]

import { checkContractClean, type ContractCleanArgs } from "./contract-clean.js";

interface Parsed {
  projectDir: string;
  migrations: string[];
  code: string[];
  json: boolean;
}

function parse(argv: string[]): Parsed {
  const out: Parsed = { projectDir: process.cwd(), migrations: [], code: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--migrations" && i + 1 < argv.length) out.migrations.push(argv[++i]);
    else if (a === "--code" && i + 1 < argv.length) out.code.push(argv[++i]);
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}

function help(): never {
  process.stdout.write(
    `lakebase-sftdd-contract-clean , prove no code references a column a migration dropped\n\n` +
      `Usage:\n` +
      `  lakebase-sftdd-contract-clean [--project-dir <path>] [--migrations <rel> ...] [--code <rel> ...] [--json]\n\n` +
      `Exit 0 = clean (no drops, or all dropped symbols gone from code); exit 1 = residual references (hard rule 9).\n`,
  );
  process.exit(0);
}

const p = parse(process.argv.slice(2));
const callArgs: ContractCleanArgs = { projectDir: p.projectDir };
if (p.migrations.length > 0) callArgs.migrationDirs = p.migrations;
if (p.code.length > 0) callArgs.codeDirs = p.code;

const r = checkContractClean(callArgs);

if (p.json) {
  process.stdout.write(`${JSON.stringify(r)}\n`);
} else if (r.clean) {
  const what = r.droppedSymbols.length
    ? `dropped [${r.droppedSymbols.join(", ")}] no longer referenced in code`
    : "no migration column drops to check";
  process.stdout.write(`contract-clean: OK , ${what}\n`);
} else {
  process.stderr.write(`contract-clean: FAILED , ${r.violations.length} residual reference(s).\n\n${r.remediation}\n`);
}

process.exit(r.clean ? 0 : 1);
