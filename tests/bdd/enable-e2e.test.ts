// Phase 2 BDD coverage. Hermetic: every test runs against a
// tmpdir built from in-repo fixtures so we never shell out to npm. The
// pr.yml template gets a content-sanity test so a future edit that drops
// the project-root E2E step fails this suite, not silently in CI.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addE2eToRunTestsScript,
  addPlaywrightToPackageJson,
  ensurePythonE2eDeps,
  ensurePythonBddDeps,
  enableE2eForProject,
  NODE_E2E_TEMPLATE_FILES,
  PYTHON_E2E_TEMPLATE_FILES,
  PLAYWRIGHT_TEST_VERSION_RANGE,
} from "../../scripts/lakebase/enable-e2e.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..");
const REPO_TEMPLATES = path.join(REPO_ROOT, "templates", "project");
const KIT_RUN_TESTS_SH = path.join(REPO_TEMPLATES, "common", "scripts", "run-tests.sh");

function mkTempProject(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `feip7094-p2-${prefix}-`));
}

function rmTempProject(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

function seedNodeProject(projectDir: string): void {
  fs.writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify(
      {
        name: "fixture-project",
        version: "0.0.0",
        scripts: { test: "jest --forceExit", migrate: "knex migrate:latest" },
        devDependencies: { jest: "^29.7.0" },
      },
      null,
      2
    ) + "\n"
  );
}

function seedRunTestsScript(projectDir: string): void {
  const scriptDir = path.join(projectDir, "scripts");
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.copyFileSync(KIT_RUN_TESTS_SH, path.join(scriptDir, "run-tests.sh"));
}

describe("addPlaywrightToPackageJson", () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = mkTempProject("pkg");
  });
  afterEach(() => rmTempProject(projectDir));

  it("adds the test:e2e script and the @playwright/test devDependency", () => {
    seedNodeProject(projectDir);
    const result = addPlaywrightToPackageJson({ projectDir });
    expect(result).toEqual({ patched: true, scriptAdded: true, depAdded: true });
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
    expect(pkg.scripts["test:e2e"]).toBe("playwright test");
    expect(pkg.devDependencies["@playwright/test"]).toBe(PLAYWRIGHT_TEST_VERSION_RANGE);
    // Existing scripts and deps are preserved.
    expect(pkg.scripts.test).toBe("jest --forceExit");
    expect(pkg.devDependencies.jest).toBe("^29.7.0");
  });

  it("is idempotent: a second invocation reports zero adds", () => {
    seedNodeProject(projectDir);
    addPlaywrightToPackageJson({ projectDir });
    const second = addPlaywrightToPackageJson({ projectDir });
    expect(second).toEqual({ patched: true, scriptAdded: false, depAdded: false });
  });

  it("honors a user-pinned version when @playwright/test is already present", () => {
    seedNodeProject(projectDir);
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
    pkg.devDependencies["@playwright/test"] = "1.42.0";
    fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    const result = addPlaywrightToPackageJson({ projectDir });
    expect(result.depAdded).toBe(false);
    const fresh = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
    expect(fresh.devDependencies["@playwright/test"]).toBe("1.42.0");
  });

  it("no-ops when package.json is absent", () => {
    const result = addPlaywrightToPackageJson({ projectDir });
    expect(result).toEqual({ patched: false, scriptAdded: false, depAdded: false });
    expect(fs.existsSync(path.join(projectDir, "package.json"))).toBe(false);
  });

  it("respects a versionRange override", () => {
    seedNodeProject(projectDir);
    addPlaywrightToPackageJson({ projectDir, versionRange: "1.49.1" });
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
    expect(pkg.devDependencies["@playwright/test"]).toBe("1.49.1");
  });
});

describe("addE2eToRunTestsScript", () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = mkTempProject("rts");
  });
  afterEach(() => rmTempProject(projectDir));

  it("appends a Playwright-invocation block to scripts/run-tests.sh", () => {
    seedRunTestsScript(projectDir);
    const before = fs.readFileSync(path.join(projectDir, "scripts", "run-tests.sh"), "utf8");
    const result = addE2eToRunTestsScript({ projectDir });
    expect(result).toEqual({ patched: true, inserted: true });
    const after = fs.readFileSync(path.join(projectDir, "scripts", "run-tests.sh"), "utf8");
    expect(after.startsWith(before.replace(/\n+$/, "\n"))).toBe(true);
    expect(after).toMatch(/Running Playwright E2E tests/);
    expect(after).toMatch(/playwright\.config\.ts/);
    expect(after).toMatch(/npm run test:e2e/);
  });

  it("is idempotent: a second invocation does not insert again", () => {
    seedRunTestsScript(projectDir);
    addE2eToRunTestsScript({ projectDir });
    const once = fs.readFileSync(path.join(projectDir, "scripts", "run-tests.sh"), "utf8");
    const second = addE2eToRunTestsScript({ projectDir });
    expect(second).toEqual({ patched: true, inserted: false });
    const twice = fs.readFileSync(path.join(projectDir, "scripts", "run-tests.sh"), "utf8");
    expect(twice).toBe(once);
  });

  it("no-ops when scripts/run-tests.sh is absent", () => {
    const result = addE2eToRunTestsScript({ projectDir });
    expect(result).toEqual({ patched: false, inserted: false });
  });
});

describe("ensurePythonE2eDeps (pyproject dev-extras patch)", () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = mkTempProject("pydeps");
  });
  afterEach(() => rmTempProject(projectDir));

  const py = () => path.join(projectDir, "pyproject.toml");

  it("inserts pytest-playwright into an existing dev array, preserving siblings", () => {
    fs.writeFileSync(
      py(),
      '[project]\nname = "x"\n\n[project.optional-dependencies]\ndev = [\n    "pytest>=8.0.0",\n    "httpx>=0.27.0",\n]\n',
    );
    const r = ensurePythonE2eDeps({ projectDir });
    expect(r).toEqual({ patched: true, depAdded: true });
    const out = fs.readFileSync(py(), "utf8");
    expect(out).toMatch(/pytest-playwright/);
    expect(out).toMatch(/"pytest>=8\.0\.0"/);
    expect(out).toMatch(/"httpx>=0\.27\.0"/);
  });

  it("is idempotent: a second call adds nothing", () => {
    fs.writeFileSync(
      py(),
      '[project]\nname = "x"\n\n[project.optional-dependencies]\ndev = [\n    "pytest>=8.0.0",\n]\n',
    );
    ensurePythonE2eDeps({ projectDir });
    const after1 = fs.readFileSync(py(), "utf8");
    const r2 = ensurePythonE2eDeps({ projectDir });
    expect(r2).toEqual({ patched: true, depAdded: false });
    expect(fs.readFileSync(py(), "utf8")).toBe(after1);
    expect((after1.match(/pytest-playwright/g) ?? []).length).toBe(1);
  });

  it("appends a dev extras table when none exists (retrofit)", () => {
    fs.writeFileSync(py(), '[project]\nname = "x"\n');
    const r = ensurePythonE2eDeps({ projectDir });
    expect(r).toEqual({ patched: true, depAdded: true });
    const out = fs.readFileSync(py(), "utf8");
    expect(out).toMatch(/\[project\.optional-dependencies\]/);
    expect(out).toMatch(/pytest-playwright/);
  });

  it("no-ops when pyproject.toml is absent", () => {
    expect(ensurePythonE2eDeps({ projectDir })).toEqual({ patched: false, depAdded: false });
  });

  it("ensurePythonBddDeps adds pytest-bdd (idempotent), preserving siblings", () => {
    fs.writeFileSync(
      py(),
      '[project]\nname = "x"\n\n[project.optional-dependencies]\ndev = [\n    "pytest>=8.0.0",\n]\n',
    );
    expect(ensurePythonBddDeps({ projectDir })).toEqual({ patched: true, depAdded: true });
    const out = fs.readFileSync(py(), "utf8");
    expect(out).toMatch(/pytest-bdd/);
    expect(out).toMatch(/"pytest>=8\.0\.0"/);
    expect(ensurePythonBddDeps({ projectDir })).toEqual({ patched: true, depAdded: false });
    expect((fs.readFileSync(py(), "utf8").match(/pytest-bdd/g) ?? []).length).toBe(1);
  });
});

describe("enableE2eForProject orchestrator", () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = mkTempProject("orch");
  });
  afterEach(() => rmTempProject(projectDir));

  it("Node project: drops the NODE e2e templates, patches package.json + run-tests.sh (no Python conftest)", () => {
    seedNodeProject(projectDir);
    seedRunTestsScript(projectDir);
    const result = enableE2eForProject({ projectDir, language: "nodejs", templatesDir: REPO_TEMPLATES });
    expect(result.templatesWritten.sort()).toEqual([...NODE_E2E_TEMPLATE_FILES].sort());
    expect(result.packageJson.scriptAdded).toBe(true);
    expect(result.packageJson.depAdded).toBe(true);
    expect(result.runTestsScript.inserted).toBe(true);
    for (const rel of NODE_E2E_TEMPLATE_FILES) {
      expect(fs.existsSync(path.join(projectDir, rel))).toBe(true);
    }
    // The Python live_server conftest must NOT ship into a Node project.
    for (const rel of PYTHON_E2E_TEMPLATE_FILES) {
      expect(fs.existsSync(path.join(projectDir, rel))).toBe(false);
    }
  });

  it("Python project: ships tests/e2e/conftest.py (live_server), NOT the Node playwright.config", () => {
    // Regression for the E2E-on-Python scaffold gap: a Python project (no
    // package.json, has pyproject.toml) must get its live_server conftest, the
    // prior all-or-nothing early-return dropped it and the driver fabricated one.
    // Realistic kit-scaffold pyproject (dev extras present) so we exercise the
    // insert-into-existing-`dev`-array path the live scaffold uses.
    fs.writeFileSync(
      path.join(projectDir, "pyproject.toml"),
      '[project]\nname = "x"\n\n[project.optional-dependencies]\ndev = [\n    "pytest>=8.0.0",\n    "httpx>=0.27.0",\n]\n',
    );
    seedRunTestsScript(projectDir);
    const result = enableE2eForProject({ projectDir, language: "python", templatesDir: REPO_TEMPLATES });
    expect(result.templatesWritten).toEqual([...PYTHON_E2E_TEMPLATE_FILES]);
    expect(fs.existsSync(path.join(projectDir, "tests", "e2e", "conftest.py"))).toBe(true);
    // No package.json to wire, and the Node config must NOT ship (it would trip CI's E2E gate).
    expect(result.packageJson).toEqual({ patched: false, scriptAdded: false, depAdded: false });
    expect(fs.existsSync(path.join(projectDir, "playwright.config.ts"))).toBe(false);
    // The Playwright RUNNER dep must be declared in pyproject's dev extras, the
    // shipped conftest + specs use the `page` fixture (else ModuleNotFoundError).
    expect(result.pyproject.depAdded).toBe(true);
    const pyproject = fs.readFileSync(path.join(projectDir, "pyproject.toml"), "utf8");
    expect(pyproject).toMatch(/pytest-playwright/);
    expect(pyproject).toMatch(/pytest-bdd/); // AC behavior scenarios authored as Gherkin
    expect(pyproject).toMatch(/"pytest>=8\.0\.0"/); // existing deps preserved
    expect(pyproject).toMatch(/"httpx>=0\.27\.0"/);
    // run-tests.sh patched: its block installs the browser then runs the suite.
    expect(result.runTestsScript.inserted).toBe(true);
    const runTests = fs.readFileSync(path.join(projectDir, "scripts", "run-tests.sh"), "utf8");
    expect(runTests).toMatch(/pytest tests\/e2e/);
    expect(runTests).toMatch(/playwright install chromium/);
  });

  it("is safe on non-Node projects: templates SKIPPED, package.json untouched, run-tests.sh still patched", () => {
    // Non-Node project shape (no root package.json). Previously the
    // orchestrator wrote playwright.config.ts unconditionally, which
    // then tripped pr.yml's E2E step (gated on hashFiles
    // 'playwright.config.*') and blew up with
    // "Cannot find module '@playwright/test'" because no Node deps
    // could be installed. Behavior now: skip the templates entirely
    // when there is nowhere to wire the npm side, so the CI step
    // never fires.
    seedRunTestsScript(projectDir);
    const result = enableE2eForProject({ projectDir, templatesDir: REPO_TEMPLATES });
    expect(result.templatesWritten).toEqual([]);
    expect(result.templatesSkipped.length).toBeGreaterThan(0);
    expect(result.packageJson).toEqual({ patched: false, scriptAdded: false, depAdded: false });
    // run-tests.sh patch still happens; the inserted block is itself
    // gated on playwright.config.* presence at run time, so a Python
    // project just no-ops through the E2E block.
    expect(result.runTestsScript.inserted).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "package.json"))).toBe(false);
    // And the config file itself must NOT have been written.
    expect(fs.existsSync(path.join(projectDir, "playwright.config.ts"))).toBe(false);
  });

  it("is idempotent end-to-end: second call reports zero new work", () => {
    seedNodeProject(projectDir);
    seedRunTestsScript(projectDir);
    enableE2eForProject({ projectDir, templatesDir: REPO_TEMPLATES });
    const second = enableE2eForProject({ projectDir, templatesDir: REPO_TEMPLATES });
    expect(second.templatesWritten).toEqual([]);
    expect(second.packageJson.scriptAdded).toBe(false);
    expect(second.packageJson.depAdded).toBe(false);
    expect(second.runTestsScript.inserted).toBe(false);
  });
});

describe("pr.yml template: project-root E2E step", () => {
  it("includes the project-root Playwright steps gated on playwright.config files", () => {
    const yml = fs.readFileSync(
      path.join(REPO_TEMPLATES, "common", ".github", "workflows", "pr.yml"),
      "utf8"
    );
    // The new steps are distinct from the existing client/-scoped steps.
    expect(yml).toMatch(/Install Playwright browsers \(project root\)/);
    expect(yml).toMatch(/Run E2E tests \(Playwright, project root\)/);
    // Project-root hashFiles guard MUST NOT include the `client/` prefix.
    const projectRootGuard = /hashFiles\('playwright\.config\.ts',\s*'playwright\.config\.js',\s*'playwright\.config\.mjs'\)/;
    expect(yml).toMatch(projectRootGuard);
    // The project-root step honors LAKEBASE_APP_ENDPOINT for BASE_URL.
    expect(yml).toMatch(/BASE_URL:\s*\$\{\{\s*env\.LAKEBASE_APP_ENDPOINT\s*\}\}/);
    // FEIP marker is present so a sloppy revert is easy to flag.
    expect(yml).toMatch(/Phase 2/);
  });
});
