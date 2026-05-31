import { describe, it, expect } from "vitest";
import { generateAppYaml } from "../../scripts/lakebase/deploy-app-yaml";
import { DeployTarget } from "../../scripts/lakebase/deploy-targets";

const MINIMAL_TARGET: DeployTarget = {
  workspace_profile: "myprofile",
  workspace_path: "/Workspace/Users/me/myapp",
  app_name: "my-app",
  lakebase_project: "proj-123",
  lakebase_branch: "feature-x",
};

describe("generateAppYaml: command block", () => {
  it("defaults to `npm run start` when no existing yaml and no override", () => {
    const yaml = generateAppYaml(MINIMAL_TARGET);
    expect(yaml).toMatch(/^command:\n {2}- npm\n {2}- run\n {2}- start\n/);
  });

  it("uses the override default command when supplied", () => {
    const yaml = generateAppYaml(MINIMAL_TARGET, {
      defaultCommand: ["python", "server.py"],
    });
    expect(yaml).toMatch(/^command:\n {2}- python\n {2}- server\.py\n/);
  });

  it("preserves a block-list command from existing yaml", () => {
    const existing = "command:\n  - python\n  - -m\n  - my_module\n\nenv:\n  - name: OLD\n    value: \"x\"\n";
    const yaml = generateAppYaml(MINIMAL_TARGET, { existing });
    expect(yaml).toMatch(/^command:\n {2}- python\n {2}- -m\n {2}- my_module\n/);
  });

  it("preserves a flow-list command from existing yaml", () => {
    const existing = "command: ['npm', 'run', 'dev']\n\nenv:\n";
    const yaml = generateAppYaml(MINIMAL_TARGET, { existing });
    expect(yaml).toMatch(/^command:\n {2}- npm\n {2}- run\n {2}- dev\n/);
  });

  it("falls back to default when existing yaml has no command", () => {
    const existing = "env:\n  - name: OLD\n    value: \"x\"\n";
    const yaml = generateAppYaml(MINIMAL_TARGET, { existing });
    expect(yaml).toMatch(/^command:\n {2}- npm\n {2}- run\n {2}- start\n/);
  });
});

describe("generateAppYaml: env block (Lakebase canonical shape)", () => {
  it("emits the 6 platform-injected env vars with valueFrom: postgres", () => {
    const yaml = generateAppYaml(MINIMAL_TARGET);
    for (const name of ["PGHOST", "PGDATABASE", "PGUSER", "PGPORT", "PGSSLMODE", "LAKEBASE_ENDPOINT"]) {
      expect(yaml).toContain(`- name: ${name}\n    valueFrom: postgres`);
    }
  });

  it("emits LAKEBASE_PROJECT_ID + LAKEBASE_BRANCH_ID as hardcoded values (kit-internal)", () => {
    const yaml = generateAppYaml(MINIMAL_TARGET);
    expect(yaml).toContain(`- name: LAKEBASE_PROJECT_ID\n    value: "proj-123"`);
    expect(yaml).toContain(`- name: LAKEBASE_BRANCH_ID\n    value: "feature-x"`);
  });

  it("does NOT emit any platform-injected env as hardcoded value", () => {
    const yaml = generateAppYaml(MINIMAL_TARGET);
    for (const name of ["PGHOST", "PGDATABASE", "PGUSER", "PGPORT", "PGSSLMODE", "LAKEBASE_ENDPOINT"]) {
      expect(yaml).not.toMatch(new RegExp(`- name: ${name}\n[ \\t]+value:`));
    }
  });
});

describe("generateAppYaml: optional UC + secret + ai env vars", () => {
  it("omits UC env vars when target has none set", () => {
    const yaml = generateAppYaml(MINIMAL_TARGET);
    expect(yaml).not.toContain("UC_CATALOG");
    expect(yaml).not.toContain("UC_SCHEMA");
    expect(yaml).not.toContain("UC_VOLUME");
  });

  it("emits UC env vars when target sets them", () => {
    const yaml = generateAppYaml({
      ...MINIMAL_TARGET,
      uc_catalog: "main",
      uc_schema: "myapp",
      uc_volume: "data",
    });
    expect(yaml).toContain(`- name: UC_CATALOG\n    value: "main"`);
    expect(yaml).toContain(`- name: UC_SCHEMA\n    value: "myapp"`);
    expect(yaml).toContain(`- name: UC_VOLUME\n    value: "data"`);
  });

  it("emits Lakebase secret env vars only when set", () => {
    const yaml = generateAppYaml({
      ...MINIMAL_TARGET,
      lakebase_secret_scope: "myscope",
      lakebase_secret_key: "pgpass",
    });
    expect(yaml).toContain(`- name: LAKEBASE_SECRET_SCOPE\n    value: "myscope"`);
    expect(yaml).toContain(`- name: LAKEBASE_SECRET_KEY\n    value: "pgpass"`);
  });

  it("emits AI_MODEL only when set", () => {
    expect(generateAppYaml(MINIMAL_TARGET)).not.toContain("AI_MODEL");
    expect(generateAppYaml({ ...MINIMAL_TARGET, ai_model: "claude-opus-4.7" })).toContain(
      `- name: AI_MODEL\n    value: "claude-opus-4.7"`,
    );
  });
});

describe("generateAppYaml: value escaping", () => {
  it("escapes embedded double quotes in hardcoded values", () => {
    const yaml = generateAppYaml({
      ...MINIMAL_TARGET,
      ai_model: 'a "fancy" model',
    });
    expect(yaml).toContain(`- name: AI_MODEL\n    value: "a \\"fancy\\" model"`);
  });

  it("escapes backslashes in hardcoded values", () => {
    const yaml = generateAppYaml({
      ...MINIMAL_TARGET,
      ai_model: "with\\backslash",
    });
    expect(yaml).toContain(`- name: AI_MODEL\n    value: "with\\\\backslash"`);
  });

  it("quotes command parts with whitespace; leaves bare tokens unquoted", () => {
    const yaml = generateAppYaml(MINIMAL_TARGET, {
      defaultCommand: ["bash", "-c", "echo hello world"],
    });
    // `bash` and `-c` are plain YAML scalars; `echo hello world` needs quoting
    // because of the embedded spaces.
    expect(yaml).toContain("  - bash\n");
    expect(yaml).toContain("  - -c\n");
    expect(yaml).toContain(`  - "echo hello world"\n`);
  });
});

describe("generateAppYaml: file shape", () => {
  it("ends with a single trailing newline", () => {
    const yaml = generateAppYaml(MINIMAL_TARGET);
    expect(yaml.endsWith("\n")).toBe(true);
    expect(yaml.endsWith("\n\n")).toBe(false);
  });

  it("places command block before env block", () => {
    const yaml = generateAppYaml(MINIMAL_TARGET);
    const commandIdx = yaml.indexOf("command:");
    const envIdx = yaml.indexOf("env:");
    expect(commandIdx).toBeGreaterThanOrEqual(0);
    expect(envIdx).toBeGreaterThan(commandIdx);
  });

  it("has a blank line separating command and env blocks", () => {
    const yaml = generateAppYaml(MINIMAL_TARGET);
    expect(yaml).toMatch(/\n\nenv:\n/);
  });
});
