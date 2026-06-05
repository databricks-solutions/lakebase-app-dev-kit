#!/usr/bin/env node
// CLI for the host -> CLI-profile resolver. Lets bash callers (the
// scaffolded post-checkout hook in particular) self-heal a project's .env
// by pinning DATABRICKS_CONFIG_PROFILE before the auth preflight runs.
//
// Output: prints the unique valid profile name for the host to stdout, or
// NOTHING when the CLI is missing, no profile matches, or the match is
// ambiguous. Always exits 0: this is advisory, it must never fail a
// `git checkout`. Callers test for empty output:
//
//   PINNED="$(lakebase-resolve-profile --host "$DATABRICKS_HOST")"
//   [ -n "$PINNED" ] && echo "DATABRICKS_CONFIG_PROFILE=$PINNED" >> .env
//
// Flags:
//   --host <url>   workspace host (default: $DATABRICKS_HOST)

import { resolveProfileForHost } from "./databricks-profile.js";

function parseHost(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "--host") && i + 1 < argv.length) {
      return argv[i + 1];
    }
    if (argv[i] === "-h" || argv[i] === "--help") {
      process.stdout.write(
        `lakebase-resolve-profile – print the unique valid CLI profile for a host\n\n` +
          `Usage:\n` +
          `  lakebase-resolve-profile [--host <workspace-url>]\n\n` +
          `Output (stdout): the profile name, or empty when none/ambiguous.\n` +
          `Always exits 0 (advisory).\n`,
      );
      process.exit(0);
    }
  }
  return process.env.DATABRICKS_HOST;
}

async function main(): Promise<void> {
  const host = parseHost(process.argv.slice(2));
  if (!host) {
    process.exit(0);
  }
  let profile: string | undefined;
  try {
    profile = await resolveProfileForHost(host);
  } catch {
    profile = undefined;
  }
  if (profile) {
    process.stdout.write(`${profile}\n`);
  }
  process.exit(0);
}

void main();
