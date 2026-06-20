// BDD coverage for the imports-clean gate (scripts/sftdd/imports-clean.ts).
// Each test builds an isolated temp project so the check's entry detection +
// build-artifact hide/restore run against a real working tree, while the
// language importer is injected so no python/node subprocess is spawned.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  checkImportsClean,
  detectEntry,
  type Importer,
} from "../../scripts/sftdd/imports-clean.js";

const tmpDirs: string[] = [];

function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "imports-clean-"));
  tmpDirs.push(dir);
  return dir;
}

/** A python project with app/main.py + pyproject.toml. */
function pythonProject(): string {
  const dir = mkProject();
  fs.writeFileSync(path.join(dir, "pyproject.toml"), "[project]\nname='x'\n");
  fs.mkdirSync(path.join(dir, "app"));
  fs.writeFileSync(path.join(dir, "app", "main.py"), "app = object()\n");
  return dir;
}

function writeClientDist(dir: string): void {
  fs.mkdirSync(path.join(dir, "client", "dist", "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "client", "dist", "index.html"), "<html></html>");
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  }
});

describe("detectEntry", () => {
  it("maps app/main.py to the app.main module", () => {
    const dir = pythonProject();
    expect(detectEntry(dir, "python")).toBe("app.main");
  });

  it("falls back to main.py at the root", () => {
    const dir = mkProject();
    fs.writeFileSync(path.join(dir, "main.py"), "");
    expect(detectEntry(dir, "python")).toBe("main");
  });

  it("returns null when no conventional python entry exists", () => {
    const dir = mkProject();
    expect(detectEntry(dir, "python")).toBeNull();
  });

  it("returns null for java (no module-load SPA-mount class)", () => {
    const dir = mkProject();
    expect(detectEntry(dir, "java")).toBeNull();
  });
});

describe("checkImportsClean", () => {
  it("is clean when the entry imports successfully", () => {
    const dir = pythonProject();
    const importer: Importer = () => ({ code: 0, stderr: "" });
    const res = checkImportsClean({ projectDir: dir, importer });
    expect(res.clean).toBe(true);
    expect(res.entry).toBe("app.main");
    expect(res.lang).toBe("python");
  });

  it("hides client/dist during the import and restores it afterward", () => {
    const dir = pythonProject();
    writeClientDist(dir);
    let distPresentDuringImport = true;
    const importer: Importer = ({ projectDir }) => {
      distPresentDuringImport = fs.existsSync(path.join(projectDir, "client", "dist"));
      return { code: 0, stderr: "" };
    };
    const res = checkImportsClean({ projectDir: dir, importer });
    expect(distPresentDuringImport).toBe(false); // hidden while importing
    expect(res.hiddenArtifacts).toContain(path.join(dir, "client", "dist"));
    // restored after the check returns
    expect(fs.existsSync(path.join(dir, "client", "dist", "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "client", "dist.imports-clean-bak"))).toBe(false);
  });

  it("flags the smell when the entry cannot import with the artifact hidden", () => {
    const dir = pythonProject();
    writeClientDist(dir);
    const importer: Importer = () => ({
      code: 1,
      stderr: "RuntimeError: Directory 'client/dist/assets' does not exist",
    });
    const res = checkImportsClean({ projectDir: dir, importer });
    expect(res.clean).toBe(false);
    expect(res.error).toContain("does not exist");
    expect(res.remediation).toMatch(/import-time/i);
    // artifact restored even on failure
    expect(fs.existsSync(path.join(dir, "client", "dist", "index.html"))).toBe(true);
  });

  it("treats a project with no conventional entry as clean (nothing to check)", () => {
    const dir = mkProject();
    fs.writeFileSync(path.join(dir, "pyproject.toml"), "[project]\nname='x'\n");
    let called = false;
    const importer: Importer = () => {
      called = true;
      return { code: 0, stderr: "" };
    };
    const res = checkImportsClean({ projectDir: dir, importer });
    expect(res.clean).toBe(true);
    expect(res.entry).toBeNull();
    expect(called).toBe(false);
  });

  it("is clean when the language cannot be detected", () => {
    const dir = mkProject();
    const res = checkImportsClean({ projectDir: dir });
    expect(res.clean).toBe(true);
    expect(res.lang).toBeNull();
    expect(res.entry).toBeNull();
  });
});
