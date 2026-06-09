// FEIP-7510: the role agent definitions are real, separately-invokable
// subagents. This conformance test keeps them well-formed + in sync with the
// AgentRole enum and the RECOMMENDED_MODELS map. Pure filesystem; no live Lakebase.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { ALL_AGENT_ROLES, RECOMMENDED_MODELS } from "../../scripts/tdd/agent-models";

const AGENTS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "skills",
  "lakebase-tdd-workflows",
  "agents",
);

const VALID_MODELS = new Set(["opus", "sonnet", "haiku", "inherit"]);

interface ParsedDef {
  frontmatter: Record<string, string>;
  body: string;
}

/** Minimal frontmatter reader: the `---\n...\n---` block + the body after it.
 *  Captures single-line `key: value` and folded `key: >-` blocks (joined). */
function parseDef(content: string): ParsedDef {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: content };
  const [, fm, body] = m;
  const frontmatter: Record<string, string> = {};
  const lines = fm.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawVal] = kv;
    if (rawVal === ">-" || rawVal === ">" || rawVal === "|") {
      // Folded/literal block: gather indented continuation lines.
      const parts: string[] = [];
      for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) {
        parts.push(lines[j].trim());
        i = j;
      }
      frontmatter[key] = parts.join(" ");
    } else {
      frontmatter[key] = rawVal.trim();
    }
  }
  return { frontmatter, body };
}

function defPath(role: string): string {
  return path.join(AGENTS_DIR, `${role}.md`);
}

describe("agent definitions: role set", () => {
  it("has exactly one <role>.md per AgentRole and no extras", () => {
    const onDisk = fs
      .readdirSync(AGENTS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
    expect(onDisk).toEqual([...ALL_AGENT_ROLES].sort());
  });
});

describe("agent definitions: frontmatter conformance", () => {
  for (const role of ALL_AGENT_ROLES) {
    it(`${role}.md is a well-formed subagent definition`, () => {
      const content = fs.readFileSync(defPath(role), "utf8");
      const { frontmatter, body } = parseDef(content);

      // name matches the role (the filename is incidental; name is identity).
      expect(frontmatter.name, `${role}: missing name`).toBe(role);

      // description: present, non-empty, within the auto-delegation cap (1536).
      expect(frontmatter.description, `${role}: missing description`).toBeTruthy();
      expect(frontmatter.description.length).toBeGreaterThan(0);
      expect(
        frontmatter.description.length,
        `${role}: description exceeds the 1536-char auto-delegation cap`,
      ).toBeLessThanOrEqual(1536);

      // model: present + valid, and equal to the single-source recommendation.
      expect(VALID_MODELS.has(frontmatter.model), `${role}: model "${frontmatter.model}" invalid`).toBe(true);
      expect(
        frontmatter.model,
        `${role}: frontmatter model must match RECOMMENDED_MODELS (single source)`,
      ).toBe(RECOMMENDED_MODELS[role]);

      // body is the system prompt: non-empty + carries the relay header.
      expect(body.trim().length, `${role}: empty system prompt`).toBeGreaterThan(0);
      expect(body, `${role}: missing relay header`).toMatch(/##\s*Relay/i);

      // Every role carries the shared cross-cutting operating rules (FEIP-7566):
      // cites the canonical doc + the in-prompt no-filesystem-scan hard rule.
      expect(body, `${role}: missing operating-rules citation`).toMatch(/agent-operating-rules\.md/);
      expect(body, `${role}: missing the no-filesystem-scan rule`).toMatch(/filesystem-wide scan/i);
    });
  }
});
