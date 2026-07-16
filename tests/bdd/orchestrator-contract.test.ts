// FEIP-8021: the kit governs the ROLE agents (agent-operating-rules.md) but had
// no operating contract for the agent DRIVING /sprint /design /build /deploy, so
// its default was to narrate + ask at every step. This pins the contract doc's
// existence + core rules and that every orchestrator command template loads it
// (the same wiring the role prompts use for agent-operating-rules.md).

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");
const CONTRACT = join(
  REPO_ROOT,
  "skills",
  "lakebase-sftdd-workflows",
  "references",
  "orchestrator-contract.md",
);
const COMMANDS_DIR = join(REPO_ROOT, "templates", "project", "common", ".claude", "commands");
// The orchestrating commands (NOT /plan or /spike: /plan is a single planning
// activity, /spike is throwaway exploration outside the loop).
const ORCHESTRATOR_COMMANDS = ["sprint.md", "design.md", "build.md", "deploy.md"];

describe("orchestrator operating contract (FEIP-8021)", () => {
  it("the contract doc exists and states its core rules", () => {
    expect(existsSync(CONTRACT)).toBe(true);
    const body = readFileSync(CONTRACT, "utf8");
    // Drive to completion via next; stop only for HITL/blockers.
    expect(body).toMatch(/lakebase-sftdd-next/);
    expect(body).toMatch(/primary_action/);
    expect(body).toMatch(/HITL|gate|blocker/i);
    // Report outcomes, not process.
    expect(body).toMatch(/outcomes/i);
    // Verbose/eval mode is opt-in, off by default.
    expect(body).toMatch(/LAKEBASE_SFTDD_VERBOSE/);
    expect(body).toMatch(/opt-in|off by default/i);
  });

  it("every orchestrator command template loads the contract", () => {
    for (const cmd of ORCHESTRATOR_COMMANDS) {
      const body = readFileSync(join(COMMANDS_DIR, cmd), "utf8");
      expect(
        body,
        `${cmd}: missing orchestrator-contract citation`,
      ).toMatch(/references\/orchestrator-contract\.md/);
      // and names the drive-not-narrate default so the wiring is not a dead link
      expect(body, `${cmd}: missing drive-not-narrate rule`).toMatch(/lakebase-sftdd-next/);
    }
  });
});
