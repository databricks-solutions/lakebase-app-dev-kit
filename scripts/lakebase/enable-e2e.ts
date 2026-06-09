// Phase 2: scaffolder integration for the Playwright primitives.
//
// installPlaywright (Phase 1) is the generic boot: it drops templates +
// installs the npm/browser bits in any Node project. This module is the
// kit-specific helper that wires E2E into a freshly-scaffolded Lakebase
// project: package.json gets `test:e2e`, scripts/run-tests.sh runs it
// after the language-specific suite, and the Playwright config + smoke
// fixture land at the project root.
//
// Why a separate seam: installPlaywright stays a pure primitive that any
// kit consumer can call (existing project retrofit, repl, MCP tool); the
// scaffolder-specific package.json + run-tests.sh patches stay here so
// that primitive doesn't accumulate kit project-shape assumptions.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  writePlaywrightTemplates,
  PLAYWRIGHT_TEMPLATE_FILES,
} from "./install-playwright.js";

/**
 * Version range applied to @playwright/test when patching package.json.
 * Bumped here, not at call sites, so a single edit re-pins every project
 * scaffolded by this kit version. Major-pin (^1) accepts patch + minor
 * upgrades but blocks an accidental v2 migration when Playwright cuts
 * a breaking release.
 */
export const PLAYWRIGHT_TEST_VERSION_RANGE = "^1.49.0";

export interface AddPlaywrightToPackageJsonArgs {
  projectDir: string;
  /** Override the version range stamped into devDependencies. */
  versionRange?: string;
}

export interface AddPlaywrightToPackageJsonResult {
  /** True iff the file existed and was patched (or already had both keys). */
  patched: boolean;
  /** True iff `scripts.test:e2e` was newly added. */
  scriptAdded: boolean;
  /** True iff `devDependencies["@playwright/test"]` was newly added. */
  depAdded: boolean;
}

/**
 * Idempotently add `scripts["test:e2e"] = "playwright test"` and
 * `devDependencies["@playwright/test"]` to a project's package.json.
 * No-ops if package.json is absent (non-Node project) so callers can
 * blindly invoke it after enabling E2E without language-gating.
 */
export function addPlaywrightToPackageJson(
  args: AddPlaywrightToPackageJsonArgs
): AddPlaywrightToPackageJsonResult {
  const pkgPath = path.join(args.projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return { patched: false, scriptAdded: false, depAdded: false };
  }
  const range = args.versionRange ?? PLAYWRIGHT_TEST_VERSION_RANGE;
  const raw = fs.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as Record<string, unknown>;
  const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};
  const devDependencies =
    (pkg.devDependencies as Record<string, string> | undefined) ?? {};

  let scriptAdded = false;
  if (!scripts["test:e2e"]) {
    scripts["test:e2e"] = "playwright test";
    scriptAdded = true;
  }
  let depAdded = false;
  if (!devDependencies["@playwright/test"]) {
    devDependencies["@playwright/test"] = range;
    depAdded = true;
  }
  pkg.scripts = scripts;
  pkg.devDependencies = devDependencies;

  if (scriptAdded || depAdded) {
    const trailingNewline = raw.endsWith("\n") ? "\n" : "";
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + trailingNewline, "utf8");
  }
  return { patched: true, scriptAdded, depAdded };
}

export interface AddE2eToRunTestsScriptArgs {
  projectDir: string;
}

export interface AddE2eToRunTestsScriptResult {
  /** True iff the runner script existed and was patched (or already had the block). */
  patched: boolean;
  /** True iff the E2E block was newly inserted. */
  inserted: boolean;
}

/**
 * Marker substring the inserted run-tests.sh block carries so the patch
 * is reliably idempotent across reruns of the scaffolder.
 */
const RUN_TESTS_E2E_MARKER = "# run Playwright E2E suite when configured";

/**
 * Idempotently append a Playwright invocation to scripts/run-tests.sh.
 * The block only fires when playwright.config.ts is present at the
 * project root, so retrofits land safely (the existing run-tests.sh
 * continues to behave for projects without E2E).
 */
export function addE2eToRunTestsScript(
  args: AddE2eToRunTestsScriptArgs
): AddE2eToRunTestsScriptResult {
  const scriptPath = path.join(args.projectDir, "scripts", "run-tests.sh");
  if (!fs.existsSync(scriptPath)) {
    return { patched: false, inserted: false };
  }
  const original = fs.readFileSync(scriptPath, "utf8");
  if (original.includes(RUN_TESTS_E2E_MARKER)) {
    return { patched: true, inserted: false };
  }
  // Append at the end so the block runs AFTER the language-specific test
  // suite. Strip a single trailing newline so the join is clean, then
  // restore one.
  const trimmed = original.replace(/\n+$/, "\n");
  const block = [
    "",
    RUN_TESTS_E2E_MARKER,
    'if [ -f "$REPO_ROOT/playwright.config.ts" ] || [ -f "$REPO_ROOT/playwright.config.js" ]; then',
    '  echo "Running Playwright E2E tests..."',
    '  if [ -f "$REPO_ROOT/package.json" ] && command -v npm >/dev/null 2>&1; then',
    '    (cd "$REPO_ROOT" && npm run test:e2e)',
    "  else",
    '    (cd "$REPO_ROOT" && npx --yes playwright test)',
    "  fi",
    "fi",
    "",
  ].join("\n");
  fs.writeFileSync(scriptPath, trimmed + block, "utf8");
  return { patched: true, inserted: true };
}

export interface EnableE2eForProjectArgs {
  projectDir: string;
  /** Forward to writePlaywrightTemplates. Default: false. */
  force?: boolean;
  /** Override the templates root (BDD harness). */
  templatesDir?: string;
  /** Override the @playwright/test version range. */
  versionRange?: string;
}

export interface EnableE2eForProjectResult {
  /** Paths (relative to projectDir) freshly written. */
  templatesWritten: string[];
  /** Paths skipped because they already existed (force=false). */
  templatesSkipped: string[];
  packageJson: AddPlaywrightToPackageJsonResult;
  runTestsScript: AddE2eToRunTestsScriptResult;
}

/**
 * One-shot scaffolder integration: drop Playwright templates at the
 * project root, then patch package.json + scripts/run-tests.sh so
 * `npm run test:e2e` and `./scripts/run-tests.sh` both pick up E2E. No-ops
 * fields that don't apply (e.g. package.json patch skipped on Maven
 * projects). Always safe to re-run.
 */
export function enableE2eForProject(
  args: EnableE2eForProjectArgs
): EnableE2eForProjectResult {
  // Guard: only ship playwright templates when the npm side can be wired
  // (i.e. a root package.json exists). Python / Java / non-Node project
  // shapes had previously written playwright.config.ts unconditionally;
  // CI's E2E step then fired because the config file existed, but
  // `@playwright/test` was never installed, blowing up with
  // "Cannot find module '@playwright/test'". Skipping the template
  // write when there's nowhere to wire it keeps the CI step from
  // firing at all (it's gated on hashFiles('playwright.config.*')).
  const rootPkg = path.join(args.projectDir, "package.json");
  if (!fs.existsSync(rootPkg)) {
    return {
      templatesWritten: [],
      // Same shape as writePlaywrightTemplates would have returned; the
      // template paths show up under skipped with the npm-wiring caveat
      // captured in packageJson.patched=false.
      templatesSkipped: [...PLAYWRIGHT_TEMPLATE_FILES],
      packageJson: { patched: false, scriptAdded: false, depAdded: false },
      runTestsScript: addE2eToRunTestsScript({ projectDir: args.projectDir }),
    };
  }
  const templates = writePlaywrightTemplates({
    projectDir: args.projectDir,
    force: args.force,
    templatesDir: args.templatesDir,
  });
  const packageJson = addPlaywrightToPackageJson({
    projectDir: args.projectDir,
    versionRange: args.versionRange,
  });
  const runTestsScript = addE2eToRunTestsScript({ projectDir: args.projectDir });
  return {
    templatesWritten: templates.written,
    templatesSkipped: templates.skipped,
    packageJson,
    runTestsScript,
  };
}

/** Re-export so consumers can import everything from one module. */
export { PLAYWRIGHT_TEMPLATE_FILES };
