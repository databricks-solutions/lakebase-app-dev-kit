import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { ensureLakebaseSecretAuth } from "../../scripts/lakebase/secret-auth";

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

describe("ensureLakebaseSecretAuth: infra-error contract", () => {
  it("rejects when CLI is missing entirely", async () => {
    const origPath = process.env.PATH;
    process.env.PATH = "/nonexistent-bin";
    try {
      await expect(
        ensureLakebaseSecretAuth({
          profile: "any",
          scopeName: "any",
          keyName: "any",
          timeoutMs: 5_000,
        })
      ).rejects.toThrow(/ENOENT|spawn|failed|not found/i);
    } finally {
      process.env.PATH = origPath;
    }
  }, 10_000);

  it.skipIf(!RUN_LIVE)("rejects when the profile is invalid", async () => {
    await expect(
      ensureLakebaseSecretAuth({
        profile: "kit-test-nonexistent-profile-1234567890",
        scopeName: `kit-test-scope-${Date.now()}`,
        keyName: "test-key",
        timeoutMs: 15_000,
      })
    ).rejects.toThrow();
  }, 30_000);
});

describe("ensureLakebaseSecretAuth: skip-when-env-missing", () => {
  it("documents the skip reason", () => {
    if (!CLI_AVAILABLE) {
      console.log("databricks CLI not on PATH; live secret-auth tests skipped.");
    } else if (!PROFILE) {
      console.log("LAKEBASE_TEST_PROFILE not set; live secret-auth tests skipped.");
    }
    expect(true).toBe(true);
  });
});
