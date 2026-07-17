#!/usr/bin/env node
// Thin CLI wrapper around getFeatureStatus + renderFeatureStatus.

import { getFeatureStatus, renderFeatureStatus } from "./feature-status.js";
import { resolveSftddDir } from "./sftdd-paths.js";

interface ParsedArgs {
  featureId?: string;
  tdd?: string;
  projectDir?: string;
  json?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--tdd":
        out.tdd = argv[++i];
        break;
      case "--project-dir":
      case "--cwd":
        out.projectDir = argv[++i];
        break;
      case "--json":
        out.json = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        if (!a.startsWith("--") && !out.featureId) {
          out.featureId = a;
        }
        break;
    }
  }
  return out;
}

const HELP = `lakebase-feature-status – one-screen snapshot of a feature's TDD workflow state

Usage:
  lakebase-feature-status <feature-id> [--tdd <dir>] [--json]

Flags:
  --tdd <dir>          Path to the artifact root (default: ./.sftdd, honors a legacy ./.tdd)
  --project-dir <dir>  Project root that holds .lakebase/ (default: the parent of --tdd);
                       used to reconcile deploy/promote from the SCM workflow-state
  --json               Print the snapshot as JSON instead of human-readable text
  --help, -h           Show this help message

Examples:
  lakebase-feature-status F1-checkout
  lakebase-feature-status F1-checkout --json | jq '.experiments[].slug'
  lakebase-feature-status F1-checkout --tdd path/to/.sftdd
`;

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!args.featureId) {
    process.stderr.write(`Error: feature-id is required.\n\n${HELP}`);
    return 2;
  }
  const sftddDir = args.tdd ?? resolveSftddDir();
  const snapshot = args.projectDir
    ? getFeatureStatus(sftddDir, args.featureId, args.projectDir)
    : getFeatureStatus(sftddDir, args.featureId);
  if (args.json) {
    process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
  } else {
    process.stdout.write(renderFeatureStatus(snapshot));
  }
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
