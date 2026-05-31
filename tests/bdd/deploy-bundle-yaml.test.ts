import { describe, it, expect } from "vitest";
import { generateBundleYaml } from "../../scripts/lakebase/deploy-bundle-yaml";
import { DeployTarget } from "../../scripts/lakebase/deploy-targets";

const MINIMAL_TARGET: DeployTarget = {
  workspace_profile: "myprofile",
  workspace_path: "/Workspace/Users/me/myapp",
  app_name: "my-app",
  lakebase_project: "proj-123",
  lakebase_branch: "feature-x",
};

describe("generateBundleYaml: bundle block", () => {
  it("uses bundle name = app_name by default", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app");
    expect(yaml).toMatch(/^bundle:\n {2}name: my-app/);
  });

  it("uses caller-supplied bundleName when provided", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app", { bundleName: "custom-bundle" });
    expect(yaml).toMatch(/^bundle:\n {2}name: custom-bundle/);
  });
});

describe("generateBundleYaml: app resource declaration", () => {
  it("declares the app under `resources.apps.app` (canonical key)", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app");
    expect(yaml).toMatch(/^resources:\n {2}apps:\n {4}app:/m);
  });

  it("sets the app name from the appName arg", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app");
    expect(yaml).toContain("      name: my-app\n");
  });

  it("sets source_code_path to ./", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app");
    expect(yaml).toContain("      source_code_path: ./\n");
  });
});

describe("generateBundleYaml: postgres resource", () => {
  it("declares the postgres database resource", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app");
    expect(yaml).toContain("        - name: postgres\n");
    expect(yaml).toContain("          database:\n");
  });

  it("sets instance_name to the Lakebase project (canonical bundle schema)", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app");
    expect(yaml).toContain("            instance_name: proj-123\n");
  });

  it("sets database_name to DEFAULT_DATABASE (databricks_postgres)", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app");
    expect(yaml).toContain("            database_name: databricks_postgres\n");
  });

  it("declares permission: CAN_CONNECT_AND_CREATE (devhub-canonical default)", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app");
    expect(yaml).toContain("            permission: CAN_CONNECT_AND_CREATE\n");
  });

  it("does NOT declare a `branch:` field (branch is referenced via app.yaml env, not bundle)", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app");
    expect(yaml).not.toMatch(/^\s+branch:/m);
  });
});

describe("generateBundleYaml: targets block", () => {
  it("declares the `default` target as the default", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app");
    expect(yaml).toMatch(/targets:\n {2}default:\n {4}default: true/);
  });

  it("supports a custom target name", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app", { bundleTargetName: "staging" });
    expect(yaml).toMatch(/targets:\n {2}staging:\n {4}default: true/);
  });
});

describe("generateBundleYaml: file shape", () => {
  it("ends with a single trailing newline", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app");
    expect(yaml.endsWith("\n")).toBe(true);
    expect(yaml.endsWith("\n\n")).toBe(false);
  });

  it("orders blocks: bundle, resources, targets", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app");
    const bundleIdx = yaml.indexOf("bundle:");
    const resourcesIdx = yaml.indexOf("resources:");
    const targetsIdx = yaml.indexOf("targets:");
    expect(bundleIdx).toBeGreaterThanOrEqual(0);
    expect(resourcesIdx).toBeGreaterThan(bundleIdx);
    expect(targetsIdx).toBeGreaterThan(resourcesIdx);
  });
});

describe("generateBundleYaml: value escaping", () => {
  it("quotes app name with whitespace or special chars", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my app with spaces");
    expect(yaml).toContain(`      name: "my app with spaces"\n`);
  });

  it("quotes bundle name with whitespace or special chars", () => {
    const yaml = generateBundleYaml(MINIMAL_TARGET, "my-app", {
      bundleName: "bundle with spaces",
    });
    expect(yaml).toContain(`  name: "bundle with spaces"\n`);
  });
});
