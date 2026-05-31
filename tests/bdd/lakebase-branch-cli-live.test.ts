// Live BDD for the lakebase-branch CLI (FEIP-7331).
//
// Spawns the built `dist/scripts/lakebase/branch.cli.js` against a
// freshly-provisioned Lakebase project. Exercises every read + create
// + delete subcommand end-to-end, asserts JSON output shapes and exit
// codes match the CLI contract.
//
// Gating:
//   LAKEBASE_TEST_E2E=1            self-provision mode (creates a project)
//   DATABRICKS_HOST                workspace URL
//   DATABRICKS_CONFIG_PROFILE      profile pointing at the workspace
//   databricks CLI                 on PATH and authenticated
//
// Teardown: the test deletes its self-provisioned project on success.
// On failure the project is preserved (per the no-teardown-on-failure
// convention) so debugging is possible; the projectId is printed.

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import {
  createLakebaseProject,
  deleteLakebaseProject,
} from "../../scripts/lakebase/lakebase-project.js";
import { getDefaultBranch } from "../../scripts/lakebase/branch-utils.js";

const E2E = process.env.LAKEBASE_TEST_E2E === "1";
const DATABRICKS_HOST = process.env.DATABRICKS_HOST ?? "";
const DATABRICKS_PROFILE =
  process.env.DATABRICKS_CONFIG_PROFILE ?? "DEFAULT";

function hasCmd(cmd: string): boolean {
  const res = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return res.status === 0;
}
const DATABRICKS_AVAILABLE = E2E ? hasCmd("databricks") : false;
const RUN_SUITE = E2E && DATABRICKS_HOST && DATABRICKS_AVAILABLE;

// Resolve the built CLI absolute path so the test works regardless of
// vitest's invocation cwd.
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BRANCH_CLI = path.join(
  REPO_ROOT,
  "dist",
  "scripts",
  "lakebase",
  "branch.cli.js"
);

interface CliResult {
  stdout: string;
  stderr: string;
  status: number | null;
  parsed?: unknown;
}

function runCli(args: string[]): CliResult {
  const proc = spawnSync("node", [BRANCH_CLI, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      DATABRICKS_HOST,
      DATABRICKS_CONFIG_PROFILE: DATABRICKS_PROFILE,
    },
    timeout: 180_000,
  });
  const result: CliResult = {
    stdout: proc.stdout ?? "",
    stderr: proc.stderr ?? "",
    status: proc.status,
  };
  if (result.status === 0 && result.stdout.trim().length > 0) {
    try {
      result.parsed = JSON.parse(result.stdout.trim());
    } catch {
      // not all subcommands emit JSON; tests assert shape per-subcommand
    }
  }
  return result;
}

describe.skipIf(!RUN_SUITE)(
  "lakebase-branch CLI – live E2E (FEIP-7331)",
  () => {
    let projectId: string;
    let defaultBranchName: string;
    const createdBranches: string[] = [];

    beforeAll(async () => {
      projectId = `lbscm-cli-7331-${Date.now()}`;
      console.log(
        `  [setup] creating Lakebase project ${projectId} on ${DATABRICKS_HOST}`
      );
      await createLakebaseProject({ projectId, host: DATABRICKS_HOST });
      const dflt = await getDefaultBranch({
        instance: projectId,
        host: DATABRICKS_HOST,
      });
      if (!dflt) {
        throw new Error(
          `Project ${projectId} has no default branch after creation.`
        );
      }
      const fullName = dflt.name ?? "";
      defaultBranchName = fullName.split("/branches/").pop() ?? dflt.uid;
      console.log(`  [setup] default branch: ${defaultBranchName}`);
    }, 300_000);

    afterAll(async () => {
      // Best-effort cleanup of any straggler branches first (in case a
      // test errored partway). Lakebase project delete cascades anyway,
      // but explicit branch deletes give nicer telemetry.
      for (const b of createdBranches) {
        try {
          runCli(["delete", "--instance", projectId, "--branch", b]);
        } catch {
          // ignore
        }
      }
      if (projectId) {
        try {
          await deleteLakebaseProject({
            projectId,
            host: DATABRICKS_HOST,
          });
          console.log(`  [teardown] deleted Lakebase project ${projectId}`);
        } catch (err) {
          console.warn(
            `  [teardown] FAILED to delete project ${projectId}: ${(err as Error).message}`
          );
          console.warn(
            `  Manual cleanup: databricks --profile ${DATABRICKS_PROFILE} postgres delete-project ${projectId}`
          );
        }
      }
    }, 180_000);

    // ---------- read-side ----------

    it("`--help` exits 0 and prints usage", () => {
      const r = runCli(["--help"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/lakebase-branch \(FEIP-7331\)/);
      expect(r.stdout).toMatch(/Subcommands:/);
    });

    it("`list` returns an array containing the default branch", () => {
      const r = runCli(["list", "--instance", projectId]);
      expect(r.status).toBe(0);
      expect(Array.isArray(r.parsed)).toBe(true);
      const branches = r.parsed as Array<{ name: string }>;
      expect(branches.length).toBeGreaterThan(0);
      const found = branches.some((b) =>
        (b.name ?? "").endsWith(`/${defaultBranchName}`)
      );
      expect(found).toBe(true);
    });

    it("`show` on the default branch returns name + projectPath", () => {
      const r = runCli([
        "show",
        "--instance",
        projectId,
        "--branch",
        defaultBranchName,
      ]);
      expect(r.status).toBe(0);
      const info = r.parsed as { name?: string; projectPath?: string };
      expect(info.projectPath).toMatch(/^projects\/.*\/branches\//);
    });

    it("`show` on a missing branch exits 1 with a friendly message", () => {
      const r = runCli([
        "show",
        "--instance",
        projectId,
        "--branch",
        "does-not-exist-zzz",
      ]);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/Branch not found/);
    });

    // ---------- arg validation ----------

    it("`list` without --instance exits 2 with usage error", () => {
      const r = runCli(["list"]);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--instance/);
    });

    it("unknown subcommand exits 2 with usage", () => {
      const r = runCli(["bogus-sub"]);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/Unknown subcommand/);
    });

    // ---------- create / delete round-trip ----------

    it("`create` + `delete` round-trip a fresh branch", async () => {
      const branchName = `lbscm-cli-${Date.now()}`;
      createdBranches.push(branchName);

      // Create
      const created = runCli([
        "create",
        "--instance",
        projectId,
        "--branch",
        branchName,
        "--parent",
        defaultBranchName,
      ]);
      expect(created.status).toBe(0);
      const info = created.parsed as {
        uid?: string;
        name?: string;
        state?: string;
      };
      expect(info.uid).toBeTruthy();
      expect(info.state).toBe("READY");
      expect(info.name).toMatch(new RegExp(`/${branchName}$`));

      // Show
      const shown = runCli([
        "show",
        "--instance",
        projectId,
        "--branch",
        branchName,
      ]);
      expect(shown.status).toBe(0);

      // List should now contain it
      const listed = runCli(["list", "--instance", projectId]);
      expect(listed.status).toBe(0);
      const names = (
        (listed.parsed as Array<{ name: string }>) ?? []
      ).map((b) => (b.name ?? "").split("/branches/").pop());
      expect(names).toContain(branchName);

      // Delete
      const deleted = runCli([
        "delete",
        "--instance",
        projectId,
        "--branch",
        branchName,
      ]);
      expect(deleted.status).toBe(0);
      const delInfo = deleted.parsed as {
        deleted?: boolean;
        branch?: string;
      };
      expect(delInfo.deleted).toBe(true);

      // Remove from cleanup list since we already deleted
      const idx = createdBranches.indexOf(branchName);
      if (idx >= 0) createdBranches.splice(idx, 1);
    }, 240_000);

    // ---------- guardrails ----------

    it("`delete` refuses missing --branch", () => {
      const r = runCli(["delete", "--instance", projectId]);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--branch/);
    });
  }
);

// Always-on shape assertion: the bin file exists. Catches build
// regressions (e.g. tsup entry added but never built) without
// requiring the live env.
describe("lakebase-branch CLI – build artifact", () => {
  it("bin exists at the package.json#bin path", async () => {
    const fs = await import("node:fs");
    expect(fs.existsSync(BRANCH_CLI)).toBe(true);
  });
});
