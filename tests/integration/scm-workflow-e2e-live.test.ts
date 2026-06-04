// Live integration test for the SCM workflow CLIs (FEIP-7458 phase B/C+).
//
// Exercises the complete linear happy path of the SCM state machine
// end-to-end against a real Lakebase project + real GitHub repo + real
// self-hosted runner. The runner runs the scaffolded pr.yml + merge.yml
// workflows so wait-ci and merge --wait-migrate see real workflow runs,
// not mocks.
//
// Functions / CLIs exercised (and the pollUntil-refactored callsites
// they cover):
//
//   - lakebase-scm-claim-feature-branch   (scm-claim-feature.ts;
//                                         exercises createPairedBranch +
//                                         waitForBranchReady via pollUntilDefined)
//   - lakebase-scm-prepare-pr             (scm-prepare-pr.ts)
//   - lakebase-scm-wait-ci                (scm-wait-ci.ts; exercises pollUntil
//                                         on PR check-runs)
//   - lakebase-scm-merge --wait-migrate   (scm-merge.ts; exercises pollUntil
//                                         on listWorkflowRuns for the
//                                         downstream migrate workflow)
//
// State asserted at every step: .lakebase/workflow-state.json must
// transition scaffold-complete -> feature-claimed -> pr-ready ->
// ci-green -> merged, with each state's invariants (pr_url, ci_run_url,
// ci_green_at, merged_at, migrate_run_url, migrate_completed_at)
// populated. Anything advancing silently fails the test.
//
// Gating:
//   LAKEBASE_TEST_E2E_GITHUB=1      must be set; skip otherwise.
//   DATABRICKS_HOST (or ~/.databrickscfg) must be present.
//   GitHub auth must be resolvable by resolveGitHubToken (one of
//   GITHUB_TOKEN env / VS Code session / `gh auth login`).
//   The host must be able to reach github.com from the self-hosted
//   runner subprocess (the substrate-managed runner polls github.com
//   directly).
//
// Teardown contract (mirrors detect-language-via-self-hosted-runner):
//   - On test PASS: deregister runner, delete GitHub repo, delete
//     Lakebase project, rm local project dir.
//   - On test FAIL: leave everything intact + print recovery commands.
//
// Why not split into per-CLI tests: every CLI advances a single
// state-machine edge; running them out of order yields a refusal
// (bad-precondition). The linear pipeline is the substrate's contract.
// Side-path CLIs (abandon, adopt-state, recover-orphans, doctor --fix)
// each get their own dedicated live test.

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { execFileSync, spawnSync, type SpawnSyncReturns } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Octokit } from "octokit";
import { resolveGitHubToken } from "../../scripts/github/auth.js";
import { createProject } from "../../scripts/lakebase/create-project.js";
import { removeRunner } from "../../scripts/lakebase/runner-setup.js";
import {
  readWorkflowState,
  type ScmWorkflowState,
} from "../../scripts/lakebase/scm-workflow-state.js";

const E2E = process.env.LAKEBASE_TEST_E2E_GITHUB === "1";
const DATABRICKS_HOST = process.env.DATABRICKS_HOST ?? "";
const HAS_DATABRICKS =
  DATABRICKS_HOST !== "" ||
  fs.existsSync(path.join(os.homedir(), ".databrickscfg"));
const RUN_SUITE = E2E && HAS_DATABRICKS;

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CLI_DIR = path.join(REPO_ROOT, "dist", "scripts", "lakebase");
const CLAIM_CLI = path.join(CLI_DIR, "scm-claim-feature.cli.js");
const PREPARE_CLI = path.join(CLI_DIR, "scm-prepare-pr.cli.js");
const WAIT_CI_CLI = path.join(CLI_DIR, "scm-wait-ci.cli.js");
const MERGE_CLI = path.join(CLI_DIR, "scm-merge.cli.js");

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "inherit" });
}

function runCli(
  binPath: string,
  args: string[],
  cwd: string,
): SpawnSyncReturns<string> {
  return spawnSync("node", [binPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function logCli(label: string, result: SpawnSyncReturns<string>): void {
  console.log(`  [${label}] exit=${result.status}`);
  if (result.stdout?.trim()) {
    console.log(
      `  [${label}] stdout:\n${result.stdout
        .split("\n")
        .slice(0, 30)
        .map((l) => `    ${l}`)
        .join("\n")}`,
    );
  }
  if (result.stderr?.trim()) {
    console.log(
      `  [${label}] stderr:\n${result.stderr
        .split("\n")
        .slice(0, 30)
        .map((l) => `    ${l}`)
        .join("\n")}`,
    );
  }
}

function readState(projectDir: string): ScmWorkflowState {
  const s = readWorkflowState(projectDir);
  if (!s) throw new Error(`No workflow-state.json at ${projectDir}/.lakebase/`);
  return s;
}

describe.skipIf(!RUN_SUITE)(
  "SCM workflow CLIs - live e2e (FEIP-7458)",
  () => {
    let token: string;
    let octokit: Octokit;
    let owner: string;
    let projectName: string;
    let fullRepoName: string;
    let projectDir: string;
    let parentDir: string;
    let allPassed = false;

    beforeAll(async () => {
      token = await resolveGitHubToken();
      octokit = new Octokit({ auth: token });
      const me = await octokit.rest.users.getAuthenticated();
      owner = me.data.login;

      projectName = `scm-workflow-verify-${timestamp()}`;
      fullRepoName = `${owner}/${projectName}`;
      parentDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `scm-workflow-e2e-${Date.now()}-`),
      );

      console.log("");
      console.log("[NOTICE] SCM workflow live e2e will create:");
      console.log(`         lakebase project: ${projectName}`);
      console.log(`         github repo:      ${fullRepoName} (private)`);
      console.log(`         self-hosted runner: ~/.lakebase/runners/${projectName}/`);
      console.log(`         local project dir: ${parentDir}/${projectName}`);
      console.log("");
      console.log("         Recovery if the test is killed mid-run:");
      console.log(`           gh repo delete ${fullRepoName} --yes`);
      console.log(
        `           databricks postgres delete-project projects/${projectName}`,
      );
      console.log("");

      const result = await createProject({
        projectName,
        parentDir,
        databricksHost:
          DATABRICKS_HOST ||
          (process.env.LAKEBASE_TEST_HOST ?? "https://workspace.invalid"),
        githubOwner: owner,
        createGithubRepo: true,
        privateRepo: true,
        language: "python",
        runnerType: "self-hosted",
        tiers: 2,
        enableTdd: false,
        enableE2e: false,
        enableInfra: false,
        skipCommands: true,
      });
      projectDir = result.projectDir;
      console.log(`  [setup] createProject succeeded:`);
      console.log(`    projectDir=${projectDir}`);
      console.log(`    githubRepoUrl=${result.githubRepoUrl}`);
      console.log(`    lakebaseProjectId=${result.lakebaseProjectId}`);
      console.log(`    lakebaseDefaultBranch=${result.lakebaseDefaultBranch}`);
      if (result.warnings.length > 0) {
        console.log(`    warnings=${JSON.stringify(result.warnings)}`);
      }

      const initialState = readState(projectDir);
      expect(initialState.state).toBe("scaffold-complete");
      expect(initialState.tier_topology).toBe(2);
      expect(initialState.project_id).toBe(projectName);
    }, 10 * 60_000);

    it(
      "claim -> prepare-pr -> wait-ci -> merge --wait-migrate happy path",
      async () => {
        const featureId = "F1-e2e-test";

        // ─── 1. CLAIM ────────────────────────────────────────────
        console.log("  [step 1] lakebase-scm-claim-feature-branch");
        const claim = runCli(
          CLAIM_CLI,
          [featureId, "--project-dir", projectDir],
          projectDir,
        );
        logCli("claim", claim);
        expect(claim.status).toBe(0);

        const stateAfterClaim = readState(projectDir);
        expect(stateAfterClaim.state).toBe("feature-claimed");
        expect(stateAfterClaim.feature_id).toBe(featureId.toLowerCase());
        expect(stateAfterClaim.branch).toMatch(/^feature[-/]/);
        expect(stateAfterClaim.parent_branch).toBe("staging");
        expect(stateAfterClaim.lakebase_branch_uid).toBeTruthy();
        expect(stateAfterClaim.claimed_at).toBeTruthy();

        // ─── 2. MAKE A REAL COMMIT ON THE FEATURE BRANCH ─────────
        // The substrate's claim already checked out the feature branch.
        // We add a trivial change so the PR has content + push it.
        const stamp = `live test commit ${Date.now()}\n`;
        fs.appendFileSync(path.join(projectDir, "README.md"), `\n${stamp}`);
        git(projectDir, ["add", "README.md"]);
        git(projectDir, [
          "-c",
          `user.email=integration-test@${owner}.local`,
          "-c",
          `user.name=${owner}`,
          "commit",
          "-q",
          "-m",
          `live test: SCM workflow e2e (${featureId})`,
        ]);

        // ─── 3. PREPARE-PR ───────────────────────────────────────
        console.log("  [step 3] lakebase-scm-prepare-pr");
        const prepare = runCli(
          PREPARE_CLI,
          [
            "--project-dir",
            projectDir,
            "--title",
            "SCM workflow e2e",
            "--body",
            "Live integration test for scm-prepare-pr / wait-ci / merge --wait-migrate.",
          ],
          projectDir,
        );
        logCli("prepare-pr", prepare);
        expect(prepare.status).toBe(0);

        const stateAfterPrepare = readState(projectDir);
        expect(stateAfterPrepare.state).toBe("pr-ready");
        expect(stateAfterPrepare.pr_url).toMatch(
          /^https:\/\/github\.com\/.+\/pull\/\d+$/,
        );
        expect(stateAfterPrepare.pushed_at).toBeTruthy();

        // ─── 4. WAIT-CI (exercises pollUntil) ────────────────────
        console.log("  [step 4] lakebase-scm-wait-ci");
        const waitCi = runCli(
          WAIT_CI_CLI,
          ["--project-dir", projectDir],
          projectDir,
        );
        logCli("wait-ci", waitCi);
        expect(waitCi.status).toBe(0);

        const stateAfterCi = readState(projectDir);
        expect(stateAfterCi.state).toBe("ci-green");
        expect(stateAfterCi.ci_run_url).toBeTruthy();
        expect(stateAfterCi.ci_green_at).toBeTruthy();

        // ─── 5. MERGE --wait-migrate (exercises pollUntil) ───────
        console.log("  [step 5] lakebase-scm-merge --wait-migrate");
        const merge = runCli(
          MERGE_CLI,
          ["--project-dir", projectDir, "--method", "squash"],
          projectDir,
        );
        logCli("merge", merge);
        expect(merge.status).toBe(0);

        const stateAfterMerge = readState(projectDir);
        expect(stateAfterMerge.state).toBe("merged");
        expect(stateAfterMerge.merged_at).toBeTruthy();
        expect(stateAfterMerge.migrate_run_url).toMatch(
          /^https:\/\/github\.com\/.+\/actions\/runs\/\d+$/,
        );
        expect(stateAfterMerge.migrate_completed_at).toBeTruthy();

        allPassed = true;
      },
      30 * 60_000, // 30-min budget; CI runs + migrate workflow take real time
    );

    afterAll(async () => {
      if (!allPassed) {
        console.log("");
        console.log("[LEAVE-INTACT] Skipping teardown (test failed).");
        console.log("         To clean up manually:");
        console.log(`           gh repo delete ${fullRepoName} --yes`);
        console.log(
          `           databricks postgres delete-project projects/${projectName}`,
        );
        console.log(
          `           node -e 'import("@databricks-solutions/lakebase-app-dev-kit/lakebase").then(m =>` +
            ` m.removeRunner({fullRepoName: "${fullRepoName}", projectName: "${projectName}"}))'`,
        );
        console.log(`           rm -rf ${projectDir}`);
        return;
      }
      console.log("");
      console.log("[TEARDOWN] Test passed. Cleaning up.");

      try {
        await removeRunner({ fullRepoName, projectName });
        console.log("  [teardown] runner deregistered");
      } catch (e) {
        console.log(
          `  [teardown] removeRunner failed: ${(e as Error).message}`,
        );
      }

      try {
        await octokit.rest.repos.delete({ owner, repo: projectName });
        console.log("  [teardown] github repo deleted");
      } catch (e) {
        console.log(
          `  [teardown] repo delete failed: ${(e as Error).message}`,
        );
      }

      try {
        execFileSync(
          "databricks",
          ["postgres", "delete-project", `projects/${projectName}`],
          { stdio: "ignore" },
        );
        console.log("  [teardown] lakebase project deleted");
      } catch (e) {
        console.log(
          `  [teardown] lakebase delete failed: ${(e as Error).message}`,
        );
      }

      try {
        fs.rmSync(parentDir, { recursive: true, force: true });
        console.log("  [teardown] local project dir removed");
      } catch {
        /* best-effort */
      }
    }, 5 * 60_000);
  },
);
