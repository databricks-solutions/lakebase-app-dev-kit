import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  catalogExists,
  tryCreateCatalog,
  ensureSchemaAndVolume,
  grantUcCatalogPermission,
  catalogExplorerUrl,
} from "../../scripts/lakebase/uc-resources";

function hasCli(): boolean {
  try {
    execFileSync("databricks", ["--version"], { stdio: "ignore", timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

const CLI_AVAILABLE = hasCli();
const PROFILE = process.env.LAKEBASE_TEST_PROFILE;
const RUN_LIVE = CLI_AVAILABLE && !!PROFILE;

describe("catalogExplorerUrl: pure helper", () => {
  it("composes the URL with the host's trailing slashes stripped", () => {
    expect(catalogExplorerUrl("https://example.cloud.databricks.com")).toBe(
      "https://example.cloud.databricks.com/explore/data"
    );
    expect(catalogExplorerUrl("https://example.cloud.databricks.com/")).toBe(
      "https://example.cloud.databricks.com/explore/data"
    );
    expect(catalogExplorerUrl("https://example.cloud.databricks.com///")).toBe(
      "https://example.cloud.databricks.com/explore/data"
    );
  });
});

describe("catalogExists: error contract", () => {
  it("rejects when CLI is missing entirely", async () => {
    const origPath = process.env.PATH;
    process.env.PATH = "/nonexistent-bin";
    try {
      await expect(
        catalogExists({ profile: "any", catalog: "any", timeoutMs: 5_000 })
      ).rejects.toThrow(/ENOENT|spawn|failed|not found/i);
    } finally {
      process.env.PATH = origPath;
    }
  }, 10_000);

  it.skipIf(!RUN_LIVE)("returns false for a catalog that does not exist", async () => {
    const result = await catalogExists({
      profile: PROFILE!,
      catalog: `kit-test-nonexistent-${Date.now()}`,
      timeoutMs: 30_000,
    });
    expect(result).toBe(false);
  }, 60_000);
});

describe("tryCreateCatalog: error contract", () => {
  it("returns created=false (not a throw) on any failure", async () => {
    const origPath = process.env.PATH;
    process.env.PATH = "/nonexistent-bin";
    try {
      const result = await tryCreateCatalog({
        profile: "any",
        catalog: "kit-test-nonexistent",
        timeoutMs: 5_000,
      });
      expect(result.created).toBe(false);
      expect(result.error).toBeTruthy();
    } finally {
      process.env.PATH = origPath;
    }
  }, 10_000);
});

describe("ensureSchemaAndVolume: error contract", () => {
  it("rejects when CLI is missing entirely", async () => {
    const origPath = process.env.PATH;
    process.env.PATH = "/nonexistent-bin";
    try {
      await expect(
        ensureSchemaAndVolume({
          profile: "any",
          catalog: "any",
          schema: "any",
          volume: "any",
          timeoutMs: 5_000,
        })
      ).rejects.toThrow(/ENOENT|spawn|failed|not found/i);
    } finally {
      process.env.PATH = origPath;
    }
  }, 10_000);
});

describe("grantUcCatalogPermission: error contract", () => {
  it("rejects when CLI is missing entirely", async () => {
    const origPath = process.env.PATH;
    process.env.PATH = "/nonexistent-bin";
    try {
      await expect(
        grantUcCatalogPermission({
          profile: "any",
          catalog: "any",
          servicePrincipalName: "00000000-0000-0000-0000-000000000000",
          timeoutMs: 5_000,
        })
      ).rejects.toThrow(/ENOENT|spawn|failed|not found/i);
    } finally {
      process.env.PATH = origPath;
    }
  }, 10_000);

  it.skipIf(!RUN_LIVE)("rejects on a non-existent catalog", async () => {
    await expect(
      grantUcCatalogPermission({
        profile: PROFILE!,
        catalog: `kit-nonexistent-catalog-${Date.now()}`,
        servicePrincipalName: "00000000-0000-0000-0000-000000000000",
        timeoutMs: 30_000,
      })
    ).rejects.toThrow();
  }, 60_000);
});

describe("uc-resources: skip-when-env-missing", () => {
  it("documents the skip reason", () => {
    if (!CLI_AVAILABLE) {
      console.log("databricks CLI not on PATH; live UC tests skipped.");
    } else if (!PROFILE) {
      console.log("LAKEBASE_TEST_PROFILE not set; live UC tests skipped.");
    }
    expect(true).toBe(true);
  });
});
