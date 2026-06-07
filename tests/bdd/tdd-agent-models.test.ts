// FEIP-7510: per-role model selection. Hermetic (tmpdir + in-memory); no live Lakebase.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  RECOMMENDED_MODELS,
  ALL_AGENT_ROLES,
  buildAgentConfig,
  readAgentConfig,
  writeAgentConfig,
  resolveModelForRole,
  AGENT_CONFIG_REL,
} from "../../scripts/tdd/agent-models";
import { getValidator } from "../../scripts/tdd/schema-loader";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) fs.rmSync(d, { recursive: true, force: true });
  }
});
function mkProject(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "feip7510-"));
  tmpDirs.push(d);
  return d;
}

describe("RECOMMENDED_MODELS", () => {
  it("covers every agent role exactly once", () => {
    expect(new Set(ALL_AGENT_ROLES).size).toBe(ALL_AGENT_ROLES.length);
    expect(ALL_AGENT_ROLES.length).toBe(Object.keys(RECOMMENDED_MODELS).length);
  });

  it("recommends inherit for the scrum-master (the main session, never spawned)", () => {
    expect(RECOMMENDED_MODELS["scrum-master"]).toBe("inherit");
  });
});

describe("buildAgentConfig", () => {
  it("seeds every role with its recommended model and no override by default", () => {
    const cfg = buildAgentConfig();
    expect(cfg.version).toBe(1);
    for (const role of ALL_AGENT_ROLES) {
      expect(cfg.roles[role].recommended).toBe(RECOMMENDED_MODELS[role]);
      expect(cfg.roles[role].override).toBeUndefined();
    }
  });

  it("records an override only when it differs from the recommended", () => {
    const cfg = buildAgentConfig({ driver: "haiku", "spec-author": RECOMMENDED_MODELS["spec-author"] });
    expect(cfg.roles.driver.override).toBe("haiku");
    // spec-author override equals its recommended -> treated as no override.
    expect(cfg.roles["spec-author"].override).toBeUndefined();
  });

  it("produces a config that validates against agent-config.schema.json", () => {
    const validate = getValidator("agent-models.schema.json");
    const cfg = buildAgentConfig({ "release-engineer": "opus" });
    expect(validate(cfg)).toBe(true);
  });
});

describe("write/read roundtrip", () => {
  it("writes .lakebase/agent-config.json and reads it back", () => {
    const dir = mkProject();
    const cfg = buildAgentConfig({ driver: "haiku" });
    writeAgentConfig(dir, cfg);
    expect(fs.existsSync(path.join(dir, AGENT_CONFIG_REL))).toBe(true);
    expect(readAgentConfig(dir)).toEqual(cfg);
  });

  it("readAgentConfig returns undefined when absent", () => {
    expect(readAgentConfig(mkProject())).toBeUndefined();
  });
});

describe("resolveModelForRole", () => {
  it("prefers the override, then the recommended", () => {
    const dir = mkProject();
    writeAgentConfig(dir, buildAgentConfig({ driver: "haiku" }));
    expect(resolveModelForRole("driver", dir)).toBe("haiku"); // override
    expect(resolveModelForRole("spec-author", dir)).toBe(RECOMMENDED_MODELS["spec-author"]); // recommended
  });

  it("falls back to the built-in recommendation when no config is present", () => {
    const dir = mkProject();
    expect(resolveModelForRole("architect-reviewer", dir)).toBe(RECOMMENDED_MODELS["architect-reviewer"]);
    expect(resolveModelForRole("scrum-master", dir)).toBe("inherit");
  });
});
