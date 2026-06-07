// FEIP-7510: the role agent definitions are scaffolded into the project's
// .claude/agents/ so Claude Code can discover + spawn them (the deterministic
// driver spawns them; there is no scrum-master agent). Hermetic: real kit
// skills tree + tmpdir; no shell-outs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { deployClaudeAgents, scaffoldStaticAll } from "../../scripts/lakebase/scaffold";
import { ALL_AGENT_ROLES } from "../../scripts/tdd/agent-models";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..");
const REPO_TEMPLATES = path.join(REPO_ROOT, "templates", "project");

function mkTemp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `feip7510-${prefix}-`));
}
function rmTemp(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe("deployClaudeAgents", () => {
  let targetDir: string;
  beforeEach(() => {
    targetDir = mkTemp("agents");
  });
  afterEach(() => rmTemp(targetDir));

  it("writes one <role>.md under .claude/agents/ for every AgentRole", async () => {
    const result = await deployClaudeAgents(targetDir, { templatesDir: REPO_TEMPLATES });
    const expected = ALL_AGENT_ROLES.map((r) => path.join(".claude", "agents", `${r}.md`)).sort();
    expect(result.written.sort()).toEqual(expected);
    expect(result.skipped).toEqual([]);
    for (const role of ALL_AGENT_ROLES) {
      expect(fs.existsSync(path.join(targetDir, ".claude", "agents", `${role}.md`))).toBe(true);
    }
  });

  it("does NOT scaffold a scrum-master agent (the orchestrator is the deterministic driver)", async () => {
    await deployClaudeAgents(targetDir, { templatesDir: REPO_TEMPLATES });
    expect(fs.existsSync(path.join(targetDir, ".claude", "agents", "scrum-master.md"))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, ".claude", "agents", "orchestrator.md"))).toBe(false);
    // Only the spawnable role agents are scaffolded.
    const entries = fs.readdirSync(path.join(targetDir, ".claude", "agents")).filter((f) => f.endsWith(".md"));
    expect(entries.sort()).toEqual(ALL_AGENT_ROLES.map((r) => `${r}.md`).sort());
  });

  it("skips existing agent files by default and reports them in skipped", async () => {
    fs.mkdirSync(path.join(targetDir, ".claude", "agents"), { recursive: true });
    fs.writeFileSync(path.join(targetDir, ".claude", "agents", "driver.md"), "# custom driver\n");
    const result = await deployClaudeAgents(targetDir, { templatesDir: REPO_TEMPLATES });
    expect(result.skipped).toContain(path.join(".claude", "agents", "driver.md"));
    expect(result.written).not.toContain(path.join(".claude", "agents", "driver.md"));
    expect(fs.readFileSync(path.join(targetDir, ".claude", "agents", "driver.md"), "utf8")).toBe(
      "# custom driver\n"
    );
  });

  it("overwrites with force=true", async () => {
    fs.mkdirSync(path.join(targetDir, ".claude", "agents"), { recursive: true });
    fs.writeFileSync(path.join(targetDir, ".claude", "agents", "driver.md"), "stale\n");
    const result = await deployClaudeAgents(targetDir, { templatesDir: REPO_TEMPLATES, force: true });
    expect(result.written).toContain(path.join(".claude", "agents", "driver.md"));
    expect(fs.readFileSync(path.join(targetDir, ".claude", "agents", "driver.md"), "utf8")).not.toBe("stale\n");
  });
});

describe("scaffoldStaticAll integration: claudeAgents", () => {
  let targetDir: string;
  beforeEach(() => {
    targetDir = mkTemp("static");
    execSync("git init --quiet", { cwd: targetDir, stdio: "pipe" });
  });
  afterEach(() => rmTemp(targetDir));

  it("scaffolds .claude/agents by default and reports them in claudeAgents", async () => {
    const result = await scaffoldStaticAll({
      targetDir,
      templatesDir: REPO_TEMPLATES,
      language: "nodejs",
    });
    expect(result.claudeAgents.sort()).toEqual(
      ALL_AGENT_ROLES.map((r) => path.join(".claude", "agents", `${r}.md`)).sort()
    );
  });

  it("skipCommands=true also skips the agents scaffold", async () => {
    const result = await scaffoldStaticAll({
      targetDir,
      templatesDir: REPO_TEMPLATES,
      language: "nodejs",
      skipCommands: true,
    });
    expect(result.claudeAgents).toEqual([]);
    expect(fs.existsSync(path.join(targetDir, ".claude", "agents"))).toBe(false);
  });
});
