// The artifact root (.sftdd) is resolved in one place with dual-read backward
// compat, and a legacy ".tdd" dir is auto-migrated to ".sftdd" on the next
// orchestrated run. These guard both halves: resolution preference + migration.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ARTIFACT_ROOT,
  LEGACY_ARTIFACT_ROOT,
  resolveSftddDir,
} from "../../scripts/sftdd/sftdd-paths";
import { migrateLegacyArtifactDir } from "../../scripts/sftdd/migrate-artifact-dir";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sftdd-root-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("artifact root names", () => {
  it("uses .sftdd as the current root and .tdd as the legacy root", () => {
    expect(ARTIFACT_ROOT).toBe(".sftdd");
    expect(LEGACY_ARTIFACT_ROOT).toBe(".tdd");
  });
});

describe("resolveSftddDir (dual-read, prefers .sftdd)", () => {
  it("defaults a fresh project to .sftdd", () => {
    expect(resolveSftddDir(dir)).toBe(join(dir, ".sftdd"));
  });

  it("honors a legacy .tdd dir when that is what exists", () => {
    mkdirSync(join(dir, ".tdd"));
    expect(resolveSftddDir(dir)).toBe(join(dir, ".tdd"));
  });

  it("prefers .sftdd over a legacy .tdd when both exist", () => {
    mkdirSync(join(dir, ".tdd"));
    mkdirSync(join(dir, ".sftdd"));
    expect(resolveSftddDir(dir)).toBe(join(dir, ".sftdd"));
  });
});

describe("migrateLegacyArtifactDir (auto-migrate .tdd -> .sftdd)", () => {
  it("is a no-op when there is no legacy .tdd", () => {
    const r = migrateLegacyArtifactDir(dir);
    expect(r.migrated).toBe(false);
    expect(existsSync(join(dir, ".sftdd"))).toBe(false);
  });

  it("renames a legacy .tdd to .sftdd via fs when not a git repo", () => {
    mkdirSync(join(dir, ".tdd"));
    writeFileSync(join(dir, ".tdd", "spec.json"), "{}\n", "utf8");
    const r = migrateLegacyArtifactDir(dir);
    expect(r.migrated).toBe(true);
    expect(r.via).toBe("fs");
    expect(existsSync(join(dir, ".tdd"))).toBe(false);
    expect(readFileSync(join(dir, ".sftdd", "spec.json"), "utf8")).toBe("{}\n");
  });

  it("preserves git history with git mv inside a git repo", () => {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
    mkdirSync(join(dir, ".tdd"));
    writeFileSync(join(dir, ".tdd", "spec.json"), "{}\n", "utf8");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-qm", "seed"], { cwd: dir });

    const r = migrateLegacyArtifactDir(dir);
    expect(r.migrated).toBe(true);
    expect(r.via).toBe("git");
    expect(existsSync(join(dir, ".sftdd", "spec.json"))).toBe(true);
    // git sees a rename (staged), not an add+delete of unrelated files.
    const staged = execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" });
    expect(staged).toMatch(/R.*\.tdd\/spec\.json.*\.sftdd\/spec\.json/);
  });

  it("rewrites .gitignore entries from the legacy root to the new one", () => {
    mkdirSync(join(dir, ".tdd"));
    writeFileSync(
      join(dir, ".gitignore"),
      "node_modules/\n.tdd/agent-log.jsonl\n.tdd/run-config.json\ndist/\n",
      "utf8",
    );
    migrateLegacyArtifactDir(dir);
    const gi = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gi).toContain(".sftdd/agent-log.jsonl");
    expect(gi).toContain(".sftdd/run-config.json");
    expect(gi).not.toMatch(/^\.tdd\//m);
    expect(gi).toContain("node_modules/");
    expect(gi).toContain("dist/");
  });

  it("is a no-op (does not clobber) when .sftdd already exists", () => {
    mkdirSync(join(dir, ".tdd"));
    mkdirSync(join(dir, ".sftdd"));
    writeFileSync(join(dir, ".sftdd", "keep.json"), "keep\n", "utf8");
    const r = migrateLegacyArtifactDir(dir);
    expect(r.migrated).toBe(false);
    expect(existsSync(join(dir, ".tdd"))).toBe(true);
    expect(readFileSync(join(dir, ".sftdd", "keep.json"), "utf8")).toBe("keep\n");
  });
});
