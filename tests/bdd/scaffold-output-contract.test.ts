import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Cheap regression net for scaffolded files whose CONTENT must satisfy a
// functional contract beyond "the file exists". Each test here pins one
// specific day-0 user defect (2026-06-04 inventory) so it cannot recur
// without the test going red. Companion to the live-test layer (which
// exercises the same contracts end-to-end against a real workspace).

const TEMPLATES = path.resolve(__dirname, "..", "..", "templates", "project");

function readTemplate(rel: string): string {
  return readFileSync(path.join(TEMPLATES, rel), "utf8");
}

describe("scaffold output contract: alembic env.py", () => {
  it("imports app.models so autogenerate sees the declarative metadata", () => {
    // Without this side-effect import, Base.metadata is empty when
    // alembic introspects the declarative registry, and
    // `alembic revision --autogenerate` produces an empty diff. Every
    // user hits this on their first migration.
    const env = readTemplate("python/alembic/env.py");
    expect(env).toMatch(/^import app\.models\b/m);
    // And the import must precede target_metadata so the registry is
    // populated by the time alembic reads it.
    const importIdx = env.search(/^import app\.models\b/m);
    const targetIdx = env.search(/^target_metadata\s*=/m);
    expect(importIdx).toBeGreaterThan(-1);
    expect(targetIdx).toBeGreaterThan(-1);
    expect(importIdx).toBeLessThan(targetIdx);
  });
});

describe("scaffold output contract: run-dev.sh", () => {
  it("serves the app locally for a human reviewer, language-aware, with hot-reload", () => {
    // Every scaffolded project ships a run-dev.sh so a human can open the
    // running app in a browser and review it (the missing local-serve seam).
    // It must source .env (branch DB creds the post-checkout hook wrote) and
    // branch on all three project shapes.
    const sh = readTemplate("common/scripts/run-dev.sh");
    expect(sh).toMatch(/source \.env/);
    // Python: uvicorn with --reload after migrating.
    expect(sh).toMatch(/uvicorn app\.main:app[^\n]*--reload/);
    expect(sh).toMatch(/alembic upgrade head/);
    // Node + Java shapes are handled too.
    expect(sh).toMatch(/npm run dev|npm start/);
    expect(sh).toMatch(/spring-boot:run/);
    // Prints a browser-friendly URL for the reviewer.
    expect(sh).toMatch(/http:\/\//);
  });

  it("does NOT shell out to substrate directly (parity with the other scaffolded shells)", () => {
    const sh = readTemplate("common/scripts/run-dev.sh");
    expect(sh).not.toMatch(/databricks\s+postgres/);
    expect(sh).not.toMatch(/projects\/[^/]*\/branches\//);
  });
});

describe("scaffold output contract: connect-main-branch.sh", () => {
  it("delegates to the kit's lakebase-branch sync-env CLI (no inline substrate logic)", () => {
    // scaffolded shells that previously duplicated substrate
    // logic now thin-wrap the kit's TS bins. connect-main-branch.sh
    // must invoke lakebase-branch sync-env --branch main; the leaf
    // resolution lives in the TS sync-env handler so the shell cannot
    // drift from the substrate. The bug class "UID where leaf is needed"
    // becomes structurally impossible because the shell no longer
    // constructs paths at all.
    const sh = readTemplate("common/scripts/connect-main-branch.sh");
    expect(sh).toMatch(/lakebase-branch[^\n]*sync-env[^\n]*--branch[^\n]*main/);
  });

  it("does NOT construct Lakebase API paths or shell out to `databricks postgres` directly", () => {
    const sh = readTemplate("common/scripts/connect-main-branch.sh");
    expect(sh).not.toMatch(/databricks\s+postgres/);
    expect(sh).not.toMatch(/projects\/[^/]*\/branches\//);
  });
});

describe("scaffold output contract: refresh-token.sh", () => {
  it("delegates to lakebase-branch sync-env (no inline credential mint)", () => {
    const sh = readTemplate("common/scripts/refresh-token.sh");
    expect(sh).toMatch(/lakebase-branch[^\n]*sync-env/);
  });

  it("does NOT shell out to `databricks postgres` directly", () => {
    const sh = readTemplate("common/scripts/refresh-token.sh");
    expect(sh).not.toMatch(/databricks\s+postgres/);
    expect(sh).not.toMatch(/generate-database-credential/);
  });
});
