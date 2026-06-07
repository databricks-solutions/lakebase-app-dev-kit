// FEIP-7510: the kit is a Claude Code plugin. /lakebase-app-dev-kit:tdd launches
// the TDD workflow; the role agents ship as plugin agents. Hermetic JSON/file checks.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_AGENT_ROLES } from "../../scripts/tdd/agent-models";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..");

function readJson(rel: string): any {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"));
}

describe("plugin manifest (.claude-plugin/plugin.json)", () => {
  const manifest = readJson(".claude-plugin/plugin.json");

  it("keeps the broad kit name (not rebranded to TDD)", () => {
    expect(manifest.name).toBe("lakebase-app-dev-kit");
  });

  it("exposes skills and the role agents", () => {
    expect(manifest.skills).toBe("./skills/");
    expect(manifest.agents).toBe("skills/lakebase-tdd-workflows/agents");
    const agentsDir = path.join(REPO_ROOT, manifest.agents);
    expect(fs.existsSync(agentsDir)).toBe(true);
    // The agents path resolves to exactly the AgentRole defs.
    const onDisk = fs
      .readdirSync(agentsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
    expect(onDisk).toEqual([...ALL_AGENT_ROLES].sort());
  });
});

describe("marketplace catalog (.claude-plugin/marketplace.json)", () => {
  const market = readJson(".claude-plugin/marketplace.json");

  it("lists the kit plugin from this repo", () => {
    expect(Array.isArray(market.plugins)).toBe(true);
    const entry = market.plugins.find((p: any) => p.name === "lakebase-app-dev-kit");
    expect(entry, "marketplace should list lakebase-app-dev-kit").toBeTruthy();
    expect(entry.source).toBe(".");
  });
});

describe("/lakebase-app-dev-kit:tdd launcher command (commands/tdd.md)", () => {
  const tdd = fs.readFileSync(path.join(REPO_ROOT, "commands", "tdd.md"), "utf8");

  it("has a frontmatter description", () => {
    expect(tdd).toMatch(/^---\n[\s\S]*?\bdescription:/);
  });

  it("branches on .tdd/: resume an existing project, or guide creation", () => {
    expect(tdd).toMatch(/\.tdd\//);
    expect(tdd).toMatch(/lakebase-create-project/); // create path
    expect(tdd).toMatch(/\/plan\b/); // resume path drives the loop
    expect(tdd).toMatch(/\/deploy\b/);
  });

  it("delegates to the role agents under the kit namespace, coordinates only", () => {
    expect(tdd).toMatch(/lakebase-app-dev-kit:scrum-master/);
    expect(tdd).toMatch(/lakebase-app-dev-kit:<role>/); // documents the role namespace
    expect(tdd).toMatch(/coordinate only/i);
    for (const role of ["product-owner", "spec-author", "release-engineer"]) {
      expect(tdd, `role ${role} should be named`).toContain(role);
    }
  });
});
