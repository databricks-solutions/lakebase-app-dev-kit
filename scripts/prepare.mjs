#!/usr/bin/env node
// npm prepare lifecycle dispatcher (FEIP-7479).
//
// `npm prepare` fires in two very different contexts that the previous
// inline command did not distinguish:
//
//   1. Kit development clone     (.git/ present)
//   2. Consumer install via npx  (github:databricks-solutions/lakebase-
//      app-dev-kit#<tag>) extracts into a tmpdir with no .git/
//
// In context (1) we want the full chain:
//   - sync-devhub-skills (octokit fetch of pinned devhub agent skills)
//   - npm run build      (tsup; emit dist/)
//   - husky              (install local git hooks)
//
// In context (2), only the build is meaningful. sync-devhub-skills
// hits the network and can hang or fail on github-hosted runners (no
// GITHUB_TOKEN with kit-repo read access), and husky's "not a git
// repo" message is harmless but its earlier failure modes were a
// suspect for FEIP-7479's silent 8-minute hang. Running JUST the
// build keeps consumer installs deterministic + offline-safe.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

function run(label, cmd, args) {
  console.log(`[prepare] ${label}`);
  const r = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(`[prepare] FAIL: ${label} exited ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

const isDevClone = existsSync(join(REPO_ROOT, ".git"));

if (isDevClone) {
  console.log("[prepare] dev clone detected (.git present); running full prepare chain");
  run("sync devhub skills", "npx", ["--no-install", "tsx", "scripts/sync-devhub-skills.ts"]);
  run("build", "npm", ["run", "build"]);
  run("husky install", "npx", ["--no-install", "husky"]);
} else {
  console.log("[prepare] consumer install (no .git); building only");
  run("build", "npm", ["run", "build"]);
}

console.log("[prepare] done");
