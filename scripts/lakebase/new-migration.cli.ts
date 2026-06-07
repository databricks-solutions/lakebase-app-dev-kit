#!/usr/bin/env node
// CLI: create a new, correctly-named migration via the project's tool adapter.
//
//   lakebase-tdd-new-migration --name "<description>" [--project-dir <dir>]
//                              [--language <lang>] [--autogenerate
//                               --instance <id> --branch <name> ...]
//
// The build (Driver) calls THIS instead of `alembic` / `flyway` / `knex`
// directly, so it never has to know which tool the project uses. Each adapter
// names the migration in its own native sequential scheme:
//   - Alembic (python): zero-padded rev-id -> 0001_<slug>.py, 0002_<slug>.py
//   - Flyway (java):     next V<n>__<slug>.sql skeleton
//   - Knex (nodejs):     `knex migrate:make` -> <timestamp>_<slug>.js
//
// --autogenerate (Alembic only) diffs the SQLAlchemy models against the live
// branch DB to pre-populate the body; it requires --instance + --branch.
// Without it an empty skeleton is created (no DB) for the Driver to fill in.
//
// Prints the NewMigrationResult JSON on stdout, progress on stderr.

import {
  createSchemaMigration,
  type SchemaMigrationLanguage,
} from "./schema-migrate.js";

interface ParsedArgs {
  name?: string;
  projectDir?: string;
  language?: SchemaMigrationLanguage;
  autogenerate?: boolean;
  instance?: string;
  branch?: string;
  database?: string;
  endpointName?: string;
  pretty?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--name":
      case "-m":
        out.name = argv[++i];
        break;
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--language":
        out.language = argv[++i] as SchemaMigrationLanguage;
        break;
      case "--autogenerate":
        out.autogenerate = true;
        break;
      case "--instance":
        out.instance = argv[++i];
        break;
      case "--branch":
        out.branch = argv[++i];
        break;
      case "--database":
        out.database = argv[++i];
        break;
      case "--endpoint":
      case "--endpoint-name":
        out.endpointName = argv[++i];
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

const BIN_NAME = "lakebase-tdd-new-migration";

function help(): string {
  return `${BIN_NAME} (create a tool-native, sequentially-named migration)

Usage:
  ${BIN_NAME} --name "<description>" [flags]

Flags:
  --name, -m <text>    Human description; slugified into the filename (required)
  --project-dir <dir>  Project root (default: cwd)
  --language <lang>    java | kotlin | python | nodejs (default: auto-detect)
  --autogenerate       Alembic only: diff models vs the branch DB to populate
                       the body (requires --instance + --branch)
  --instance <id>      Lakebase project id (only with --autogenerate)
  --branch <name>      Branch whose DB to diff against (only with --autogenerate)
  --database <db>      Database name (only with --autogenerate)
  --endpoint <name>    Endpoint identifier (only with --autogenerate)
  --pretty             Pretty-print JSON output

Naming, by tool:
  python (alembic)  0001_<slug>.py, 0002_<slug>.py, ... (zero-padded, counts up)
  java   (flyway)   V<n>__<slug>.sql skeleton (the Driver writes the SQL)
  nodejs (knex)     <timestamp>_<slug>.js via 'knex migrate:make' (native scheme)

Examples:
  ${BIN_NAME} --name "create bugs table"
  ${BIN_NAME} --name "add users" --autogenerate --instance proj-x --branch feature/foo
`;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(help());
    return 0;
  }
  if (!args.name) {
    process.stderr.write(`${BIN_NAME}: --name is required.\n\n${help()}`);
    return 2;
  }
  if (args.autogenerate && (!args.instance || !args.branch)) {
    process.stderr.write(`${BIN_NAME}: --autogenerate requires --instance and --branch.\n`);
    return 2;
  }
  try {
    const result = await createSchemaMigration({
      slug: args.name,
      projectDir: args.projectDir ?? process.cwd(),
      language: args.language,
      autogenerate: args.autogenerate,
      instance: args.instance,
      branch: args.branch,
      database: args.database,
      endpointName: args.endpointName,
    });
    process.stderr.write(`created ${result.filename} (version ${result.version})\n`);
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
