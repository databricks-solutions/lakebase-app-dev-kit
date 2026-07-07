// The ephemeral verify must run against the SAME database the app is CONFIGURED
// to connect to (from its .env), not a silent `databricks_postgres` fallback.
// Otherwise an app misconfigured to a database the substrate never provisioned
// (e.g. a domain-named `stockflow` that no one CREATE DATABASE'd) passes verify
// against `databricks_postgres` while the shipped app cannot connect at all.
// These pin the .env db-name reader that closes that test-what-ships hole.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readAppDatabaseName } from "../../scripts/sftdd/deploy.js";

let dir: string;
const writeEnv = (contents: string) => fs.writeFileSync(path.join(dir, ".env"), contents);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-app-db-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("readAppDatabaseName", () => {
  it("reads the db name from the DATABASE_URL path segment", () => {
    writeEnv("LAKEBASE_PROJECT_ID=proj\nDATABASE_URL=postgresql://u:p@host:5432/stockflow?sslmode=require\n");
    expect(readAppDatabaseName(dir)).toBe("stockflow");
  });

  it("prefers the LAST non-commented DATABASE_URL (post-checkout appends fresh)", () => {
    writeEnv(
      [
        "# DATABASE_URL=",
        "DATABASE_URL=postgresql://u:p@old:5432/databricks_postgres?sslmode=require",
        "DATABASE_URL=postgresql://u:p@new:5432/stockflow?sslmode=require",
        "",
      ].join("\n"),
    );
    expect(readAppDatabaseName(dir)).toBe("stockflow");
  });

  it("normalizes a dialect-qualified scheme (postgresql+psycopg://)", () => {
    writeEnv("DATABASE_URL=postgresql+psycopg://u:p@host:5432/databricks_postgres?sslmode=require\n");
    expect(readAppDatabaseName(dir)).toBe("databricks_postgres");
  });

  it("falls back to DB_NAME when no DATABASE_URL is set", () => {
    writeEnv("DB_NAME=stockflow\n# DATABASE_URL=\n");
    expect(readAppDatabaseName(dir)).toBe("stockflow");
  });

  it("returns undefined when neither is set (caller uses the substrate default)", () => {
    writeEnv("LAKEBASE_PROJECT_ID=proj\n# DATABASE_URL=\n");
    expect(readAppDatabaseName(dir)).toBeUndefined();
  });

  it("returns undefined when there is no .env at all", () => {
    expect(readAppDatabaseName(dir)).toBeUndefined();
  });

  it("url-decodes an encoded db segment", () => {
    writeEnv("DATABASE_URL=postgresql://u:p@host:5432/my%20db?sslmode=require\n");
    expect(readAppDatabaseName(dir)).toBe("my db");
  });
});
