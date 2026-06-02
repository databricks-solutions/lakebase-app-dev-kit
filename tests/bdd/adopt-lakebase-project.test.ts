// Hermetic coverage for the brownfield Lakebase adoption primitive's
// pre-flight + helper surface. The server-side `createLakebaseProject`
// is live-only and gated by a separate env var; the unit tests here
// exercise the file-system gates (git repo required, env compatibility)
// and the helper that the CLI/extension calls before invoking the
// orchestrator.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  assertAdoptionPreflight,
  _testMakeBrownfieldFixture,
} from "../../scripts/lakebase/adopt-lakebase-project.js";

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `adopt-lakebase-${prefix}-`));
}

function rm(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe("assertAdoptionPreflight", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkTmp("preflight");
  });
  afterEach(() => rm(dir));

  it("rejects when the project directory does not exist", () => {
    const missing = path.join(os.tmpdir(), `adopt-lakebase-missing-${Date.now()}`);
    expect(() => assertAdoptionPreflight({ projectDir: missing })).toThrow(
      /does not exist/i
    );
  });

  it("rejects when the project directory is not a git repo", () => {
    expect(() => assertAdoptionPreflight({ projectDir: dir })).toThrow(/not a git repo/i);
  });

  it("accepts a freshly-initialised git repo", () => {
    execSync("git init --quiet", { cwd: dir, stdio: "pipe" });
    expect(() => assertAdoptionPreflight({ projectDir: dir })).not.toThrow();
  });

  it("rejects when .env already declares a different LAKEBASE_PROJECT_ID and expectedProjectName is supplied", () => {
    execSync("git init --quiet", { cwd: dir, stdio: "pipe" });
    fs.writeFileSync(path.join(dir, ".env"), "LAKEBASE_PROJECT_ID=other-project\n");
    expect(() =>
      assertAdoptionPreflight({ projectDir: dir, expectedProjectName: "my-project" })
    ).toThrow(/already declares LAKEBASE_PROJECT_ID=other-project/);
  });

  it("accepts when .env declares the same LAKEBASE_PROJECT_ID as the expected name", () => {
    execSync("git init --quiet", { cwd: dir, stdio: "pipe" });
    fs.writeFileSync(path.join(dir, ".env"), "LAKEBASE_PROJECT_ID=my-project\n");
    expect(() =>
      assertAdoptionPreflight({ projectDir: dir, expectedProjectName: "my-project" })
    ).not.toThrow();
  });

  it("accepts when .env has no LAKEBASE_PROJECT_ID line at all", () => {
    execSync("git init --quiet", { cwd: dir, stdio: "pipe" });
    fs.writeFileSync(path.join(dir, ".env"), "DATABRICKS_HOST=https://example.cloud.databricks.com\n");
    expect(() =>
      assertAdoptionPreflight({ projectDir: dir, expectedProjectName: "my-project" })
    ).not.toThrow();
  });

  it("strips quotes and surrounding whitespace from .env values before comparison", () => {
    execSync("git init --quiet", { cwd: dir, stdio: "pipe" });
    fs.writeFileSync(path.join(dir, ".env"), `LAKEBASE_PROJECT_ID = "my-project"  \n`);
    expect(() =>
      assertAdoptionPreflight({ projectDir: dir, expectedProjectName: "my-project" })
    ).not.toThrow();
  });
});

describe("_testMakeBrownfieldFixture helper", () => {
  let dir: string;
  beforeEach(() => {
    dir = path.join(os.tmpdir(), `adopt-lakebase-fixture-${Date.now()}`);
  });
  afterEach(() => rm(dir));

  it("creates a git repo at the requested path", () => {
    _testMakeBrownfieldFixture({ dir });
    expect(fs.existsSync(path.join(dir, ".git"))).toBe(true);
  });

  it("creates the requested package.json when supplied", () => {
    _testMakeBrownfieldFixture({
      dir,
      packageJson: { name: "fixture", version: "0.0.0", private: true },
    });
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    expect(pkg.name).toBe("fixture");
  });

  it("omits package.json when not requested", () => {
    _testMakeBrownfieldFixture({ dir });
    expect(fs.existsSync(path.join(dir, "package.json"))).toBe(false);
  });
});
