// BDD coverage for the brownfield TDD adoption bin. Hermetic: every
// test runs against a tmpdir + real git init + real kit templates.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { adoptTdd } from "../../scripts/lakebase/adopt-sftdd";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..");
const REAL_BOOTSTRAP = path.join(REPO_ROOT, "templates", "sftdd-bootstrap", ".sftdd");

function mkRepo(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `adopt-sftdd-${prefix}-`));
  execSync("git init --quiet", { cwd: dir, stdio: "pipe" });
  return dir;
}

function rm(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe("adoptTdd: fresh adoption", () => {
  let repo: string;
  beforeEach(() => {
    repo = mkRepo("fresh");
  });
  afterEach(() => rm(repo));

  it("copies the bootstrap tree into .sftdd/ and reports every file in `added`", () => {
    const result = adoptTdd({ projectDir: repo });
    expect(result.added.length).toBeGreaterThan(0);
    expect(result.inSync).toEqual([]);
    expect(result.drifted).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.noChanges).toBe(false);

    // Spot-check that representative files actually landed.
    expect(fs.existsSync(path.join(repo, ".sftdd", "product-overview.md"))).toBe(true);
    expect(fs.existsSync(path.join(repo, ".sftdd", "workflow-state.json"))).toBe(true);
    expect(fs.existsSync(path.join(repo, ".sftdd", "features", ".gitkeep"))).toBe(true);
  });

  it("refuses without --update when .sftdd/ already exists", () => {
    adoptTdd({ projectDir: repo });
    expect(() => adoptTdd({ projectDir: repo })).toThrow(/already exists.*--update/i);
  });
});

describe("adoptTdd: pre-flight checks", () => {
  it("refuses when the project dir is missing", () => {
    const missing = path.join(os.tmpdir(), `adopt-sftdd-missing-${Date.now()}`);
    expect(() => adoptTdd({ projectDir: missing })).toThrow(/does not exist/i);
  });

  it("refuses when the project dir is not a git repo", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adopt-sftdd-nogit-"));
    try {
      expect(() => adoptTdd({ projectDir: dir })).toThrow(/Not a git repo/i);
    } finally {
      rm(dir);
    }
  });
});

describe("adoptTdd: --update mode", () => {
  let repo: string;
  beforeEach(() => {
    repo = mkRepo("update");
  });
  afterEach(() => rm(repo));

  it("on a clean re-run, every file is in-sync and noChanges=true", () => {
    adoptTdd({ projectDir: repo });
    const second = adoptTdd({ projectDir: repo, update: true });
    expect(second.added).toEqual([]);
    expect(second.drifted).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(second.inSync.length).toBeGreaterThan(0);
    expect(second.noChanges).toBe(true);
  });

  it("reports drift on user-edited files without overwriting them", () => {
    adoptTdd({ projectDir: repo });
    const specPath = path.join(repo, ".sftdd", "product-overview.md");
    fs.writeFileSync(specPath, "user-edited content\n", "utf8");
    const result = adoptTdd({ projectDir: repo, update: true });
    expect(result.drifted).toContain("product-overview.md");
    expect(result.updated).not.toContain("product-overview.md");
    expect(fs.readFileSync(specPath, "utf8")).toBe("user-edited content\n");
  });

  it("adds files that the project is missing relative to the kit template", () => {
    adoptTdd({ projectDir: repo });
    fs.rmSync(path.join(repo, ".sftdd", "smells.json"));
    const result = adoptTdd({ projectDir: repo, update: true });
    expect(result.added).toContain("smells.json");
    expect(fs.existsSync(path.join(repo, ".sftdd", "smells.json"))).toBe(true);
  });
});

describe("adoptTdd: --force mode", () => {
  let repo: string;
  beforeEach(() => {
    repo = mkRepo("force");
  });
  afterEach(() => rm(repo));

  it("overwrites drifted files and reports them under `updated`", () => {
    adoptTdd({ projectDir: repo });
    const specPath = path.join(repo, ".sftdd", "product-overview.md");
    fs.writeFileSync(specPath, "user-edited content\n", "utf8");
    const result = adoptTdd({ projectDir: repo, force: true });
    expect(result.updated).toContain("product-overview.md");
    expect(result.drifted).not.toContain("product-overview.md");
    expect(fs.readFileSync(specPath, "utf8")).not.toBe("user-edited content\n");
  });

  it("force implies update: it also runs on a project that already has .sftdd/", () => {
    adoptTdd({ projectDir: repo });
    // Without an explicit `update: true`, a force re-run still succeeds.
    const result = adoptTdd({ projectDir: repo, force: true });
    expect(result.noChanges).toBe(true);
  });
});

describe("adoptTdd: --dry-run mode", () => {
  let repo: string;
  beforeEach(() => {
    repo = mkRepo("dryrun");
  });
  afterEach(() => rm(repo));

  it("reports a fresh adoption without writing any files", () => {
    const result = adoptTdd({ projectDir: repo, dryRun: true });
    expect(result.added.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(repo, ".sftdd"))).toBe(false);
  });

  it("reports the same buckets in --update --dry-run mode", () => {
    adoptTdd({ projectDir: repo });
    fs.writeFileSync(path.join(repo, ".sftdd", "product-overview.md"), "user-edit\n", "utf8");
    const result = adoptTdd({ projectDir: repo, update: true, dryRun: true });
    expect(result.drifted).toContain("product-overview.md");
    // No files modified during dry-run.
    expect(fs.readFileSync(path.join(repo, ".sftdd", "product-overview.md"), "utf8")).toBe("user-edit\n");
  });

  it("dry-run with --force reports drifted files under `updated` without touching them", () => {
    adoptTdd({ projectDir: repo });
    const specPath = path.join(repo, ".sftdd", "product-overview.md");
    fs.writeFileSync(specPath, "user-edit\n", "utf8");
    const result = adoptTdd({ projectDir: repo, force: true, dryRun: true });
    expect(result.updated).toContain("product-overview.md");
    expect(fs.readFileSync(specPath, "utf8")).toBe("user-edit\n");
  });
});

describe("adoptTdd: bootstrap-dir override", () => {
  let repo: string;
  beforeEach(() => {
    repo = mkRepo("override");
  });
  afterEach(() => rm(repo));

  it("honors an explicit bootstrapDir and skips the auto-locate walk", () => {
    // Synthesize a minimal fixture (a single file) and assert the
    // override is the source of truth.
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "adopt-sftdd-fixture-"));
    try {
      fs.writeFileSync(path.join(fixture, "README.md"), "# fixture-only\n");
      const result = adoptTdd({ projectDir: repo, bootstrapDir: fixture });
      expect(result.added).toEqual(["README.md"]);
      expect(fs.readFileSync(path.join(repo, ".sftdd", "README.md"), "utf8")).toBe(
        "# fixture-only\n"
      );
    } finally {
      rm(fixture);
    }
  });

  it("rejects a missing bootstrapDir", () => {
    const missing = path.join(os.tmpdir(), `missing-bootstrap-${Date.now()}`);
    expect(() => adoptTdd({ projectDir: repo, bootstrapDir: missing })).toThrow(
      /bootstrap template tree missing/i
    );
  });
});

describe("adoptTdd: canonical bootstrap inspection", () => {
  it("the kit ships every file the docs reference", () => {
    // Spot-check the bootstrap-dir auto-located via the real kit. If
    // a future change reorganizes templates/sftdd-bootstrap/.sftdd the
    // contract here breaks loudly instead of silently shrinking.
    expect(fs.existsSync(path.join(REAL_BOOTSTRAP, "product-overview.md"))).toBe(true);
    expect(fs.existsSync(path.join(REAL_BOOTSTRAP, "workflow-state.json"))).toBe(true);
    expect(fs.existsSync(path.join(REAL_BOOTSTRAP, "selection-log.md"))).toBe(true);
    expect(fs.existsSync(path.join(REAL_BOOTSTRAP, "smells.json"))).toBe(true);
    expect(fs.existsSync(path.join(REAL_BOOTSTRAP, "features", ".gitkeep"))).toBe(true);
  });
});
