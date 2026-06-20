// BDD coverage for the [Infra]-tag runner. Hermetic: the JUnit emitter
// is a pure function so it tests cleanly; the scaffolder helpers test
// against a tmpdir + real templates; the live suite is gated behind
// LAKEBASE_RUN_LIVE_INFRA=1 + a real instance/branch since it shells
// to the databricks CLI.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatJUnit,
  type InfraSuiteResult,
} from "../../scripts/lakebase/infra-runner";
import {
  addInfraToPackageJson,
  addInfraToRunTestsScript,
  enableInfraForProject,
} from "../../scripts/lakebase/enable-infra";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..");
const KIT_RUN_TESTS_SH = path.join(REPO_ROOT, "templates", "project", "common", "scripts", "run-tests.sh");

function mkTempProject(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `feip7207-${prefix}-`));
}

function rm(dir: string): void {
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
        name: "fixture",
        version: "0.0.0",
        scripts: { test: "jest --forceExit" },
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

describe("formatJUnit", () => {
  it("emits a well-formed suite with passing testcase elements", () => {
    const result: InfraSuiteResult = {
      passed: true,
      checks: [
        { name: "migrations-clean", passed: true, detail: "no pending", duration_ms: 23 },
        { name: "schema-diff-computable", passed: true, detail: "diff ok", duration_ms: 41 },
        { name: "connection-reachable", passed: true, detail: "dsn minted", duration_ms: 12 },
      ],
      branch: "feature-x",
      duration_ms: 80,
    };
    const xml = formatJUnit(result);
    expect(xml).toMatch(/<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toMatch(/tests="3" failures="0"/);
    expect(xml).toMatch(/name="migrations-clean"/);
    expect(xml).not.toMatch(/<failure/);
  });

  it("emits a <failure> element for each failed check", () => {
    const result: InfraSuiteResult = {
      passed: false,
      checks: [
        { name: "migrations-clean", passed: false, detail: "2 pending migrations: V3, V4", duration_ms: 11 },
        { name: "schema-diff-computable", passed: true, detail: "ok", duration_ms: 9 },
        { name: "connection-reachable", passed: true, detail: "ok", duration_ms: 8 },
      ],
      branch: "feature-x",
      duration_ms: 28,
    };
    const xml = formatJUnit(result);
    expect(xml).toMatch(/tests="3" failures="1"/);
    expect(xml).toMatch(/<failure message="2 pending migrations: V3, V4"/);
  });

  it("escapes XML-significant characters in failure detail", () => {
    const result: InfraSuiteResult = {
      passed: false,
      checks: [
        {
          name: "schema-diff-computable",
          passed: false,
          detail: 'crash: <unexpected> "quoted" & ampersand',
          duration_ms: 5,
        },
      ],
      branch: "x",
      duration_ms: 5,
    };
    const xml = formatJUnit(result);
    expect(xml).toContain("&lt;unexpected&gt;");
    expect(xml).toContain("&quot;quoted&quot;");
    expect(xml).toContain("&amp; ampersand");
    expect(xml).not.toMatch(/<unexpected>/);
  });
});

describe("addInfraToPackageJson", () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = mkTempProject("pkg");
  });
  afterEach(() => rm(projectDir));

  it("adds the test:infra script pointing at the kit bin via npx", () => {
    seedNodeProject(projectDir);
    const result = addInfraToPackageJson({ projectDir });
    expect(result).toEqual({ patched: true, scriptAdded: true });
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
    expect(pkg.scripts["test:infra"]).toBe("npx --yes lakebase-infra-runner");
    expect(pkg.scripts.test).toBe("jest --forceExit");
  });

  it("is idempotent: a second invocation reports no change", () => {
    seedNodeProject(projectDir);
    addInfraToPackageJson({ projectDir });
    const second = addInfraToPackageJson({ projectDir });
    expect(second).toEqual({ patched: true, scriptAdded: false });
  });

  it("honors a user-pinned script when test:infra is already present", () => {
    seedNodeProject(projectDir);
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
    pkg.scripts["test:infra"] = "node scripts/custom-infra.js";
    fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    addInfraToPackageJson({ projectDir });
    const fresh = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
    expect(fresh.scripts["test:infra"]).toBe("node scripts/custom-infra.js");
  });

  it("no-ops when package.json is absent", () => {
    const result = addInfraToPackageJson({ projectDir });
    expect(result).toEqual({ patched: false, scriptAdded: false });
  });

  it("respects a scriptValue override", () => {
    seedNodeProject(projectDir);
    addInfraToPackageJson({ projectDir, scriptValue: "node scripts/infra.js" });
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
    expect(pkg.scripts["test:infra"]).toBe("node scripts/infra.js");
  });
});

describe("addInfraToRunTestsScript", () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = mkTempProject("rts");
  });
  afterEach(() => rm(projectDir));

  it("appends an infra block to scripts/run-tests.sh", () => {
    seedRunTestsScript(projectDir);
    const result = addInfraToRunTestsScript({ projectDir });
    expect(result).toEqual({ patched: true, inserted: true });
    const content = fs.readFileSync(path.join(projectDir, "scripts", "run-tests.sh"), "utf8");
    expect(content).toMatch(/\[Infra\] suite|Lakebase \[Infra\]/);
    expect(content).toMatch(/npm run test:infra/);
  });

  it("is idempotent", () => {
    seedRunTestsScript(projectDir);
    addInfraToRunTestsScript({ projectDir });
    const second = addInfraToRunTestsScript({ projectDir });
    expect(second).toEqual({ patched: true, inserted: false });
  });

  it("no-ops when run-tests.sh is absent", () => {
    const result = addInfraToRunTestsScript({ projectDir });
    expect(result).toEqual({ patched: false, inserted: false });
  });
});

describe("enableInfraForProject orchestrator", () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = mkTempProject("orch");
  });
  afterEach(() => rm(projectDir));

  it("patches package.json + run-tests.sh in one call", () => {
    seedNodeProject(projectDir);
    seedRunTestsScript(projectDir);
    const result = enableInfraForProject({ projectDir });
    expect(result.packageJson.scriptAdded).toBe(true);
    expect(result.runTestsScript.inserted).toBe(true);
  });

  it("is idempotent end-to-end: second call reports no new work", () => {
    seedNodeProject(projectDir);
    seedRunTestsScript(projectDir);
    enableInfraForProject({ projectDir });
    const second = enableInfraForProject({ projectDir });
    expect(second.packageJson.scriptAdded).toBe(false);
    expect(second.runTestsScript.inserted).toBe(false);
  });

  it("is safe on non-Node projects: package.json patch is skipped but run-tests.sh is updated", () => {
    seedRunTestsScript(projectDir);
    const result = enableInfraForProject({ projectDir });
    expect(result.packageJson.patched).toBe(false);
    expect(result.runTestsScript.inserted).toBe(true);
  });
});

describe("SKILL.md tag-to-runner table includes the Infra row", () => {
  it("documents `npm run test:infra` and the substrate runner bin", () => {
    const skill = fs.readFileSync(
      path.join(REPO_ROOT, "skills", "lakebase-sftdd-workflows", "SKILL.md"),
      "utf8"
    );
    expect(skill).toMatch(/\| `Infra` \| `infra` \|/);
    expect(skill).toMatch(/lakebase-infra-runner/);
    expect(skill).toMatch(/npm run test:infra/);
  });

  it("spec-format.md defines the [Infra] semantics and the three v1 checks", () => {
    const ref = fs.readFileSync(
      path.join(REPO_ROOT, "skills", "lakebase-sftdd-workflows", "references", "spec-format.md"),
      "utf8"
    );
    expect(ref).toMatch(/AC layer semantics/);
    expect(ref).toMatch(/migrations-clean/);
    expect(ref).toMatch(/schema-diff-computable/);
    expect(ref).toMatch(/connection-reachable/);
  });
});

// Live suite gate. The runner shells out to the databricks CLI and
// queries real Lakebase metadata, so it requires both the CLI and a
// configured profile + instance + branch.
const cliAvailable = (() => {
  try {
    execFileSync("databricks", ["--version"], { stdio: "ignore", timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
})();
const LIVE_INSTANCE = process.env.LAKEBASE_TEST_INSTANCE;
const LIVE_BRANCH = process.env.LAKEBASE_TEST_BRANCH;
const RUN_LIVE =
  process.env.LAKEBASE_RUN_LIVE_INFRA === "1" && cliAvailable && !!LIVE_INSTANCE && !!LIVE_BRANCH;

describe.skipIf(!RUN_LIVE)("runInfraSuite: live (gated)", () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = mkTempProject("live");
    execSync("git init --quiet", { cwd: projectDir, stdio: "pipe" });
  });
  afterEach(() => rm(projectDir));

  it("runs every check and writes a JUnit XML report when --junit-output is set", async () => {
    const { runInfraSuite } = await import("../../scripts/lakebase/infra-runner");
    const junit = path.join(projectDir, ".tmp", "infra.junit.xml");
    const result = await runInfraSuite({
      instance: LIVE_INSTANCE!,
      branch: LIVE_BRANCH!,
      projectDir,
      junitOutput: junit,
    });
    expect(result.checks.map((c) => c.name).sort()).toEqual(
      ["connection-reachable", "migrations-clean", "schema-diff-computable"].sort()
    );
    expect(fs.existsSync(junit)).toBe(true);
    const xml = fs.readFileSync(junit, "utf8");
    expect(xml).toMatch(/<testsuites/);
  }, 120_000);
});

describe("runInfraSuite: skip reason when live gate is off", () => {
  it("logs a skip reason when LAKEBASE_RUN_LIVE_INFRA!=1 or the CLI is missing", () => {
    if (RUN_LIVE) return;
    // eslint-disable-next-line no-console
    console.log(
      !cliAvailable
        ? "`databricks` CLI not available - live runInfraSuite suite skipped."
        : "LAKEBASE_RUN_LIVE_INFRA / LAKEBASE_TEST_INSTANCE / LAKEBASE_TEST_BRANCH not set - skipped."
    );
  });
});
