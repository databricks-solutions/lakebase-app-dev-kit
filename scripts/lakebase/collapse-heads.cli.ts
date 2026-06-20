#!/usr/bin/env node
// CLI: collapse multiple migration heads into one via the project's tool adapter.
//
//   lakebase-sftdd-collapse-heads [--project-dir <dir>] [--language <lang>]
//                               [--message "<msg>"] [--dry-run]
//
// Only DAG tools (Alembic) can have multiple heads; for Flyway / Knex (flat
// ordered lists) this is always a no-op. Run it at a sibling-merge boundary
// (after two feature branches land on a tier) to unify the heads timestamp ids
// leave behind. --dry-run reports the heads without creating a merge revision.
//
// Prints the CollapseHeadsResult JSON on stdout, progress on stderr.

import {
  collapseMigrationHeads,
  type SchemaMigrationLanguage,
} from "./schema-migrate.js";

interface ParsedArgs {
  projectDir?: string;
  language?: SchemaMigrationLanguage;
  message?: string;
  dryRun?: boolean;
  pretty?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--language":
        out.language = argv[++i] as SchemaMigrationLanguage;
        break;
      case "--message":
      case "-m":
        out.message = argv[++i];
        break;
      case "--dry-run":
        out.dryRun = true;
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

const BIN_NAME = "lakebase-sftdd-collapse-heads";

function help(): string {
  return `${BIN_NAME} (unify multiple migration heads at a sibling-merge boundary)

Usage:
  ${BIN_NAME} [flags]

Flags:
  --project-dir <dir>  Project root (default: cwd)
  --language <lang>    java | kotlin | python | nodejs (default: auto-detect)
  --message, -m <txt>  Message for the merge revision (Alembic; default: "merge heads")
  --dry-run            Report the heads without creating a merge revision
  --pretty             Pretty-print JSON output

By tool:
  python (alembic)  >1 head -> creates a merge revision (alembic merge heads)
  java   (flyway)   no-op (flat ordered list, no DAG)
  nodejs (knex)     no-op (flat ordered list, no DAG)

Exit status reflects the result.status: ok | noop (both 0), error (1).
`;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(help());
    return 0;
  }
  try {
    const result = await collapseMigrationHeads({
      projectDir: args.projectDir ?? process.cwd(),
      language: args.language,
      message: args.message,
      dryRun: args.dryRun,
    });
    if (result.status === "ok" && result.mergeRevision) {
      process.stderr.write(`collapsed ${result.headsBefore.length} heads into ${result.mergeRevision}\n`);
    } else if (result.status === "ok" && args.dryRun) {
      process.stderr.write(`${result.headsBefore.length} heads present (dry-run, not merged)\n`);
    } else {
      process.stderr.write(`nothing to collapse (<=1 head)\n`);
    }
    process.stdout.write((args.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result)) + "\n");
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
