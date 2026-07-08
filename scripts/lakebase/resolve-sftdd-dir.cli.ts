#!/usr/bin/env node
// CLI surface for the SINGLE point of entry that resolves a project's runtime
// artifact dir: resolveSftddDir (prefer .sftdd, fall back to legacy .tdd). Lets
// bash callers (the smoke orchestrators in particular) derive the dir from the
// ONE rule instead of hardcoding ".sftdd" / ".tdd" in shell, so a future rename
// of the artifact root only changes sftdd-paths.ts.
//
// Usage:
//   lakebase-resolve-sftdd-dir [--project-dir <dir>]
// Prints the absolute runtime artifact dir to stdout (default project-dir: cwd).

import { resolveSftddDir } from "../sftdd/sftdd-paths.js";

function parseProjectDir(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project-dir" && i + 1 < argv.length) return argv[i + 1];
    if (argv[i] === "-h" || argv[i] === "--help") {
      process.stdout.write("Usage: lakebase-resolve-sftdd-dir [--project-dir <dir>]\n");
      process.exit(0);
    }
  }
  return undefined;
}

const projectDir = parseProjectDir(process.argv.slice(2));
process.stdout.write(resolveSftddDir(projectDir ?? process.cwd()) + "\n");
