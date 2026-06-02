// FEIP-7094 Phase 2 BDD coverage. Hermetic: every test runs against a
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
  enableE2eForProject,
  PLAYWRIGHT_TEMPLATE_FILES,
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

describe("enableE2eForProject orchestrator", () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = mkTempProject("orch");
  });
  afterEach(() => rmTempProject(projectDir));

  it("drops templates, patches package.json, and patches run-tests.sh", () => {
    seedNodeProject(projectDir);
    seedRunTestsScript(projectDir);
    const result = enableE2eForProject({ projectDir, templatesDir: REPO_TEMPLATES });
    expect(result.templatesWritten.sort()).toEqual([...PLAYWRIGHT_TEMPLATE_FILES].sort());
    expect(result.packageJson.scriptAdded).toBe(true);
    expect(result.packageJson.depAdded).toBe(true);
    expect(result.runTestsScript.inserted).toBe(true);
    for (const rel of PLAYWRIGHT_TEMPLATE_FILES) {
      expect(fs.existsSync(path.join(projectDir, rel))).toBe(true);
    }
  });

  it("is safe on non-Node projects: templates land, package.json is untouched, run-tests.sh patched", () => {
    seedRunTestsScript(projectDir);
    const result = enableE2eForProject({ projectDir, templatesDir: REPO_TEMPLATES });
    expect(result.templatesWritten.length).toBeGreaterThan(0);
    expect(result.packageJson).toEqual({ patched: false, scriptAdded: false, depAdded: false });
    expect(result.runTestsScript.inserted).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "package.json"))).toBe(false);
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
    expect(yml).toMatch(/FEIP-7094 Phase 2/);
  });
});
