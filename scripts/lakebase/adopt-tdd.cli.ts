#!/usr/bin/env node
// CLI wrapper around adoptTdd. Brownfield-only entry point: drop
// `.tdd/` into an existing repo. Sibling to `lakebase-create-project`,
// which is the greenfield path. See `adopt-tdd.ts` for the orchestrator.

import { adoptTdd, type AdoptTddArgs } from "./adopt-tdd.js";

interface ParsedArgs {
  projectDir?: string;
  update?: boolean;
  force?: boolean;
  dryRun?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--project-dir":
      case "-C":
        out.projectDir = argv[++i];
        break;
      case "--update":
        out.update = true;
        break;
      case "--force":
        out.force = true;
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        if (!a.startsWith("-") && !out.projectDir) {
          out.projectDir = a;
        }
        break;
    }
  }
  return out;
}

const HELP = `lakebase-adopt-tdd – bootstrap the .tdd/ workflow tree on an existing repo

Usage:
  lakebase-adopt-tdd [path]                     fresh adoption; fails if .tdd/ exists
  lakebase-adopt-tdd [path] --update            report drift, add missing files
  lakebase-adopt-tdd [path] --update --force    additionally overwrite drifted files
  lakebase-adopt-tdd [path] --dry-run --update  preview without writing

Flags:
  --project-dir <path>, -C <path>   Project root (defaults to current directory)
  --update                          Allow running on a project that already has .tdd/
  --force                           Overwrite drifted template files (implies --update)
  --dry-run                         Report what would change; write nothing
  --help, -h                        Show this help

Output: JSON to stdout: { added, inSync, drifted, updated, noChanges }
       Exit codes:
         0 - success (whether or not changes were applied)
         1 - operational failure (not a git repo, .tdd/ exists without --update, etc.)
`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const input: AdoptTddArgs = {
    projectDir: args.projectDir ?? process.cwd(),
    update: args.update,
    force: args.force,
    dryRun: args.dryRun,
  };
  const result = adoptTdd(input);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
);
