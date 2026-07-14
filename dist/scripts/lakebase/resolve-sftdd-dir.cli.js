#!/usr/bin/env node

// scripts/sftdd/sftdd-paths.ts
import * as fs from "fs";
import { join } from "path";
var ARTIFACT_ROOT = ".sftdd";
var LEGACY_ARTIFACT_ROOT = ".tdd";
function resolveSftddDir(projectDir2 = process.cwd()) {
  const next = join(projectDir2, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  const legacy = join(projectDir2, LEGACY_ARTIFACT_ROOT);
  if (fs.existsSync(legacy)) return legacy;
  return next;
}

// scripts/lakebase/resolve-sftdd-dir.cli.ts
function parseProjectDir(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project-dir" && i + 1 < argv.length) return argv[i + 1];
    if (argv[i] === "-h" || argv[i] === "--help") {
      process.stdout.write("Usage: lakebase-resolve-sftdd-dir [--project-dir <dir>]\n");
      process.exit(0);
    }
  }
  return void 0;
}
var projectDir = parseProjectDir(process.argv.slice(2));
process.stdout.write(resolveSftddDir(projectDir ?? process.cwd()) + "\n");
//# sourceMappingURL=resolve-sftdd-dir.cli.js.map