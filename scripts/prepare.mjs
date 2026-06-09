#!/usr/bin/env node
// npm prepare lifecycle dispatcher.
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
// suspect for's silent 8-minute hang. Running JUST the
// build keeps consumer installs deterministic + offline-safe.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// All prepare output goes to stderr. npm 10+ suppresses stdout of
// lifecycle scripts unless --foreground-scripts is honored at the
// outer npm install (not at the npx layer), so stdout from this
// script is usually invisible. stderr SOMETIMES survives, and
// definitely lands in npm-debug.log if anything errors.
function log(msg) {
  process.stderr.write(`[prepare] ${msg}\n`);
}

function run(label, cmd, args) {
  log(`>>> ${label}: ${cmd} ${args.join(" ")}`);
  const t0 = Number(process.hrtime.bigint() / 1000000n);
  const r = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    stdio: ["ignore", "inherit", "inherit"],
    shell: process.platform === "win32",
  });
  const elapsed = Number(process.hrtime.bigint() / 1000000n) - t0;
  log(`<<< ${label}: exit=${r.status} elapsed=${elapsed}ms`);
  if (r.status !== 0) {
    log(`FAIL: ${label}`);
    process.exit(r.status ?? 1);
  }
}

const isDevClone = existsSync(join(REPO_ROOT, ".git"));
log(`starting; isDevClone=${isDevClone} cwd=${REPO_ROOT}`);
log(`node=${process.version} platform=${process.platform} arch=${process.arch}`);
log(`mem=${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);

if (isDevClone) {
  log("dev clone path: sync + build + husky");
  run("sync-devhub-skills", "npx", ["--no-install", "tsx", "scripts/sync-devhub-skills.ts"]);
  run("npm-build", "npm", ["run", "build"]);
  run("husky", "npx", ["--no-install", "husky"]);
} else {
  // Consumer install (npx / npm install github:...). devDependencies are
  // NOT installed for non-dev installs, so `npm run build` (tsup) would
  // fail with `tsup: not found`. The kit ships pre-built dist/ on every
  // tagged release (force-added to git despite .gitignore), so consumers
  // don't need to build. Verify dist/ is present and skip build.
  const distMain = join(REPO_ROOT, "dist", "scripts", "index.js");
  if (!existsSync(distMain)) {
    log(`FAIL: consumer install missing pre-built dist/ at ${distMain}`);
    log("This indicates a release-pipeline gap; the kit's tag should ship dist/.");
    process.exit(1);
  }
  log(`consumer install path: skipping build (dist/ already shipped at tag time)`);
}

log("done");
