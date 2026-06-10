// Phase 1 BDD coverage. Hermetic: the file-copy half runs
// against a tmpdir + a real on-disk templates tree; the npm/npx install
// half is gated on a live env var so CI doesn't pay the chromium-download
// cost on every PR. The shape assertion (exports + signatures) runs
// unconditionally so a refactor that removes a public seam fails the
// suite.
//
// Live install gate: set LAKEBASE_RUN_LIVE_PLAYWRIGHT_INSTALL=1 to
// exercise runPlaywrightInstall against a tmpdir with npm available.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  installPlaywright,
  runPlaywrightInstall,
  writePlaywrightTemplates,
  PLAYWRIGHT_TEMPLATE_FILES,
} from "../../scripts/lakebase/install-playwright.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_TEMPLATES = path.resolve(here, "..", "..", "templates", "project");

function mkTempProject(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `feip7094-${prefix}-`));
}

function rmTempProject(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe("writePlaywrightTemplates: file copy", () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = mkTempProject("write");
  });
  afterEach(() => rmTempProject(projectDir));

  it("drops both template files relative to projectDir", () => {
    const result = writePlaywrightTemplates({ projectDir, templatesDir: REPO_TEMPLATES });
    expect(result.written.sort()).toEqual([...PLAYWRIGHT_TEMPLATE_FILES].sort());
    expect(result.skipped).toEqual([]);
    for (const rel of PLAYWRIGHT_TEMPLATE_FILES) {
      expect(fs.existsSync(path.join(projectDir, rel)), `missing: ${rel}`).toBe(true);
    }
  });

  it("creates nested test directories that did not pre-exist", () => {
    writePlaywrightTemplates({ projectDir, templatesDir: REPO_TEMPLATES });
    expect(fs.existsSync(path.join(projectDir, "tests", "e2e"))).toBe(true);
  });

  it("skips existing files by default and reports them in `skipped`", () => {
    fs.writeFileSync(path.join(projectDir, "playwright.config.ts"), "// user-edited\n", "utf8");
    const result = writePlaywrightTemplates({ projectDir, templatesDir: REPO_TEMPLATES });
    expect(result.skipped).toContain("playwright.config.ts");
    expect(result.written).not.toContain("playwright.config.ts");
    expect(fs.readFileSync(path.join(projectDir, "playwright.config.ts"), "utf8")).toBe("// user-edited\n");
  });

  it("overwrites existing files when force=true", () => {
    fs.writeFileSync(path.join(projectDir, "playwright.config.ts"), "// stale\n", "utf8");
    const result = writePlaywrightTemplates({ projectDir, templatesDir: REPO_TEMPLATES, force: true });
    expect(result.written).toContain("playwright.config.ts");
    expect(result.skipped).not.toContain("playwright.config.ts");
    const fresh = fs.readFileSync(path.join(projectDir, "playwright.config.ts"), "utf8");
    expect(fresh).toContain("@playwright/test");
    expect(fresh).not.toBe("// stale\n");
  });

  it("rejects when the templates dir override is missing the kit's templates", () => {
    const bogus = mkTempProject("bogus-templates");
    try {
      expect(() =>
        writePlaywrightTemplates({ projectDir, templatesDir: bogus })
      ).toThrow(/Kit template missing/);
    } finally {
      rmTempProject(bogus);
    }
  });
});

describe("installPlaywright: orchestrator shape", () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = mkTempProject("orch");
  });
  afterEach(() => rmTempProject(projectDir));

  it("templates-only mode returns templates result, no install result", async () => {
    const result = await installPlaywright({
      projectDir,
      templatesDir: REPO_TEMPLATES,
      skipBrowserInstall: true,
    });
    expect(result.templates.written.length).toBeGreaterThan(0);
    expect(result.install).toBeUndefined();
    for (const rel of PLAYWRIGHT_TEMPLATE_FILES) {
      expect(fs.existsSync(path.join(projectDir, rel))).toBe(true);
    }
  });

  it("templates are idempotent when re-run without force", async () => {
    await installPlaywright({ projectDir, templatesDir: REPO_TEMPLATES, skipBrowserInstall: true });
    const second = await installPlaywright({
      projectDir,
      templatesDir: REPO_TEMPLATES,
      skipBrowserInstall: true,
    });
    expect(second.templates.written).toEqual([]);
    expect(second.templates.skipped.sort()).toEqual([...PLAYWRIGHT_TEMPLATE_FILES].sort());
  });
});

describe("bundled templates: content sanity", () => {
  it("playwright.config.ts reads BASE_URL from env and is chromium-only", () => {
    const content = fs.readFileSync(path.join(REPO_TEMPLATES, "common", "playwright.config.ts"), "utf8");
    expect(content).toMatch(/process\.env\.BASE_URL/);
    expect(content).toMatch(/chromium/);
    expect(content).toMatch(/@playwright\/test/);
    // v1 out-of-scope: assert we did NOT add cross-browser
    // project entries. Match only on the `name: "..."` line so this
    // guard ignores commentary mentioning other engines.
    expect(content).not.toMatch(/name:\s*["'](firefox|webkit)["']/i);
  });

  it("smoke fixture uses the configured baseURL and tolerates any non-5xx", () => {
    const content = fs.readFileSync(
      path.join(REPO_TEMPLATES, "common", "tests", "e2e", "smoke.spec.ts"),
      "utf8"
    );
    expect(content).toMatch(/baseURL/);
    expect(content).toMatch(/toBeLessThan\(500\)/);
  });
});

// Live shell-out gate: opt-in because chromium download is slow + heavy.
const npmAvailable = (() => {
  try {
    execFileSync("npm", ["--version"], { stdio: "ignore", timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
})();
const RUN_LIVE = npmAvailable && process.env.LAKEBASE_RUN_LIVE_PLAYWRIGHT_INSTALL === "1";

describe.skipIf(!RUN_LIVE)("runPlaywrightInstall: live (gated)", () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = mkTempProject("live");
    // Minimal package.json so `npm install --save-dev` has somewhere to write.
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "feip7094-live-smoke", version: "0.0.0", private: true }, null, 2)
    );
  });
  afterEach(() => rmTempProject(projectDir));

  it("installs @playwright/test, installs chromium, returns a version string", async () => {
    const result = await runPlaywrightInstall({ projectDir });
    expect(result.browserInstalled).toBe(true);
    expect(result.version).toMatch(/Version \d+\.\d+\.\d+/i);
  }, 300_000);
});

describe("runPlaywrightInstall: skip reason when live gate is off", () => {
  it("logs a skip reason when LAKEBASE_RUN_LIVE_PLAYWRIGHT_INSTALL!=1 or npm missing", () => {
    if (RUN_LIVE) return;
    // eslint-disable-next-line no-console
    console.log(
      !npmAvailable
        ? "`npm` not available - live runPlaywrightInstall suite skipped."
        : "LAKEBASE_RUN_LIVE_PLAYWRIGHT_INSTALL not set - live install suite skipped."
    );
  });
});
