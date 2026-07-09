import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { updateEnvConnection } from "../../scripts/lakebase/env-file.js";

function tmpEnvPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-envtest-"));
  return path.join(dir, ".env");
}

describe("updateEnvConnection (metadata-only, no token)", () => {
  let envPath: string;

  beforeEach(() => {
    envPath = tmpEnvPath();
  });

  it("creates a new .env with just the metadata block when none exists", () => {
    updateEnvConnection({
      envPath,
      projectId: "proj-abc",
      branchId: "feature-x",
      username: "user@example.com",
      endpointHost: "ep-x.database.example.com",
    });
    const content = fs.readFileSync(envPath, "utf-8");
    expect(content).toMatch(/^LAKEBASE_PROJECT_ID=proj-abc$/m);
    expect(content).toMatch(/^LAKEBASE_BRANCH_ID=feature-x$/m);
    expect(content).toMatch(/^LAKEBASE_HOST=ep-x\.database\.example\.com$/m);
    expect(content).toMatch(/^LAKEBASE_ENDPOINT=primary$/m);
    expect(content).toMatch(/^DB_USERNAME=user@example\.com$/m);
    // No token is ever written.
    expect(content).not.toMatch(/^DATABASE_URL=/m);
    expect(content).not.toMatch(/^DB_PASSWORD=/m);
  });

  it("preserves non-connection lines and PURGES a stale baked-in token", () => {
    fs.writeFileSync(
      envPath,
      [
        "# header",
        "DATABRICKS_HOST=https://example.databricks.com",
        "LAKEBASE_PROJECT_ID=old-proj",
        "LAKEBASE_BRANCH_ID=old-branch",
        "DATABASE_URL=postgresql://u:oldtok@h/db",
        "DB_USERNAME=old@example.com",
        "DB_PASSWORD=oldtok",
        "OTHER_VAR=keep-me",
        "",
      ].join("\n")
    );
    updateEnvConnection({
      envPath,
      projectId: "proj-abc",
      branchId: "new-branch",
      username: "new@example.com",
      endpointHost: "ep-new.database.example.com",
    });
    const content = fs.readFileSync(envPath, "utf-8");
    expect(content).toContain("DATABRICKS_HOST=https://example.databricks.com");
    expect(content).toContain("OTHER_VAR=keep-me");
    expect(content).toContain("LAKEBASE_PROJECT_ID=proj-abc");
    expect(content).toContain("LAKEBASE_BRANCH_ID=new-branch");
    // The legacy token lines are stripped, not rewritten.
    expect(content).not.toContain("old-branch");
    expect(content).not.toContain("oldtok");
    expect(content).not.toMatch(/^DATABASE_URL=/m);
    expect(content).not.toMatch(/^DB_PASSWORD=/m);
    expect(content).not.toContain("old-proj");
  });

  it("appends the metadata block exactly once (idempotent on repeated calls)", () => {
    fs.writeFileSync(envPath, "DATABRICKS_HOST=h\n");
    updateEnvConnection({ envPath, projectId: "p", branchId: "b", username: "a" });
    updateEnvConnection({ envPath, projectId: "p", branchId: "b", username: "a" });
    const content = fs.readFileSync(envPath, "utf-8");
    const occurrences = (content.match(/^LAKEBASE_BRANCH_ID=/gm) || []).length;
    expect(occurrences).toBe(1);
    expect((content.match(/^LAKEBASE_PROJECT_ID=/gm) || []).length).toBe(1);
  });

  it("honors a leading comment and a custom endpoint name", () => {
    updateEnvConnection({
      envPath,
      projectId: "proj-abc",
      branchId: "feature-y",
      username: "u@example.com",
      endpoint: "replica",
      comment: "# Connection metadata for branch feature-y",
    });
    const content = fs.readFileSync(envPath, "utf-8");
    expect(content).toContain("# Connection metadata for branch feature-y");
    expect(content).toMatch(/^LAKEBASE_ENDPOINT=replica$/m);
  });
});
