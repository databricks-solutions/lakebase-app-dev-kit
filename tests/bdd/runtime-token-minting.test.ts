import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Anti-recurrence guard for the "apps mint the Lakebase token at runtime"
// invariant (FEIP , full rip-out of the static .env token). The failure this
// pins: a scaffolded app connected with a token baked into DATABASE_URL at
// checkout time, which expired ~1h later and broke a long-running app / a long
// capture's deploy-verify. The fix: .env holds only connection METADATA and
// every DB consumer mints a fresh short-lived credential at runtime. If any
// scaffolded writer starts persisting a token again, one of these goes red.

const TEMPLATES = path.resolve(__dirname, "..", "..", "templates", "project");

function read(rel: string): string {
  return readFileSync(path.join(TEMPLATES, rel), "utf8");
}

describe("runtime token minting: no static token in scaffolded config", () => {
  it(".env.example carries metadata + documents runtime minting, no token line", () => {
    const env = read("common/.env.example");
    expect(env).toMatch(/^# LAKEBASE_ENDPOINT=primary$/m);
    expect(env).toMatch(/mint/i);
    // No live (uncommented) token key.
    expect(env).not.toMatch(/^DB_PASSWORD=/m);
    expect(env).not.toMatch(/^SPRING_DATASOURCE_PASSWORD=/m);
  });

  it("post-checkout.sh writes metadata only (no DATABASE_URL/DB_PASSWORD, no spring password)", () => {
    const sh = read("common/scripts/post-checkout.sh");
    // The update_env writer emits metadata keys.
    expect(sh).toMatch(/echo "LAKEBASE_PROJECT_ID=/);
    expect(sh).toMatch(/echo "LAKEBASE_ENDPOINT=primary"/);
    expect(sh).toMatch(/echo "DB_USERNAME=/);
    // ...and never persists a token line into .env or the Spring properties.
    expect(sh).not.toMatch(/echo "DATABASE_URL=/);
    expect(sh).not.toMatch(/echo "DB_PASSWORD=/);
    expect(sh).not.toMatch(/spring\.datasource\.password=/);
  });

  it("connect-main-branch.sh + refresh-token.sh do not write a Spring password", () => {
    for (const rel of [
      "common/scripts/connect-main-branch.sh",
      "common/scripts/refresh-token.sh",
    ]) {
      expect(read(rel)).not.toMatch(/spring\.datasource\.password=/);
    }
  });

  it("python credential helper mints from metadata via the databricks CLI", () => {
    const cred = read("python/app/lakebase_credentials.py");
    expect(cred).toMatch(/generate-database-credential/);
    expect(cred).toMatch(/LAKEBASE_PROJECT_ID/);
    expect(cred).toMatch(/LAKEBASE_BRANCH_ID/);
  });

  it("python database.py injects a minted token per connection + honors explicit DATABASE_URL", () => {
    const db = read("python/app/database.py");
    expect(db).toMatch(/do_connect/);
    expect(db).toMatch(/mint_token/);
    expect(db).toMatch(/pool_recycle/);
    // The explicit-override escape hatch (CI/Docker/ephemeral-verify) stays.
    expect(db).toMatch(/getenv\("DATABASE_URL"\)/);
  });

  it("alembic online migrations mint via make_engine (token-free offline url)", () => {
    const env = read("python/alembic/env.py");
    expect(env).toMatch(/make_engine\(/);
    expect(env).toMatch(/resolved_url\(\)/);
  });

  it("node knexfile supplies pg's async password callback + honors explicit DATABASE_URL", () => {
    const knex = read("nodejs/knexfile.js");
    expect(knex).toMatch(/password:\s*async\s*\(\)\s*=>\s*mintToken\(\)/);
    expect(knex).toMatch(/process\.env\.DATABASE_URL/);
    const cred = read("nodejs/src/lakebase-credentials.js");
    expect(cred).toMatch(/generate-database-credential/);
    expect(cred).toMatch(/LAKEBASE_PROJECT_ID/);
  });

  it("flyway-migrate.sh mints a fresh credential via get-connection, reads no .env token", () => {
    const sh = read("common/scripts/flyway-migrate.sh");
    expect(sh).toMatch(/lakebase-get-connection/);
    // The Java branch must not resurrect a DB_PASSWORD read from .env.
    expect(sh).not.toMatch(/SPRING_DATASOURCE_PASSWORD="\$\{DB_PASSWORD/);
  });
});
