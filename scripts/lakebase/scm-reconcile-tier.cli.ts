#!/usr/bin/env node
// lakebase-reconcile-tier: reconcile a shared TIER branch whose DB is ahead of code
// (FEIP-8050 Finding 21 GAP A). DESTRUCTIVE + operator-invoked: drops the named
// orphan tables and stamps the tier to the code head so alembic can proceed. Refuses
// on a tier that is not actually db-ahead.

import { reconcileTierBranch } from "./scm-reconcile-tier.js";
import { readWorkflowState } from "./scm-workflow-state.js";
import type { SchemaMigrationLanguage } from "./schema-migrate.js";

interface ParsedArgs {
  instance?: string;
  branch?: string;
  toRevision?: string;
  dropTables: string[];
  projectDir?: string;
  language?: string;
  json?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { dropTables: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--instance": out.instance = argv[++i]; break;
      case "--branch": out.branch = argv[++i]; break;
      case "--to-revision": out.toRevision = argv[++i]; break;
      case "--drop-table": out.dropTables.push(argv[++i]); break;
      case "--project-dir": case "--cwd": out.projectDir = argv[++i]; break;
      case "--language": out.language = argv[++i]; break;
      case "--json": out.json = true; break;
      case "--help": case "-h": out.help = true; break;
      default:
        process.stderr.write(`Unknown flag: ${a}\n`);
        process.exit(2);
    }
  }
  return out;
}

const HELP = `lakebase-reconcile-tier – reconcile a shared TIER branch whose DB is ahead of code

A tier branch (staging / prod / dev) left with a phantom alembic_version (a revision
with no local file) + orphan tables by an aborted build makes every later migrate fail
"Can't locate revision". This drops the named orphan tables and stamps the tier to the
code head (no migrations run), so alembic can proceed. Refuses on a tier that is NOT
db-ahead (a stamp is destructive on a shared branch).

Usage:
  lakebase-reconcile-tier --branch <tier> [--instance <id>] [--to-revision <rev>]
                          [--drop-table <name> ...] [--project-dir <dir>] [--json]

Flags:
  --branch <tier>       REQUIRED. The tier branch to reconcile (staging / prod / dev / ...).
  --instance <id>       Lakebase project id. Default: project_id from .lakebase/workflow-state.json.
  --to-revision <rev>   Revision to stamp to. Default: the local code head.
  --drop-table <name>   Orphan table to DROP before stamping (repeatable). Named by you
                        from the failure; never auto-detected. Simple identifiers only.
  --project-dir <dir>   Project root (holds migrations + .lakebase/). Default: cwd.
  --language <lang>     Force the migration tool's language (java/kotlin/python/nodejs).
  --json                Emit the result as JSON.
  --help, -h            Show this help.
`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const projectDir = args.projectDir ?? process.cwd();
  if (!args.branch) {
    process.stderr.write("Error: --branch <tier> is required.\n\n" + HELP);
    return 2;
  }
  const instance = args.instance ?? readWorkflowState(projectDir)?.project_id;
  if (!instance) {
    process.stderr.write("Error: --instance is required (or a .lakebase/workflow-state.json with project_id).\n");
    return 2;
  }

  const result = await reconcileTierBranch({
    instance,
    branch: args.branch,
    projectDir,
    toRevision: args.toRevision,
    dropTables: args.dropTables,
    language: args.language as SchemaMigrationLanguage | undefined,
  });

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(result.reason + "\n");
  }
  // Not-reconciled because the tier was healthy is a SUCCESS (nothing to do);
  // it only fails on an actual error (which reconcileTierBranch throws).
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
