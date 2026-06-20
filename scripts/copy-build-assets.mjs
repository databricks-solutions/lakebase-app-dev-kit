#!/usr/bin/env node
// Copy non-TS runtime assets into dist/ after the tsup compile.
//
// tsup compiles TS -> JS but does NOT copy sibling data files. Several
// substrate modules read JSON Schemas at runtime by path relative to their
// compiled location (schema-loader.ts -> scripts/sftdd/schemas/*.schema.json;
// scm-workflow-state + uc-resources read their schemas similarly). Without
// this copy, dist/scripts/.../*.schema.json are absent and a CONSUMER install
// (which ships pre-built dist/ and never rebuilds) hits ENOENT at runtime.
// The bug stayed latent until artifact-conformance made the mock approver the
// first consumer-context schema reader.
//
// Wired as tsup `onSuccess`, so `npm run build` always produces a complete
// dist/. The dev clone commits dist/ at release time, so consumers get the
// assets without rebuilding.

import { readdirSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = join(REPO_ROOT, "scripts");
const DIST_ROOT = join(REPO_ROOT, "dist", "scripts");

/** Recursively collect files under dir matching the predicate. */
function collect(dir, pred, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, pred, out);
    else if (pred(entry)) out.push(full);
  }
  return out;
}

const assets = collect(SRC_ROOT, (name) => name.endsWith(".schema.json"));
let copied = 0;
for (const src of assets) {
  const dest = join(DIST_ROOT, relative(SRC_ROOT, src));
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  copied++;
}
process.stderr.write(`[copy-build-assets] copied ${copied} schema asset(s) into dist/scripts/\n`);
