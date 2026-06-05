#!/usr/bin/env node
// CLI surface for the host -> CLI-profile resolver + .env heal. Lets bash
// callers (the scaffolded post-checkout hook in particular) pin
// DATABRICKS_CONFIG_PROFILE before the auth preflight runs, WITHOUT
// re-implementing any of the resolve / placement logic in shell.
//
// Two modes:
//
//   --write-env <path>   Heal the .env: read its DATABRICKS_HOST, resolve
//                        the unique valid profile, and insert
//                        DATABRICKS_CONFIG_PROFILE right after the host line
//                        (idempotent). Delegates entirely to
//                        ensureProfilePinned, the single source of that
//                        logic. Prints the pinned profile name on success,
//                        nothing when no change was made.
//
//   --host <url>         Diagnostic: print the unique valid profile name for
//                        a host (default: $DATABRICKS_HOST). No file write.
//
// Output: the profile name to stdout, or NOTHING when the CLI is missing,
// no profile matches, the match is ambiguous, or the .env was already
// pinned. Always exits 0: this is advisory, it must never fail a
// `git checkout`. Bash callers test for empty output:
//
//   PINNED="$(lakebase-resolve-profile --write-env "$WORK_TREE/.env")"
//   [ -n "$PINNED" ] && export DATABRICKS_CONFIG_PROFILE="$PINNED"

import { ensureProfilePinned, resolveProfileForHost } from "./databricks-profile.js";

interface ParsedArgs {
  host?: string;
  writeEnv?: string;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--host" && i + 1 < argv.length) {
      out.host = argv[++i];
    } else if (a === "--write-env" && i + 1 < argv.length) {
      out.writeEnv = argv[++i];
    } else if (a === "-h" || a === "--help") {
      out.help = true;
    }
  }
  return out;
}

const HELP =
  `lakebase-resolve-profile – pin / print the unique valid CLI profile for a host\n\n` +
  `Usage:\n` +
  `  lakebase-resolve-profile --write-env <path>   heal a .env (pin profile after host)\n` +
  `  lakebase-resolve-profile [--host <url>]        print the resolved profile (no write)\n\n` +
  `Output (stdout): the profile name, or empty when none/ambiguous/already pinned.\n` +
  `Always exits 0 (advisory).\n`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  // Heal mode: ensureProfilePinned owns reading the host from .env,
  // resolving, and the insert-after-host placement. No logic duplicated here.
  if (args.writeEnv) {
    try {
      const res = await ensureProfilePinned({ envPath: args.writeEnv });
      if (res.pinned) {
        process.stdout.write(`${res.pinned}\n`);
      }
    } catch {
      // advisory: never fail the caller
    }
    process.exit(0);
  }

  // Diagnostic mode: just resolve and print for the given host.
  const host = args.host ?? process.env.DATABRICKS_HOST;
  if (!host) {
    process.exit(0);
  }
  try {
    const profile = await resolveProfileForHost(host);
    if (profile) {
      process.stdout.write(`${profile}\n`);
    }
  } catch {
    // advisory
  }
  process.exit(0);
}

void main();
