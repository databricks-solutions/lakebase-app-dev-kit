// Coverage for the workflow drift detector. Pure
// filesystem; no live Lakebase, runs in the standard non-live suite.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { detectWorkflowDrift } from "../../scripts/lakebase/workflow-drift.js";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
});

function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-drift-"));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
  return dir;
}

function copyTemplate(projectDir: string, name: string): void {
  const src = path.join(
    REPO_ROOT,
    "templates",
    "project",
    "common",
    ".github",
    "workflows",
    name
  );
  const dst = path.join(projectDir, ".github", "workflows", name);
  fs.copyFileSync(src, dst);
}

describe("detectWorkflowDrift", () => {
  it("reports overall=ok when project matches the kit verbatim", () => {
    const dir = mkProject();
    copyTemplate(dir, "pr.yml");
    copyTemplate(dir, "merge.yml");
    copyTemplate(dir, "cleanup-orphans.yml");
    const report = detectWorkflowDrift({ projectDir: dir });
    expect(report.overall).toBe("ok");
    const byName = (n: string) => report.files.find((f) => f.name === n)!;
    expect(byName("pr.yml").status).toBe("unchanged");
    expect(byName("merge.yml").status).toBe("unchanged");
    expect(byName("cleanup-orphans.yml").status).toBe("unchanged");
  });

  it("reports drifted when project's pr.yml has been edited", () => {
    const dir = mkProject();
    copyTemplate(dir, "pr.yml");
    copyTemplate(dir, "merge.yml");
    copyTemplate(dir, "cleanup-orphans.yml");
    // Mutate the project copy
    const prPath = path.join(dir, ".github", "workflows", "pr.yml");
    fs.writeFileSync(
      prPath,
      fs.readFileSync(prPath, "utf8") + "\n# locally added comment\n"
    );
    const report = detectWorkflowDrift({ projectDir: dir });
    expect(report.overall).toBe("drift");
    const pr = report.files.find((f) => f.name === "pr.yml")!;
    expect(pr.status).toBe("drifted");
    expect(pr.diff).toMatch(/locally added comment/);
  });

  it("reports missing when project lacks a template file", () => {
    const dir = mkProject();
    // Only copy pr.yml, not merge.yml or cleanup-orphans.yml
    copyTemplate(dir, "pr.yml");
    const report = detectWorkflowDrift({ projectDir: dir });
    expect(report.overall).toBe("drift");
    const missing = report.files.filter((f) => f.status === "missing").map((f) => f.name);
    expect(missing).toContain("merge.yml");
    expect(missing).toContain("cleanup-orphans.yml");
  });

  it("reports extra when project has a workflow the kit doesn't template", () => {
    const dir = mkProject();
    copyTemplate(dir, "pr.yml");
    copyTemplate(dir, "merge.yml");
    copyTemplate(dir, "cleanup-orphans.yml");
    // Add a project-specific workflow
    fs.writeFileSync(
      path.join(dir, ".github", "workflows", "project-custom.yml"),
      "name: custom\non: push\njobs: {}\n"
    );
    const report = detectWorkflowDrift({ projectDir: dir });
    // Extra files DON'T count as drift; overall stays ok if all template-files are unchanged.
    expect(report.overall).toBe("ok");
    const extra = report.files.find((f) => f.name === "project-custom.yml")!;
    expect(extra.status).toBe("extra");
  });

  it("sort order: drifted -> missing -> extra -> unchanged", () => {
    const dir = mkProject();
    copyTemplate(dir, "pr.yml");
    // Edit pr.yml (drift)
    const prPath = path.join(dir, ".github", "workflows", "pr.yml");
    fs.writeFileSync(prPath, fs.readFileSync(prPath, "utf8") + "\n# edit\n");
    // merge.yml + cleanup-orphans.yml missing
    // Add an extra
    fs.writeFileSync(
      path.join(dir, ".github", "workflows", "extra.yml"),
      "name: x\n"
    );
    const report = detectWorkflowDrift({ projectDir: dir });
    const statuses = report.files.map((f) => f.status);
    // Sort priority: drifted -> missing -> extra -> unchanged
    expect(statuses[0]).toBe("drifted");
    // missing entries follow drifted (cleanup-orphans.yml + merge.yml)
    expect(statuses.slice(1, 3).every((s) => s === "missing")).toBe(true);
    // extra entry is last (no unchanged exist in this setup)
    expect(statuses[statuses.length - 1]).toBe("extra");
  });

  it("returns missing for everything when project has no .github/workflows dir", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-drift-bare-"));
    tmpDirs.push(dir);
    const report = detectWorkflowDrift({ projectDir: dir });
    expect(report.overall).toBe("drift");
    expect(report.files.every((f) => f.status === "missing")).toBe(true);
  });
});
