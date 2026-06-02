// FEIP-7423: content-sanity check for the pr.yml step that resolves
// the deployed CI app URL and exports LAKEBASE_APP_ENDPOINT.
//
// This is NOT an integration test; it asserts the wiring exists in the
// scaffolded pr.yml template so the downstream Playwright step (added
// in FEIP-7094 Phase 2) actually receives a BASE_URL when a CI app is
// deployed for the paired branch.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PR_YML = path.join(
  REPO_ROOT,
  "templates/project/common/.github/workflows/pr.yml",
);

describe("pr.yml: Resolve CI app endpoint (FEIP-7423)", () => {
  const yaml = fs.readFileSync(PR_YML, "utf8");

  it("declares a step named 'Resolve CI app endpoint'", () => {
    expect(yaml).toMatch(/- name:\s*Resolve CI app endpoint/);
  });

  it("invokes the kit's lakebase-ci-app-endpoint CLI", () => {
    expect(yaml).toContain("lakebase-ci-app-endpoint");
    expect(yaml).toMatch(/--instance\s+"\$LAKEBASE_PROJECT_ID"/);
    expect(yaml).toMatch(/--branch\s+"\$CI_BRANCH"/);
  });

  it("pins the kit version at scaffold time via the standard token", () => {
    // Matches the lakebase-detect-language + lakebase-schema-migrate
    // pattern: github:databricks-solutions/lakebase-app-dev-kit#v{{LAKEBASE_KIT_VERSION}}
    expect(yaml).toContain(
      "github:databricks-solutions/lakebase-app-dev-kit#v{{LAKEBASE_KIT_VERSION}}",
    );
  });

  it("exports LAKEBASE_APP_ENDPOINT to $GITHUB_ENV only when a URL was resolved", () => {
    // The step must (a) gate the export on a non-empty URL and
    // (b) write to $GITHUB_ENV (which is what the FEIP-7094 Phase 2
    // Playwright step reads via env.LAKEBASE_APP_ENDPOINT).
    expect(yaml).toMatch(/echo\s+"LAKEBASE_APP_ENDPOINT=\$URL"\s+>>\s+\$GITHUB_ENV/);
    expect(yaml).toMatch(/if\s+\[\s+-n\s+"\$URL"\s+\]/);
  });

  it("is gated on app-exists (Lakebase CI branch was created)", () => {
    // The step's `if:` must include the lakebase-db url presence guard.
    // Without it, the step would run even when secrets are missing and
    // the CI branch was never created.
    const stepBlock = yaml.match(
      /- name:\s*Resolve CI app endpoint[\s\S]*?(?=\n {6}- name:|\n {2}- name:|$)/,
    );
    expect(stepBlock).not.toBeNull();
    const body = stepBlock![0];
    expect(body).toMatch(/steps\.lakebase-db\.outputs\.url\s*!=\s*''/);
  });

  it("is gated on a project-root playwright config existing", () => {
    const stepBlock = yaml.match(
      /- name:\s*Resolve CI app endpoint[\s\S]*?(?=\n {6}- name:|\n {2}- name:|$)/,
    );
    expect(stepBlock).not.toBeNull();
    expect(stepBlock![0]).toMatch(/hashFiles\('playwright\.config\.ts'/);
  });

  it("runs before the project-root Playwright steps (order matters for $GITHUB_ENV)", () => {
    // $GITHUB_ENV writes don't take effect until the NEXT step. The
    // resolve step must therefore precede 'Run E2E tests (Playwright,
    // project root)' so its export is visible to the env: block.
    const resolveIdx = yaml.indexOf("- name: Resolve CI app endpoint");
    const runIdx = yaml.indexOf(
      "- name: Run E2E tests (Playwright, project root)",
    );
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(runIdx).toBeGreaterThan(-1);
    expect(resolveIdx).toBeLessThan(runIdx);
  });
});

describe("playwright.config.ts (project-root template): conditional webServer (FEIP-7423)", () => {
  const TEMPLATE = path.join(
    REPO_ROOT,
    "templates/project/common/playwright.config.ts",
  );
  const text = fs.readFileSync(TEMPLATE, "utf8");

  it("skips webServer when BASE_URL is set from env", () => {
    // Two acceptable shapes: ternary `process.env.BASE_URL ? undefined : {...}`
    // or a derived const flag (e.g. `externalBaseUrl`). Both must produce
    // `webServer: undefined` when env BASE_URL is set.
    const ternary = /webServer:\s*[A-Za-z_][\w]*\s*\?\s*undefined/;
    const directTernary = /webServer:\s*process\.env\.BASE_URL\s*\?\s*undefined/;
    expect(ternary.test(text) || directTernary.test(text)).toBe(true);
  });

  it("retains a non-undefined webServer branch for local dev", () => {
    // The other side of the ternary must be a server config object
    // (with at least `command` and `url`), so local-dev runs that don't
    // export BASE_URL still get a server booted by Playwright.
    expect(text).toMatch(/command:\s*["'`]/);
    expect(text).toMatch(/url:\s*baseURL/);
  });
});
