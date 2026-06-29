#!/usr/bin/env node
// CLI wrapper for getSchemaDiff. Prints the SchemaDiffResult JSON to stdout.

import { getSchemaDiff, formatSchemaDiffAsMarkdown } from "./schema-diff.js";

type OutputFormat = "json" | "markdown";

interface ParsedArgs {
  instance?: string;
  branch?: string;
  comparisonBranch?: string;
  database?: string;
  schema?: string;
  format?: OutputFormat;
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
      case "--branch":
        out.branch = argv[++i];
        break;
      case "--comparison-branch":
      case "--against":
        out.comparisonBranch = argv[++i];
        break;
      case "--database":
        out.database = argv[++i];
        break;
      case "--schema":
        out.schema = argv[++i];
        break;
      case "--format": {
        const v = argv[++i];
        if (v === "json" || v === "markdown") {
          out.format = v;
        } else {
          // Tolerate unknown values silently here; main() will surface a
          // usage error if format is unexpected after parse.
          out.format = v as OutputFormat;
        }
        break;
      }
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

const HELP = `lakebase-schema-diff – parent-aware schema diff between two Lakebase branches

Usage:
  lakebase-schema-diff --instance <id> --branch <name> [--against <parent>] [--database <db>] [--pretty]

Behavior:
  When --against is omitted, the comparison branch is resolved from Lakebase
  metadata: the target's sourceBranchId (its parent), falling back to the
  project's default branch.

Output:
  JSON on stdout. Shape matches the extension's SchemaDiffResult so the
  modal/webview can consume identical JSON from either call site.

Flags:
  --instance           Lakebase project id (required)
  --branch             Target branch to diff FOR (required)
  --against / --comparison-branch
                       Explicit parent branch (default: resolved from metadata)
  --database           Database name (default: $PGDATABASE or "databricks_postgres")
  --schema <name|all>  Postgres schema to diff (default: "public"). A specific
                       schema (e.g. "cfg") diffs objects outside public; "all"
                       (or "*") diffs every non-system schema, qualifying names
                       as schema.table.
  --format <json|markdown>
                       Output format. "json" (default) emits the structured
                       SchemaDiffResult. "markdown" emits the canonical
                       "SCHEMA CHANGES (Lakebase diff)" block consumed by
                       prepare-commit-msg hook, GH Actions PR comment, and
                       the extension's commit-detail view.
  --pretty             Pretty-print JSON output (no effect on markdown)

Examples:
  lakebase-schema-diff --instance proj-abc --branch br-feature
  lakebase-schema-diff --instance proj-abc --branch br-feature --against br-staging --pretty
  lakebase-schema-diff --instance proj-abc --branch br-feature --format markdown
`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!args.instance) {
    process.stderr.write("Error: --instance is required.\n");
    return 2;
  }
  if (!args.branch) {
    process.stderr.write("Error: --branch is required.\n");
    return 2;
  }

  const format: OutputFormat = args.format ?? "json";
  if (format !== "json" && format !== "markdown") {
    process.stderr.write(
      `Error: --format must be "json" or "markdown" (got "${format}")\n`
    );
    return 2;
  }

  const result = await getSchemaDiff({
    instance: args.instance,
    branch: args.branch,
    comparisonBranch: args.comparisonBranch,
    database: args.database,
    schema: args.schema,
  });

  if (format === "markdown") {
    process.stdout.write(formatSchemaDiffAsMarkdown(result));
  } else {
    process.stdout.write(
      args.pretty ? JSON.stringify(result, null, 2) + "\n" : JSON.stringify(result) + "\n"
    );
  }
  return result.error ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
);
