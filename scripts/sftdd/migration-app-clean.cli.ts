#!/usr/bin/env node
// CLI for the migration-app-clean gate: prove that no migration imports app code at
// module scope (the migration-app-coupling smell). Deterministic + model-independent,
// mirroring lakebase-sftdd-contract-clean / lakebase-sftdd-layering-clean.
//
// Exit 0 = clean (no migration imports app.* at module scope).
// Exit 1 = a migration imports app code at module scope, the `migration-app-coupling`
//          smell. Prints the exact file:line list + remediation (inline a frozen copy
//          of the logic, or use raw SQL).
//
// Usage:
//   lakebase-sftdd-migration-clean [--project-dir <path>] [--migrations <rel> ...] [--json]

import { checkMigrationAppClean, type MigrationAppCleanArgs } from "./migration-app-clean.js";

interface Parsed {
  projectDir: string;
  migrations: string[];
  json: boolean;
}

function parse(argv: string[]): Parsed {
  const out: Parsed = { projectDir: process.cwd(), migrations: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--migrations" && i + 1 < argv.length) out.migrations.push(argv[++i]);
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}

function help(): never {
  process.stdout.write(
    `lakebase-sftdd-migration-clean: prove no migration imports app code at module scope\n\n` +
      `Usage:\n` +
      `  lakebase-sftdd-migration-clean [--project-dir <path>] [--migrations <rel> ...] [--json]\n\n` +
      `Exit 0 = clean; exit 1 = a migration imports app.* at module scope (migration-app-coupling).\n`,
  );
  process.exit(0);
}

const p = parse(process.argv.slice(2));
const callArgs: MigrationAppCleanArgs = { projectDir: p.projectDir };
if (p.migrations.length > 0) callArgs.migrationDirs = p.migrations;

const r = checkMigrationAppClean(callArgs);

if (p.json) {
  process.stdout.write(`${JSON.stringify(r)}\n`);
} else if (r.clean) {
  process.stdout.write(`migration-app-clean: OK (no migration imports app.* at module scope)\n`);
} else {
  process.stderr.write(`migration-app-clean: FAILED (${r.violations.length} module-scope app import(s)).\n\n${r.remediation}\n`);
}

process.exit(r.clean ? 0 : 1);
