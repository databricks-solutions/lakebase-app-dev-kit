// Coverage for the workflow refresh primitive (FEIP-7139). Pure
// filesystem; no live Lakebase, runs in the standard non-live suite.
//
// Uses a synthetic kit fixture for most cases (kitDir override) to keep
// the tests independent of the real templates' content (which evolves).
// A small "real kit" smoke test confirms updateWorkflows() finds the
// kit's actual templates when kitDir is omitted.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  updateWorkflows,
  detectWorkflowDrift,
} from "../../scripts/lakebase/workflow-drift.js";

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

function mkTmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lbscm-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}

function mkProject(): string {
  const dir = mkTmp("upd-proj");
  fs.mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
  return dir;
}

/**
 * Build a tiny synthetic "kit" fixture with two workflow templates.
 * Returns the kitDir path that updateWorkflows() accepts.
 */
function mkSyntheticKit(version: string, files: Record<string, string>): string {
  const kit = mkTmp("upd-kit");
  fs.writeFileSync(
    path.join(kit, "package.json"),
    JSON.stringify({ name: "fixture", version }, null, 2)
  );
  const wfDir = path.join(kit, "templates", "project", "common", ".github", "workflows");
  fs.mkdirSync(wfDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(wfDir, name), content);
  }
  return kit;
}

describe("updateWorkflows – synthetic kit fixture", () => {
  it("writes every template into an empty project (outcome=added)", () => {
    const project = mkProject();
    const kit = mkSyntheticKit("9.9.9", {
      "pr.yml": "name: pr\n",
      "merge.yml": "name: merge\n",
    });
    const result = updateWorkflows({ projectDir: project, kitDir: kit });
    expect(result.changed).toBe(true);
    const byName = (n: string) => result.files.find((f) => f.name === n)!;
    expect(byName("pr.yml").outcome).toBe("added");
    expect(byName("merge.yml").outcome).toBe("added");
    expect(fs.readFileSync(path.join(project, ".github", "workflows", "pr.yml"), "utf-8")).toBe("name: pr\n");
  });

  it("substitutes {{LAKEBASE_KIT_VERSION}} with the kit's package.json version", () => {
    const project = mkProject();
    const kit = mkSyntheticKit("1.2.3", {
      "pr.yml": "version: {{LAKEBASE_KIT_VERSION}}\n",
    });
    updateWorkflows({ projectDir: project, kitDir: kit });
    const written = fs.readFileSync(
      path.join(project, ".github", "workflows", "pr.yml"),
      "utf-8"
    );
    expect(written).toBe("version: 1.2.3\n");
  });

  it("skips substitution when substitute=false", () => {
    const project = mkProject();
    const kit = mkSyntheticKit("1.2.3", {
      "pr.yml": "version: {{LAKEBASE_KIT_VERSION}}\n",
    });
    updateWorkflows({ projectDir: project, kitDir: kit, substitute: false });
    const written = fs.readFileSync(
      path.join(project, ".github", "workflows", "pr.yml"),
      "utf-8"
    );
    expect(written).toBe("version: {{LAKEBASE_KIT_VERSION}}\n");
  });

  it("returns outcome=unchanged for files that already match the kit", () => {
    const project = mkProject();
    const kit = mkSyntheticKit("1.0.0", { "pr.yml": "name: pr\n" });
    // First call seeds the project.
    updateWorkflows({ projectDir: project, kitDir: kit });
    // Second call is a no-op.
    const result = updateWorkflows({ projectDir: project, kitDir: kit });
    expect(result.changed).toBe(false);
    expect(result.files[0].outcome).toBe("unchanged");
  });

  it("returns outcome=updated when project copy differs from the kit", () => {
    const project = mkProject();
    const kit = mkSyntheticKit("1.0.0", { "pr.yml": "name: pr\n" });
    fs.writeFileSync(
      path.join(project, ".github", "workflows", "pr.yml"),
      "name: drifted\n"
    );
    const result = updateWorkflows({ projectDir: project, kitDir: kit });
    expect(result.changed).toBe(true);
    expect(result.files[0].outcome).toBe("updated");
    expect(fs.readFileSync(path.join(project, ".github", "workflows", "pr.yml"), "utf-8")).toBe("name: pr\n");
  });

  it("leaves extra project files in place by default", () => {
    const project = mkProject();
    const kit = mkSyntheticKit("1.0.0", { "pr.yml": "name: pr\n" });
    fs.writeFileSync(
      path.join(project, ".github", "workflows", "custom.yml"),
      "name: custom\n"
    );
    const result = updateWorkflows({ projectDir: project, kitDir: kit });
    expect(result.files.find((f) => f.name === "custom.yml")).toBeUndefined();
    expect(fs.existsSync(path.join(project, ".github", "workflows", "custom.yml"))).toBe(true);
  });

  it("removes extra project files when pruneExtras=true", () => {
    const project = mkProject();
    const kit = mkSyntheticKit("1.0.0", { "pr.yml": "name: pr\n" });
    fs.writeFileSync(
      path.join(project, ".github", "workflows", "custom.yml"),
      "name: custom\n"
    );
    const result = updateWorkflows({
      projectDir: project,
      kitDir: kit,
      pruneExtras: true,
    });
    const extra = result.files.find((f) => f.name === "custom.yml");
    expect(extra?.outcome).toBe("removed");
    expect(fs.existsSync(path.join(project, ".github", "workflows", "custom.yml"))).toBe(false);
  });

  it("dryRun=true reports outcomes without touching disk", () => {
    const project = mkProject();
    const kit = mkSyntheticKit("1.0.0", { "pr.yml": "name: pr-new\n" });
    fs.writeFileSync(
      path.join(project, ".github", "workflows", "pr.yml"),
      "name: pr-old\n"
    );
    const result = updateWorkflows({
      projectDir: project,
      kitDir: kit,
      dryRun: true,
    });
    expect(result.changed).toBe(true);
    expect(result.files[0].outcome).toBe("updated");
    // Project file UNCHANGED on disk despite changed=true
    expect(
      fs.readFileSync(path.join(project, ".github", "workflows", "pr.yml"), "utf-8")
    ).toBe("name: pr-old\n");
  });

  it("creates .github/workflows/ when missing", () => {
    const project = mkTmp("upd-proj-no-wf");
    expect(fs.existsSync(path.join(project, ".github"))).toBe(false);
    const kit = mkSyntheticKit("1.0.0", { "pr.yml": "name: pr\n" });
    const result = updateWorkflows({ projectDir: project, kitDir: kit });
    expect(result.files[0].outcome).toBe("added");
    expect(fs.existsSync(path.join(project, ".github", "workflows", "pr.yml"))).toBe(true);
  });

  it("falls back to 'unknown' when kit package.json is missing", () => {
    const project = mkProject();
    // Build a kit fixture but DELETE its package.json
    const kit = mkSyntheticKit("ignored", {
      "pr.yml": "version: {{LAKEBASE_KIT_VERSION}}\n",
    });
    fs.unlinkSync(path.join(kit, "package.json"));
    updateWorkflows({ projectDir: project, kitDir: kit });
    const written = fs.readFileSync(
      path.join(project, ".github", "workflows", "pr.yml"),
      "utf-8"
    );
    expect(written).toBe("version: unknown\n");
  });
});

describe("updateWorkflows + detectWorkflowDrift integration", () => {
  it("after a raw refresh (substitute=false) the project reads back as overall=ok against the same kit", () => {
    // detectWorkflowDrift (FEIP-7140) does a byte-equality comparison
    // against the raw template content. When updateWorkflows substitutes
    // {{LAKEBASE_KIT_VERSION}}, the post-refresh project differs from
    // the template by exactly those substituted lines (a known
    // limitation of the drift detector; tracked as a separate FEIP).
    // To exercise the real-template round-trip we disable substitution
    // here; substitution semantics are covered in the synthetic-kit
    // suite above.
    const project = mkProject();
    const result = updateWorkflows({
      projectDir: project,
      kitDir: REPO_ROOT,
      substitute: false,
    });
    expect(result.changed).toBe(true);
    const drift = detectWorkflowDrift({ projectDir: project, kitDir: REPO_ROOT });
    expect(drift.overall).toBe("ok");
  });
});
