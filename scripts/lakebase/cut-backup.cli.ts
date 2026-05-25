#!/usr/bin/env node
// CLI for the cutBackup primitive (FEIP-7096).
//
//   lakebase-cut-backup --instance <id> --source <branch> --name <backup>
//
// Prints JSON on stdout, progress on stderr.

import { cutBackup } from "./cut-backup.js";

interface ParsedArgs {
  instance?: string;
  source?: string;
  name?: string;
  host?: string;
  pretty?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--instance":
        out.instance = argv[++i];
        break;
      case "--source":
        out.source = argv[++i];
        break;
      case "--name":
        out.name = argv[++i];
        break;
      case "--host":
        out.host = argv[++i];
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

const HELP = `lakebase-cut-backup (FEIP-7096)

Snapshot a Lakebase branch by forking a new branch off it. Use for
"cut prod-backup" before a release migrates production.

Flags:
  --instance <id>      Lakebase project id (required)
  --source <branch>    Branch to snapshot (required, e.g. production)
  --name <backup>      Name for the backup branch (required)
  --host <url>         Databricks workspace URL (default: $DATABRICKS_HOST)
  --pretty             Pretty-print JSON output

Example:
  lakebase-cut-backup --instance proj-x --source production --name prod-backup-v1.2.3
`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!args.instance || !args.source || !args.name) {
    process.stderr.write("cut-backup: --instance, --source, and --name are required.\n\n" + HELP);
    return 2;
  }

  try {
    const result = await cutBackup({
      instance: args.instance,
      sourceBranch: args.source,
      backupName: args.name,
      host: args.host,
    });
    process.stdout.write(
      (args.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result)) + "\n"
    );
    return 0;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
);
