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

describe("scaffold output contract: connect-main-branch.sh", () => {
  it("resolves the Lakebase default branch via leaf (.name | split | last), not UID", () => {
    // The Lakebase API expects the branch LEAF (e.g. "production") in
    // path-shaped fields, not the opaque UID (e.g. "br-..."). Using the
    // UID produces "could not get endpoint host" 404s + duplicate
    // endpoint creation attempts. The fix mirrors the TS substrate's
    // resolveBranchId (scripts/lakebase/branch-utils.ts).
    const sh = readTemplate("common/scripts/connect-main-branch.sh");
    // Must contain the leaf-extraction pattern.
    expect(sh).toMatch(/\.name\s*\|\s*split\(["']\/["']\)\s*\|\s*last/);
    // And the resolved value must NOT carry a UID-suggesting suffix.
    expect(sh).not.toMatch(/\bDEFAULT_BRANCH_UID\b/);
  });

  it("constructs branch paths using the resolved leaf variable", () => {
    const sh = readTemplate("common/scripts/connect-main-branch.sh");
    // The variable holding the resolved default branch is interpolated
    // into the path. After the fix it's *_LEAF; any other suffix is
    // suspect.
    expect(sh).toMatch(/branches\/\$\{?DEFAULT_BRANCH_LEAF\}?/);
  });
});
