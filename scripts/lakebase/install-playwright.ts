// Phase 1 primitive: bootstrap Playwright in a project so
// [E2E]-tagged test-list rows have a runner. Three responsibilities:
//
//   - writePlaywrightTemplates: drop playwright.config.ts +
//     tests/e2e/smoke.spec.ts into the project root, copied from the
//     bundled templates/project/common tree.
//   - runPlaywrightInstall: install @playwright/test as a devDependency,
//     install the chromium browser binary, and verify by reading
//     `npx playwright --version`.
//   - installPlaywright: orchestrator. Phase 2's scaffolder calls this
//     once when --enable-e2e is set; humans retrofitting an existing
//     project call it directly.
//
// Templates live in templates/project/common/ so they share the kit's
// scaffold tree. The marker-file walk-up mirrors scaffold.ts so dist/
// and src/ callers both resolve correctly.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "../util/exec.js";
import { KIT_TIMEOUTS } from "./kit-config.js";

export interface InstallPlaywrightOptions {
  /** Override the templates/project root. Default: auto-detected. */
  templatesDir?: string;
}

let cachedTemplatesDir: string | undefined;
function findTemplatesDir(): string {
  if (cachedTemplatesDir) return cachedTemplatesDir;
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "templates", "project");
    if (fs.existsSync(path.join(candidate, "common", ".gitignore.base"))) {
      cachedTemplatesDir = candidate;
      return cachedTemplatesDir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project tree relative to ${here}. ` +
      `Pass explicit { templatesDir } to override.`
  );
}

function commonDir(opts?: InstallPlaywrightOptions): string {
  return path.join(opts?.templatesDir ?? findTemplatesDir(), "common");
}

/** Files this primitive drops into a project root, relative to projectDir. */
export const PLAYWRIGHT_TEMPLATE_FILES = [
  "playwright.config.ts",
  path.join("tests", "e2e", "smoke.spec.ts"),
  // The canonical `live_server` fixture. Shipped (not agent-authored) so every
  // UI project gets a fixture that inherits the env (CI's DATABASE_URL wins) +
  // polls readiness, instead of a hand-rolled one that pins `--env-file .env`
  // and sleeps a fixed time , the dev/prod CI-parity bug where E2E pass in the
  // build lane (live local .env) but fail in PR CI with ERR_CONNECTION_REFUSED.
  path.join("tests", "e2e", "conftest.py"),
] as const;

export interface WritePlaywrightTemplatesArgs extends InstallPlaywrightOptions {
  projectDir: string;
  /** Overwrite an existing playwright.config.ts / smoke fixture. Default: false. */
  force?: boolean;
}

export interface WritePlaywrightTemplatesResult {
  /** Paths (relative to projectDir) that were newly written. */
  written: string[];
  /** Paths that already existed and were left alone (force=false). */
  skipped: string[];
}

/**
 * Drop the bundled playwright.config.ts + tests/e2e/smoke.spec.ts into
 * projectDir. Skips a file when it already exists unless force=true.
 * Throws if either source template is missing from the kit (a kit
 * packaging bug, not a user error).
 */
export function writePlaywrightTemplates(
  args: WritePlaywrightTemplatesArgs
): WritePlaywrightTemplatesResult {
  const src = commonDir(args);
  const written: string[] = [];
  const skipped: string[] = [];
  for (const rel of PLAYWRIGHT_TEMPLATE_FILES) {
    const from = path.join(src, rel);
    if (!fs.existsSync(from)) {
      throw new Error(`Kit template missing: ${from}`);
    }
    const to = path.join(args.projectDir, rel);
    if (fs.existsSync(to) && !args.force) {
      skipped.push(rel);
      continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    written.push(rel);
  }
  return { written, skipped };
}

export interface RunPlaywrightInstallArgs {
  projectDir: string;
  /** Per-call timeout for each shell-out. Default: KIT_TIMEOUTS.cliLong. */
  timeoutMs?: number;
}

export interface RunPlaywrightInstallResult {
  /** Resolved CLI version (the output of `npx playwright --version`). */
  version: string;
  /** True iff the chromium browser bundle install returned 0. */
  browserInstalled: boolean;
}

/**
 * Install @playwright/test as a devDependency in projectDir, install the
 * chromium browser binary, and verify by reading `npx playwright --version`.
 * Loud-fail on any step: the scaffolder surfaces a clear remediation
 * (re-run installPlaywright, or re-tag the [E2E] rows) when this throws.
 */
export async function runPlaywrightInstall(
  args: RunPlaywrightInstallArgs
): Promise<RunPlaywrightInstallResult> {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliLong;
  await exec("npm install --save-dev @playwright/test", {
    cwd: args.projectDir,
    timeout: timeoutMs,
  });
  await exec("npx --yes playwright install chromium", {
    cwd: args.projectDir,
    timeout: timeoutMs,
  });
  const version = await exec("npx --yes playwright --version", {
    cwd: args.projectDir,
    timeout: KIT_TIMEOUTS.cliDefault,
  });
  return { version, browserInstalled: true };
}

export interface InstallPlaywrightArgs extends InstallPlaywrightOptions {
  projectDir: string;
  /** Forwarded to writePlaywrightTemplates. Default: false. */
  force?: boolean;
  /** Forwarded to runPlaywrightInstall. Default: KIT_TIMEOUTS.cliLong. */
  timeoutMs?: number;
  /**
   * Skip the npm/npx install steps and write templates only. Used by
   * the scaffolder in test mode and by humans who want to wire the
   * config without paying the chromium-download cost yet.
   */
  skipBrowserInstall?: boolean;
}

export interface InstallPlaywrightResult {
  templates: WritePlaywrightTemplatesResult;
  /** Undefined when skipBrowserInstall=true. */
  install?: RunPlaywrightInstallResult;
}

/**
 * End-to-end bootstrap: drop templates, install the npm package, install
 * chromium, verify. The scaffolder (phase 2) calls this once
 * when --enable-e2e is set; the human-facing path is `npx
 * @databricks-solutions/lakebase-app-dev-kit install-playwright`.
 */
export async function installPlaywright(
  args: InstallPlaywrightArgs
): Promise<InstallPlaywrightResult> {
  const templates = writePlaywrightTemplates(args);
  if (args.skipBrowserInstall) {
    return { templates };
  }
  const install = await runPlaywrightInstall(args);
  return { templates, install };
}
