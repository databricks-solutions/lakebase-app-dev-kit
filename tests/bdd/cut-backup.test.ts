import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { cutBackup } from "../../scripts/lakebase/cut-backup.js";
import { deleteBranch } from "../../scripts/lakebase/branch-delete.js";

// cutBackup wraps createBranch with an opinionated intent. Live test
// gated on LAKEBASE_TEST_INSTANCE + LAKEBASE_TEST_PARENT mirrors the
// branch-create + delete test pattern: snapshot the parent branch,
// assert shape, delete.

const cliAvailable = (() => {
  try {
    execFileSync("databricks", ["--version"], { stdio: "ignore", timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
})();

const TEST_INSTANCE = process.env.LAKEBASE_TEST_INSTANCE;
const TEST_PARENT = process.env.LAKEBASE_TEST_PARENT;
const live = cliAvailable && !!TEST_INSTANCE && !!TEST_PARENT;

describe.skipIf(!live)("cutBackup - destructive live test", () => {
  it("snapshots the parent branch, returns backup with correct lineage, deletes cleanly", async () => {
    const backupName = `lbscm-cutbackup-${Date.now()}`;
    const result = await cutBackup({
      instance: TEST_INSTANCE!,
      sourceBranch: TEST_PARENT!,
      backupName,
      readyTimeoutMs: 180_000,
    });

    expect(result.backup.state).toBe("READY");
    expect(result.backup.uid).toBeTruthy();
    expect(result.backup.name).toMatch(/^projects\/.*\/branches\//);
    // Backup lineage echoes the requested source.
    expect(result.sourceBranchName).toContain(`/branches/${TEST_PARENT}`);
    // And matches the underlying branch's sourceBranchName field.
    expect(result.sourceBranchName).toBe(result.backup.sourceBranchName ?? "");

    await deleteBranch({ instance: TEST_INSTANCE!, branch: result.backup.uid });
  }, 240_000);
});

describe("cutBackup - shape", () => {
  it("exports a function with the documented signature", () => {
    expect(typeof cutBackup).toBe("function");
  });
});

describe("cutBackup - skip-when-env-missing", () => {
  it("documents the skip reason when LAKEBASE_TEST_INSTANCE/PARENT or CLI missing", () => {
    if (live) return;
    // eslint-disable-next-line no-console
    console.log(
      !cliAvailable
        ? "`databricks` CLI not available - live cutBackup suite skipped."
        : "LAKEBASE_TEST_INSTANCE/LAKEBASE_TEST_PARENT not set - live destructive suite skipped."
    );
    expect(live).toBe(false);
  });
});
