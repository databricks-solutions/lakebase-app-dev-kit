// Coverage for the .claude/commands/*.md refresher. Pure filesystem
// against tmpdir-based projects; no live Lakebase.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { updateCommands } from "../../scripts/lakebase/update-commands.js";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const KIT_COMMANDS_DIR = path.join(
  REPO_ROOT,
  "templates",
  "project",
  "common",
  ".claude",
  "commands"
);

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
});

function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feip7425-"));
  tmpDirs.push(dir);
  return dir;
}

function kitVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  return pkg.version as string;
}

function expectedContent(name: string, pinnedVersion: string): string {
  return fs
    .readFileSync(path.join(KIT_COMMANDS_DIR, name), "utf8")
    .replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, pinnedVersion);
}

describe("updateCommands: empty project", () => {
  it("creates .claude/commands/ and writes design.md + build.md with the current kit version", () => {
    const dir = mkProject();
    const result = updateCommands({ projectDir: dir });
    expect(result.changed).toBe(true);
    expect(result.files.map((f) => f.outcome).sort()).toEqual(["added", "added"]);
    const design = fs.readFileSync(path.join(dir, ".claude", "commands", "design.md"), "utf8");
    expect(design).toBe(expectedContent("design.md", kitVersion()));
  });
});

describe("updateCommands: in-sync project", () => {
  it("reports every file as unchanged and changed=false", () => {
    const dir = mkProject();
    fs.mkdirSync(path.join(dir, ".claude", "commands"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".claude", "commands", "design.md"),
      expectedContent("design.md", kitVersion())
    );
    fs.writeFileSync(
      path.join(dir, ".claude", "commands", "build.md"),
      expectedContent("build.md", kitVersion())
    );
    const result = updateCommands({ projectDir: dir });
    expect(result.changed).toBe(false);
    expect(result.files.every((f) => f.outcome === "unchanged")).toBe(true);
  });
});

describe("updateCommands: drifted project", () => {
  it("overwrites drifted file when force=true (default) and reports 'updated'", () => {
    const dir = mkProject();
    fs.mkdirSync(path.join(dir, ".claude", "commands"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".claude", "commands", "design.md"),
      "# /design (project-customized)\n"
    );
    fs.writeFileSync(
      path.join(dir, ".claude", "commands", "build.md"),
      expectedContent("build.md", kitVersion())
    );
    const result = updateCommands({ projectDir: dir });
    expect(result.changed).toBe(true);
    const design = result.files.find((f) => f.name === "design.md")!;
    expect(design.outcome).toBe("updated");
    expect(fs.readFileSync(path.join(dir, ".claude", "commands", "design.md"), "utf8")).toBe(
      expectedContent("design.md", kitVersion())
    );
  });

  it("preserves drifted file when force=false and reports 'preserved'", () => {
    const dir = mkProject();
    fs.mkdirSync(path.join(dir, ".claude", "commands"), { recursive: true });
    const customized = "# /design (project-customized)\n";
    fs.writeFileSync(path.join(dir, ".claude", "commands", "design.md"), customized);
    fs.writeFileSync(
      path.join(dir, ".claude", "commands", "build.md"),
      expectedContent("build.md", kitVersion())
    );
    const result = updateCommands({ projectDir: dir, force: false });
    expect(result.changed).toBe(false);
    const design = result.files.find((f) => f.name === "design.md")!;
    expect(design.outcome).toBe("preserved");
    expect(fs.readFileSync(path.join(dir, ".claude", "commands", "design.md"), "utf8")).toBe(customized);
  });
});

describe("updateCommands: hook files", () => {
  it("never touches design.{pre,post}-hook.md or build.{pre,post}-hook.md", () => {
    const dir = mkProject();
    fs.mkdirSync(path.join(dir, ".claude", "commands"), { recursive: true });
    const hookFiles = [
      "design.pre-hook.md",
      "design.post-hook.md",
      "build.pre-hook.md",
      "build.post-hook.md",
    ];
    const sentinel = "# hook owned by the project\n";
    for (const h of hookFiles) {
      fs.writeFileSync(path.join(dir, ".claude", "commands", h), sentinel);
    }
    const result = updateCommands({ projectDir: dir });
    for (const h of hookFiles) {
      expect(fs.readFileSync(path.join(dir, ".claude", "commands", h), "utf8")).toBe(sentinel);
      expect(result.files.find((f) => f.name === h)).toBeUndefined();
    }
  });
});

describe("updateCommands: dry-run", () => {
  it("reports outcomes without writing anything to disk", () => {
    const dir = mkProject();
    fs.mkdirSync(path.join(dir, ".claude", "commands"), { recursive: true });
    const customized = "# /design (project-customized)\n";
    fs.writeFileSync(path.join(dir, ".claude", "commands", "design.md"), customized);
    const result = updateCommands({ projectDir: dir, dryRun: true });
    expect(result.changed).toBe(true);
    expect(result.files.find((f) => f.name === "design.md")?.outcome).toBe("updated");
    expect(fs.readFileSync(path.join(dir, ".claude", "commands", "design.md"), "utf8")).toBe(customized);
  });

  it("dry-run + force=false reports the same outcomes the non-dry-run would", () => {
    const dir = mkProject();
    fs.mkdirSync(path.join(dir, ".claude", "commands"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude", "commands", "design.md"), "# customized\n");
    const result = updateCommands({ projectDir: dir, dryRun: true, force: false });
    const design = result.files.find((f) => f.name === "design.md")!;
    expect(design.outcome).toBe("preserved");
  });
});

describe("updateCommands: idempotency", () => {
  it("running twice with force=true is a no-op on the second call", () => {
    const dir = mkProject();
    updateCommands({ projectDir: dir });
    const second = updateCommands({ projectDir: dir });
    expect(second.changed).toBe(false);
    expect(second.files.every((f) => f.outcome === "unchanged")).toBe(true);
  });
});

describe("updateCommands: missing file fills in even with force=false", () => {
  it("adds a missing file regardless of force (force only gates overwrites)", () => {
    const dir = mkProject();
    fs.mkdirSync(path.join(dir, ".claude", "commands"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".claude", "commands", "build.md"),
      expectedContent("build.md", kitVersion())
    );
    // design.md missing.
    const result = updateCommands({ projectDir: dir, force: false });
    expect(result.changed).toBe(true);
    expect(result.files.find((f) => f.name === "design.md")?.outcome).toBe("added");
    expect(fs.existsSync(path.join(dir, ".claude", "commands", "design.md"))).toBe(true);
  });
});

describe("updateCommands: sort order", () => {
  it("sorts files added > updated > preserved > unchanged for deterministic output", () => {
    const dir = mkProject();
    fs.mkdirSync(path.join(dir, ".claude", "commands"), { recursive: true });
    // design.md is missing (will be added); build.md is drifted (will be updated).
    fs.writeFileSync(path.join(dir, ".claude", "commands", "build.md"), "# customized\n");
    const result = updateCommands({ projectDir: dir });
    expect(result.files.map((f) => f.outcome)).toEqual(["added", "updated"]);
  });
});
