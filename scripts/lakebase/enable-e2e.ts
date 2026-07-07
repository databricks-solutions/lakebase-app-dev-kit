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
  NODE_E2E_TEMPLATE_FILES,
  PYTHON_E2E_TEMPLATE_FILES,
} from "./install-playwright.js";

/**
 * Version range applied to @playwright/test when patching package.json.
 * Bumped here, not at call sites, so a single edit re-pins every project
 * scaffolded by this kit version. Major-pin (^1) accepts patch + minor
 * upgrades but blocks an accidental v2 migration when Playwright cuts
 * a breaking release.
 */
export const PLAYWRIGHT_TEST_VERSION_RANGE = "^1.49.0";

/**
 * Version range applied to `pytest-playwright` when patching a Python project's
 * pyproject.toml. This is the Python-side analog of PLAYWRIGHT_TEST_VERSION_RANGE:
 * `pytest-playwright` brings the `playwright` package + the `page` fixture the
 * shipped tests/e2e/conftest.py and E2E specs depend on.
 */
export const PYTEST_PLAYWRIGHT_VERSION_RANGE = ">=0.5.0";

/**
 * Version range applied to `pytest-bdd` when patching a Python project's
 * pyproject.toml. The canon (test-strategy.md) authors AC behavior scenarios as
 * pytest-bdd Gherkin (`.feature` + step defs); without the dep the navigator
 * cannot `import pytest_bdd` and falls back to plain pytest, so it ships in the
 * base Python scaffold AND is retrofit here.
 */
export const PYTEST_BDD_VERSION_RANGE = ">=7.0.0";

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

export interface AddPythonE2eDepsArgs {
  projectDir: string;
  /** Override the version range stamped into the dev extras. */
  versionRange?: string;
}

export interface AddPythonE2eDepsResult {
  /** True iff pyproject.toml existed and was patched (or already had the dep). */
  patched: boolean;
  /** True iff `pytest-playwright` was newly added to the dev extras. */
  depAdded: boolean;
}

/**
 * Idempotently add `pytest-playwright` to a Python project's
 * `[project.optional-dependencies].dev` list in pyproject.toml. This is the
 * Python-side analog of addPlaywrightToPackageJson: the shipped
 * tests/e2e/conftest.py + the E2E specs use Playwright's `page` fixture, which
 * pytest-playwright provides; without the dep declared, `uv run --extra dev
 * pytest tests/e2e` errors at collection with `ModuleNotFoundError: playwright`
 * (the E2E-on-Python scaffold gap). No-ops if pyproject.toml is absent. When the
 * dev extras list is missing entirely, appends a minimal
 * `[project.optional-dependencies]` table.
 */
/**
 * Idempotently add one package to a Python project's
 * `[project.optional-dependencies].dev` list in pyproject.toml (the single
 * inserter `ensurePythonE2eDeps` + `ensurePythonBddDeps` share). No-ops if
 * pyproject.toml is absent or the package is already declared; appends a minimal
 * `[project.optional-dependencies]` table when the dev list is missing.
 */
function addPythonDevDep(projectDir: string, pkg: string, range: string): AddPythonE2eDepsResult {
  const pyPath = path.join(projectDir, "pyproject.toml");
  if (!fs.existsSync(pyPath)) {
    return { patched: false, depAdded: false };
  }
  const original = fs.readFileSync(pyPath, "utf8");
  // Already declared in any form -> nothing to do (idempotent).
  if (new RegExp(`["']${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(original)) {
    return { patched: true, depAdded: false };
  }
  const depLine = `    "${pkg}${range}",`;
  // Case 1: an existing `dev = [ ... ]` array (the kit scaffold shape). Insert
  // the new dep just before the closing bracket, preserving the rest verbatim.
  const devArray = /(\n[ \t]*dev[ \t]*=[ \t]*\[)([\s\S]*?)(\n[ \t]*\])/;
  if (devArray.test(original)) {
    const patched = original.replace(devArray, (_m, open: string, body: string, close: string) => {
      const sep = body.trim() === "" || body.trimEnd().endsWith(",") ? "" : ",";
      return `${open}${body}${sep}\n${depLine}${close}`;
    });
    fs.writeFileSync(pyPath, patched, "utf8");
    return { patched: true, depAdded: true };
  }
  // Case 2: no dev extras yet (e.g. a retrofit) -> append the table.
  const trimmed = original.replace(/\n+$/, "\n");
  const block = `\n[project.optional-dependencies]\ndev = [\n${depLine}\n]\n`;
  fs.writeFileSync(pyPath, trimmed + block, "utf8");
  return { patched: true, depAdded: true };
}

export function ensurePythonE2eDeps(args: AddPythonE2eDepsArgs): AddPythonE2eDepsResult {
  return addPythonDevDep(args.projectDir, "pytest-playwright", args.versionRange ?? PYTEST_PLAYWRIGHT_VERSION_RANGE);
}

/**
 * Idempotently add `pytest-bdd` to a Python project's dev extras, so the
 * navigator can author AC behavior scenarios as Gherkin `.feature` + step defs
 * (the canon's BDD test surface). Base Python scaffolds already declare it; this
 * is the retrofit path for an existing project. No-ops if pyproject is absent.
 */
export function ensurePythonBddDeps(args: AddPythonE2eDepsArgs): AddPythonE2eDepsResult {
  return addPythonDevDep(args.projectDir, "pytest-bdd", args.versionRange ?? PYTEST_BDD_VERSION_RANGE);
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
    // Python E2E: pytest-playwright + the shipped tests/e2e/conftest.py
    // (live_server). Gated on the conftest + pyproject so it only fires for a
    // Python project that has the E2E harness, never on a bare API project.
    'elif [ -f "$REPO_ROOT/tests/e2e/conftest.py" ] && [ -f "$REPO_ROOT/pyproject.toml" ]; then',
    '  echo "Running Python E2E tests (pytest tests/e2e)..."',
    // pytest-playwright provides the `page` fixture but needs its browser
    // binaries; install chromium first (idempotent, cached after the first
    // run). Kept under `set -e` so a failed browser install still fails loudly
    // instead of letting pytest error with a bare "Executable doesn't exist".
    '  (cd "$REPO_ROOT" && uv run --extra dev playwright install chromium)',
    // Run the suite with the exit code captured. pytest returns 5 when it
    // collects zero tests; an early story legitimately ships no E2E specs yet
    // (only the scaffolded conftest), so an empty tests/e2e must NOT fail the
    // run, exactly as the marker-split base run treats exit 5. Any other
    // non-zero is a real E2E failure and propagates.
    "  set +e",
    '  (cd "$REPO_ROOT" && uv run --extra dev pytest tests/e2e)',
    "  e2e_rc=$?",
    "  set -e",
    '  if [ "$e2e_rc" -ne 0 ] && [ "$e2e_rc" -ne 5 ]; then exit "$e2e_rc"; fi',
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
  /** Project language. Decides which E2E templates ship: Node gets the
   *  playwright.config + TS smoke; Python gets the `live_server` conftest.
   *  When omitted, falls back to package.json (Node) / pyproject.toml (Python)
   *  detection so retrofits work without it. */
  language?: string;
}

export interface EnableE2eForProjectResult {
  /** Paths (relative to projectDir) freshly written. */
  templatesWritten: string[];
  /** Paths skipped because they already existed (force=false). */
  templatesSkipped: string[];
  packageJson: AddPlaywrightToPackageJsonResult;
  /** Python-only: the pyproject.toml dev-extras patch (pytest-playwright).
   *  `{ patched: false }` for Node / non-Python projects. */
  pyproject: AddPythonE2eDepsResult;
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
  const isNode =
    args.language === "nodejs" || args.language === "node" || fs.existsSync(rootPkg);
  if (!isNode) {
    // Non-Node project. Ship the language-appropriate E2E templates: a Python
    // project still needs its `tests/e2e/conftest.py` (the `live_server`
    // fixture), the prior all-or-nothing early-return dropped it, so the build
    // hit a missing conftest and the driver fabricated its own. It carries no
    // `playwright.config.*`, so CI's Node E2E gate stays quiet.
    const isPython =
      args.language === "python" ||
      fs.existsSync(path.join(args.projectDir, "pyproject.toml"));
    const templates = isPython
      ? writePlaywrightTemplates({
          projectDir: args.projectDir,
          force: args.force,
          templatesDir: args.templatesDir,
          files: PYTHON_E2E_TEMPLATE_FILES,
        })
      : { written: [], skipped: [...PLAYWRIGHT_TEMPLATE_FILES] };
    // Python: retrofit pytest-bdd (AC behavior scenarios as Gherkin) into the dev
    // extras; the pytest-playwright runner dep is wired below. Both no-op for
    // non-Python shapes (no pyproject).
    if (isPython) ensurePythonBddDeps({ projectDir: args.projectDir });
    return {
      templatesWritten: templates.written,
      templatesSkipped: templates.skipped,
      // No package.json to wire (the caveat the report surfaces).
      packageJson: { patched: false, scriptAdded: false, depAdded: false },
      // Python: declare the pytest-playwright runner in pyproject's dev extras
      // so the shipped conftest + E2E specs' `page` fixture resolves. (Skipped
      // for other non-Node shapes, which have no pyproject.)
      pyproject: isPython
        ? ensurePythonE2eDeps({ projectDir: args.projectDir })
        : { patched: false, depAdded: false },
      runTestsScript: addE2eToRunTestsScript({ projectDir: args.projectDir }),
    };
  }
  const templates = writePlaywrightTemplates({
    projectDir: args.projectDir,
    force: args.force,
    templatesDir: args.templatesDir,
    files: NODE_E2E_TEMPLATE_FILES,
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
    // Node project: no pyproject to patch.
    pyproject: { patched: false, depAdded: false },
    runTestsScript,
  };
}

/** Re-export so consumers can import everything from one module. */
export {
  PLAYWRIGHT_TEMPLATE_FILES,
  NODE_E2E_TEMPLATE_FILES,
  PYTHON_E2E_TEMPLATE_FILES,
};
