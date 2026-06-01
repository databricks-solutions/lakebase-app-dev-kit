// Live BDD for the lakebase-pr CLI (FEIP-7328).
//
// Exercises the actual PR flow end-to-end against a throwaway GitHub
// repo on the caller's authenticated account. The repo is created via
// `gh` CLI, populated with a single base commit, then a feature branch
// is pushed and a PR opened via `lakebase-pr open`. Status / files
// queries hit real GitHub through the kit's Octokit. Plain `merge`
// (not merge-paired, to keep the test's cleanup path simple) closes
// the PR. Repo is deleted in teardown.
//
// Gating:
//   LAKEBASE_TEST_E2E=1                 must be set
//   gh CLI                              authenticated (kevin-hartman scope:
//                                       repo, workflow, delete_repo)
//   LAKEBASE_TEST_GITHUB_OWNER          GitHub user/org to host the throwaway
//                                       repo under. Default: empty (skip)
//
// Teardown: repo is deleted on success. On failure, the repo + branch
// are preserved for debugging; the repo URL is printed.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const E2E = process.env.LAKEBASE_TEST_E2E === "1";
const OWNER = process.env.LAKEBASE_TEST_GITHUB_OWNER ?? "";

function hasCmd(cmd: string): boolean {
  const res = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return res.status === 0;
}
const GH_AVAILABLE = E2E ? hasCmd("gh") : false;
const RUN_SUITE = E2E && OWNER && GH_AVAILABLE;

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PR_CLI = path.join(
  REPO_ROOT,
  "dist",
  "scripts",
  "github",
  "pr.cli.js"
);

interface CliResult {
  stdout: string;
  stderr: string;
  status: number | null;
  parsed?: unknown;
}

function runPrCli(args: string[]): CliResult {
  const proc = spawnSync("node", [PR_CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env },
    timeout: 60_000,
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
      // some flows print non-JSON
    }
  }
  return result;
}

function run(cmd: string, args: string[], cwd?: string): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    cwd,
    timeout: 60_000,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

describe.skipIf(!RUN_SUITE)(
  "lakebase-pr CLI – live E2E (FEIP-7328)",
  () => {
    let repoName: string;
    let ownerRepo: string;
    let repoDir: string;
    let prNumber: number | undefined;
    let testPassed = false;

    beforeAll(async () => {
      const ts = Date.now();
      repoName = `lbscm-pr-bdd-${ts}`;
      ownerRepo = `${OWNER}/${repoName}`;
      repoDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `lbscm-pr-bdd-${ts}-`)
      );

      console.log(`  [setup] creating throwaway GitHub repo ${ownerRepo}`);
      const create = run("gh", [
        "repo",
        "create",
        ownerRepo,
        "--private",
        "--description",
        "Throwaway repo for lakebase-app-dev-kit BDD (auto-delete after test)",
        "--confirm",
      ]);
      if (create.status !== 0) {
        throw new Error(
          `Failed to create repo ${ownerRepo}:\n${create.stderr}`
        );
      }

      // Clone + initial commit on main
      run("git", ["init", "-b", "main"], repoDir);
      run("git", ["config", "user.email", "test@example.com"], repoDir);
      run("git", ["config", "user.name", "BDD test"], repoDir);
      fs.writeFileSync(path.join(repoDir, "README.md"), "# bdd\n");
      run("git", ["add", "-A"], repoDir);
      run("git", ["commit", "-m", "Initial commit"], repoDir);
      run(
        "git",
        [
          "remote",
          "add",
          "origin",
          `https://github.com/${ownerRepo}.git`,
        ],
        repoDir
      );
      const push = run(
        "git",
        ["push", "-u", "origin", "main"],
        repoDir
      );
      if (push.status !== 0) {
        throw new Error(`Failed to push base commit:\n${push.stderr}`);
      }

      // Create + push the feature branch
      run("git", ["checkout", "-b", "feature/test-pr"], repoDir);
      fs.writeFileSync(
        path.join(repoDir, "feature.txt"),
        "added in feature/test-pr\n"
      );
      run("git", ["add", "-A"], repoDir);
      run("git", ["commit", "-m", "Add feature.txt"], repoDir);
      const pushF = run(
        "git",
        ["push", "-u", "origin", "feature/test-pr"],
        repoDir
      );
      if (pushF.status !== 0) {
        throw new Error(
          `Failed to push feature branch:\n${pushF.stderr}`
        );
      }
    }, 180_000);

    afterAll(async () => {
      try {
        fs.rmSync(repoDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
      if (!testPassed) {
        console.warn(
          `  [teardown] preserving repo ${ownerRepo} for debugging (test failed)`
        );
        return;
      }
      console.log(`  [teardown] deleting throwaway repo ${ownerRepo}`);
      const del = run("gh", ["repo", "delete", ownerRepo, "--yes"]);
      if (del.status !== 0) {
        console.warn(
          `  [teardown] FAILED to delete ${ownerRepo}:\n${del.stderr}`
        );
        console.warn(`  Manual cleanup: gh repo delete ${ownerRepo} --yes`);
      }
    }, 60_000);

    it("`--help` exits 0 and prints usage", () => {
      const r = runPrCli(["--help"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/lakebase-pr \(FEIP-7328\)/);
    });

    it("`open` creates a real PR and returns its URL", () => {
      const r = runPrCli([
        "open",
        "--owner-repo",
        ownerRepo,
        "--head",
        "feature/test-pr",
        "--base",
        "main",
        "--title",
        "Add feature.txt",
        "--body",
        "Live BDD: opens a PR via lakebase-pr CLI.",
      ]);
      if (r.status !== 0) {
        console.error(`open failed:\nstdout=${r.stdout}\nstderr=${r.stderr}`);
      }
      expect(r.status).toBe(0);
      const out = r.parsed as { url?: string };
      expect(out.url).toMatch(
        new RegExp(`^https://github\\.com/${OWNER}/${repoName}/pull/\\d+$`)
      );
      const m = out.url!.match(/\/pull\/(\d+)$/);
      prNumber = m ? parseInt(m[1], 10) : undefined;
      expect(prNumber).toBeTruthy();
    }, 60_000);

    it("`status` looks up the PR by head and returns CI + state", () => {
      const r = runPrCli([
        "status",
        "--owner-repo",
        ownerRepo,
        "--head",
        "feature/test-pr",
      ]);
      expect(r.status).toBe(0);
      const info = r.parsed as {
        number?: number;
        state?: string;
        headBranch?: string;
      };
      expect(info.number).toBe(prNumber);
      expect(info.state).toBe("OPEN");
      expect(info.headBranch).toBe("feature/test-pr");
    });

    it("`files` returns the changed file list", () => {
      const r = runPrCli([
        "files",
        "--owner-repo",
        ownerRepo,
        "--pull-number",
        String(prNumber),
      ]);
      expect(r.status).toBe(0);
      const files = r.parsed as Array<{ path?: string; status?: string }>;
      expect(Array.isArray(files)).toBe(true);
      const paths = files.map((f) => f.path);
      expect(paths).toContain("feature.txt");
    });

    it("`reviews` returns an array (empty on a fresh PR)", () => {
      const r = runPrCli([
        "reviews",
        "--owner-repo",
        ownerRepo,
        "--pull-number",
        String(prNumber),
      ]);
      expect(r.status).toBe(0);
      const reviews = r.parsed as unknown[];
      expect(Array.isArray(reviews)).toBe(true);
    });

    it("`merge` closes the PR and returns the merge message", () => {
      const r = runPrCli([
        "merge",
        "--owner-repo",
        ownerRepo,
        "--pull-number",
        String(prNumber),
        "--method",
        "squash",
      ]);
      if (r.status !== 0) {
        console.error(
          `merge failed:\nstdout=${r.stdout}\nstderr=${r.stderr}`
        );
      }
      expect(r.status).toBe(0);
      const out = r.parsed as { message?: string };
      expect(typeof out.message).toBe("string");
      testPassed = true;
    }, 60_000);

    it("missing required flags exits 2 with usage error", () => {
      const r = runPrCli(["open", "--owner-repo", ownerRepo]);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/missing required flag/);
    });
  }
);

describe("lakebase-pr CLI – build artifact", () => {
  it("bin exists at the package.json#bin path", async () => {
    const fs = await import("node:fs");
    expect(fs.existsSync(PR_CLI)).toBe(true);
  });
});
