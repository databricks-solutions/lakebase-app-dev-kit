#!/usr/bin/env node
// CLI: walk the .tdd/ tree and print drift reports. Exit 0 even when reports
// exist — warn-only by design (spec-sync surfaces drift; it doesn't fail CI).

import { validateSpec } from "./spec-sync.js";
import { resolveSftddDir } from "./sftdd-paths.js";

function main(): number {
  const sftddDir = process.argv[2] || resolveSftddDir();
  const reports = validateSpec(sftddDir);
  if (reports.length === 0) {
    process.stdout.write(`spec-sync: OK (${sftddDir})\n`);
    return 0;
  }
  for (const r of reports) {
    process.stderr.write(`[${r.kind}] ${r.file}: ${r.detail}\n`);
  }
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
