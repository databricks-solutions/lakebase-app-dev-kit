#!/usr/bin/env node
// CLI wrapper for the [Infra]-tag runner. Scaffolded projects' `test:infra`
// script invokes this bin via `npx lakebase-infra-runner`. `instance` and
// `branch` come from --flags first, then env (`LAKEBASE_PROJECT_ID` +
// `LAKEBASE_BRANCH_ID`), so the same invocation works in a fresh dev
// shell (env set by the post-checkout hook) and in CI (env set by the
// resolve-credentials step).

import { runInfraSuite, type RunInfraSuiteArgs } from "./infra-runner.js";

interface ParsedArgs {
  instance?: string;
  branch?: string;
  projectDir?: string;
  comparisonBranch?: string;
  junitOutput?: string;
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
      case "--project-dir":
      case "-C":
        out.projectDir = argv[++i];
        break;
      case "--comparison-branch":
        out.comparisonBranch = argv[++i];
        break;
      case "--junit-output":
        out.junitOutput = argv[++i];
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

const HELP = `lakebase-infra-runner – [Infra]-tag suite for a Lakebase branch

Usage:
  lakebase-infra-runner [flags...]

Flags:
  --instance <id>            Lakebase project id
                             (default: $LAKEBASE_PROJECT_ID)
  --branch <name>            Branch to test against
                             (default: $LAKEBASE_BRANCH_ID)
  --project-dir <path>, -C   Project root for migration language detection
                             (default: current working directory)
  --comparison-branch <name> Override the schema-diff parent
  --junit-output <path>      Write JUnit XML report at this path
  --help, -h                 Show this help

Output: JSON on stdout (InfraSuiteResult). Progress lines to stderr.
       Exit codes:
         0 - every check passed
         1 - one or more checks failed
         2 - input-validation error (missing instance/branch)
`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const instance = args.instance ?? process.env.LAKEBASE_PROJECT_ID;
  const branch = args.branch ?? process.env.LAKEBASE_BRANCH_ID;
  if (!instance || !branch) {
    process.stderr.write(
      "Error: --instance and --branch are required (or set LAKEBASE_PROJECT_ID / LAKEBASE_BRANCH_ID).\n\n" +
        HELP
    );
    return 2;
  }
  const input: RunInfraSuiteArgs = {
    instance,
    branch,
    projectDir: args.projectDir ?? process.cwd(),
    comparisonBranch: args.comparisonBranch,
    junitOutput: args.junitOutput,
  };
  process.stderr.write(`[infra] suite running against ${instance}/${branch}...\n`);
  const result = await runInfraSuite(input);
  for (const c of result.checks) {
    const marker = c.passed ? "PASS" : "FAIL";
    process.stderr.write(`[infra] ${marker}  ${c.name}  (${c.duration_ms}ms)  ${c.detail}\n`);
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return result.passed ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
);
