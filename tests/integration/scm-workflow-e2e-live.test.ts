// Live integration test for the SCM workflow CLIs (FEIP-7458 phase B/C+).
//
// Exercises the complete SCM state machine, including both the happy
// path and a failure path, end-to-end against a real Lakebase project +
// real GitHub repo + real self-hosted runner. The runner runs the
// scaffolded pr.yml + merge.yml workflows so wait-ci and
// merge --wait-migrate see real workflow runs, not mocks.
//
// Functions / CLIs exercised:
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
//   - lakebase-scm-abandon-feature        (scm-abandon-feature.ts; used
//                                         between happy + failure tests
//                                         to drop back to scaffold-complete
//                                         before claiming a new feature)
//
// Test cases:
//
//   1. HAPPY PATH (passing code)
//      scaffold-complete -> feature-claimed -> pr-ready -> ci-green -> merged
//      Asserts every state-file invariant (pr_url, ci_run_url, ci_green_at,
//      merged_at, migrate_run_url, migrate_completed_at). Also asserts the
//      pr.yml workflow run skipped both JDK steps (the project is Python;
//      the JDK probe + fallback are gated on lang == 'java' per the
//      scaffold.ts JDK-probe-then-fallback fix). This is the regression
//      assertion for the bug where the scaffold ran setup-java
//      unconditionally on non-Java projects.
//
//   2. FAILURE PATH (code that breaks CI)
//      After the happy-path merge, the state is at `merged`. Claim a
//      new feature, push a commit containing an intentionally-failing
//      pytest, and assert wait-ci exits with code 3 (ci-failed) and the
//      state does NOT advance to ci-green. This proves the CLI is
//      faithful to the real CI signal and does not silently mark
//      failed runs as green.
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
//   - On both tests PASS: deregister runner, delete GitHub repo, delete
//     Lakebase project, rm local project dir.
//   - On any test FAIL: leave everything intact + print recovery commands.

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
const ABANDON_CLI = path.join(CLI_DIR, "scm-abandon-feature.cli.js");

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

function gitCommit(cwd: string, owner: string, message: string): void {
  git(cwd, [
    "-c",
    `user.email=integration-test@${owner}.local`,
    "-c",
    `user.name=${owner}`,
    "commit",
    "-q",
    "-m",
    message,
  ]);
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

/**
 * Fetch all steps for the first job of the workflow run that wait-ci
 * recorded as ci_run_url. Returns the steps in declaration order so
 * the caller can assert on per-step conclusions (success / skipped /
 * failure).
 */
async function fetchRunSteps(
  octokit: Octokit,
  owner: string,
  repo: string,
  runUrl: string,
): Promise<
  Array<{ name: string; conclusion: string | null; status: string | null }>
> {
  const m = runUrl.match(/\/actions\/runs\/(\d+)/);
  if (!m) throw new Error(`Could not extract run id from ${runUrl}`);
  const runId = Number(m[1]);
  const jobs = await octokit.rest.actions.listJobsForWorkflowRun({
    owner,
    repo,
    run_id: runId,
  });
  const first = jobs.data.jobs[0];
  if (!first) throw new Error(`No jobs for workflow run ${runId}`);
  return (first.steps ?? []).map((s) => ({
    name: s.name,
    conclusion: s.conclusion,
    status: s.status,
  }));
}

describe.skipIf(!RUN_SUITE)(
  "SCM workflow CLIs - live e2e (FEIP-7458)",
  () => {
    let token: string;
    let octokit: Octokit;
    let owner: string;
    let projectName: string;
    let repoSlug: string;
    let fullRepoName: string;
    let projectDir: string;
    let parentDir: string;
    let happyPathPassed = false;
    let failurePathPassed = false;

    beforeAll(async () => {
      token = await resolveGitHubToken();
      octokit = new Octokit({ auth: token });
      const me = await octokit.rest.users.getAuthenticated();
      owner = me.data.login;

      projectName = `scm-workflow-verify-${timestamp()}`;
      repoSlug = projectName;
      fullRepoName = `${owner}/${repoSlug}`;
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
      "happy path: passing code -> claim -> prepare-pr -> wait-ci (green) -> merge --wait-migrate (success)",
      async () => {
        const featureId = "F1-happy-path";

        // ─── 1. CLAIM ────────────────────────────────────────────
        console.log("  [happy/1] lakebase-scm-claim-feature-branch");
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

        // ─── 2. MAKE A PASSING COMMIT ON THE FEATURE BRANCH ──────
        // The substrate's claim already checked out the feature branch.
        // We add a trivial benign change (README line) so the PR has
        // content but CI still passes.
        fs.appendFileSync(
          path.join(projectDir, "README.md"),
          `\nlive test happy-path commit ${Date.now()}\n`,
        );
        git(projectDir, ["add", "README.md"]);
        gitCommit(
          projectDir,
          owner,
          `live test: happy path SCM workflow e2e (${featureId})`,
        );

        // ─── 3. PREPARE-PR ───────────────────────────────────────
        console.log("  [happy/3] lakebase-scm-prepare-pr");
        const prepare = runCli(
          PREPARE_CLI,
          [
            "--project-dir",
            projectDir,
            "--title",
            "live e2e: happy path",
            "--body",
            "Live integration test for the SCM workflow CLI happy path.",
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

        // ─── 4. WAIT-CI (must go green) ──────────────────────────
        console.log("  [happy/4] lakebase-scm-wait-ci (expecting green)");
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

        // ─── 4a. WORKFLOW STEP REGRESSION: JDK probe MUST be ─────
        //         skipped on a Python project. This is the live
        //         regression test for the scaffold.ts fix that gated
        //         setup-java behind lang == 'java'.
        const ciSteps = await fetchRunSteps(
          octokit,
          owner,
          repoSlug,
          stateAfterCi.ci_run_url!,
        );
        console.log(
          `  [happy/4a] CI run steps: ${ciSteps
            .map((s) => `${s.name}=${s.conclusion ?? s.status}`)
            .join(", ")}`,
        );
        const jdkProbe = ciSteps.find((s) =>
          /Set up JDK \(probe local\)/.test(s.name),
        );
        const jdkFallback = ciSteps.find((s) =>
          /Set up JDK \(download via actions\/setup-java fallback\)/.test(s.name),
        );
        // Both steps exist in the scaffolded pr.yml but must be
        // SKIPPED on a Python project. "skipped" is the only
        // acceptable conclusion; "success" would mean setup-java
        // actually ran (the regression), "failure" would mean the
        // gate misfired.
        if (jdkProbe) {
          expect(jdkProbe.conclusion).toBe("skipped");
        }
        if (jdkFallback) {
          expect(jdkFallback.conclusion).toBe("skipped");
        }

        // ─── 5. MERGE --wait-migrate (must succeed) ──────────────
        console.log("  [happy/5] lakebase-scm-merge --wait-migrate");
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

        // ─── 5a. MIGRATE WORKFLOW STEP REGRESSION: JDK probe ─────
        //         must also skip in merge.yml on the parent branch.
        const migrateSteps = await fetchRunSteps(
          octokit,
          owner,
          repoSlug,
          stateAfterMerge.migrate_run_url!,
        );
        console.log(
          `  [happy/5a] migrate run steps: ${migrateSteps
            .map((s) => `${s.name}=${s.conclusion ?? s.status}`)
            .join(", ")}`,
        );
        const migJdkProbe = migrateSteps.find((s) =>
          /Set up JDK \(probe local\)/.test(s.name),
        );
        const migJdkFallback = migrateSteps.find((s) =>
          /Set up JDK \(download via actions\/setup-java fallback\)/.test(s.name),
        );
        if (migJdkProbe) {
          expect(migJdkProbe.conclusion).toBe("skipped");
        }
        if (migJdkFallback) {
          expect(migJdkFallback.conclusion).toBe("skipped");
        }

        happyPathPassed = true;
      },
      30 * 60_000, // 30-min budget; CI runs + migrate workflow take real time
    );

    it(
      "failure path: code that breaks CI -> wait-ci exits ci-failed, state stays at pr-ready",
      async () => {
        // Precondition: previous test left state at `merged`. Claim a
        // fresh feature on top of merged. (Per the SCM state machine,
        // claim is valid from scaffold-complete OR merged.)
        const failingFeatureId = "F2-ci-failure";

        console.log("  [fail/1] lakebase-scm-claim-feature-branch (new feature)");
        const claim = runCli(
          CLAIM_CLI,
          [failingFeatureId, "--project-dir", projectDir],
          projectDir,
        );
        logCli("claim", claim);
        expect(claim.status).toBe(0);

        const stateAfterClaim = readState(projectDir);
        expect(stateAfterClaim.state).toBe("feature-claimed");
        expect(stateAfterClaim.feature_id).toBe(failingFeatureId.toLowerCase());

        // ─── 2. INTRODUCE A FAILING PYTEST ───────────────────────
        // pr.yml's "Run tests" step shells to scripts/run-tests.sh
        // which invokes pytest on tests/. Adding an always-failing
        // test forces the workflow run to conclude "failure".
        const testsDir = path.join(projectDir, "tests");
        fs.mkdirSync(testsDir, { recursive: true });
        fs.writeFileSync(
          path.join(testsDir, "test_live_e2e_intentional_failure.py"),
          [
            "# Intentionally failing test, written by",
            "# tests/integration/scm-workflow-e2e-live.test.ts to prove",
            "# wait-ci surfaces real CI failures.",
            "",
            "def test_live_e2e_intentional_failure():",
            "    assert False, \"intentional CI failure for live e2e test\"",
            "",
          ].join("\n"),
        );
        git(projectDir, ["add", "tests/test_live_e2e_intentional_failure.py"]);
        gitCommit(
          projectDir,
          owner,
          `live test: failure path SCM workflow e2e (${failingFeatureId})`,
        );

        // ─── 3. PREPARE-PR ───────────────────────────────────────
        console.log("  [fail/3] lakebase-scm-prepare-pr");
        const prepare = runCli(
          PREPARE_CLI,
          [
            "--project-dir",
            projectDir,
            "--title",
            "live e2e: failure path",
            "--body",
            "Live integration test asserting wait-ci surfaces a real CI failure.",
          ],
          projectDir,
        );
        logCli("prepare-pr", prepare);
        expect(prepare.status).toBe(0);

        const stateAfterPrepare = readState(projectDir);
        expect(stateAfterPrepare.state).toBe("pr-ready");

        // ─── 4. WAIT-CI (must exit non-zero with ci-failed) ──────
        console.log("  [fail/4] lakebase-scm-wait-ci (expecting non-zero)");
        const waitCi = runCli(
          WAIT_CI_CLI,
          ["--project-dir", projectDir],
          projectDir,
        );
        logCli("wait-ci", waitCi);
        // The CLI maps ci-failed to exit code 3; timeout to 4. The
        // happy path was 0. A non-zero exit here is the substrate
        // honestly reporting "CI failed"; if the CLI exited 0, it
        // means it silently treated a failed run as green, which is
        // the regression we are guarding against.
        expect(waitCi.status).not.toBe(0);
        expect(waitCi.status).toBe(3);
        expect(waitCi.stderr).toMatch(/CI failed/i);

        const stateAfterCi = readState(projectDir);
        // State MUST stay at pr-ready. wait-ci must not write
        // ci-green when the underlying CI conclusion was failure.
        expect(stateAfterCi.state).toBe("pr-ready");
        expect(stateAfterCi.ci_green_at).toBeFalsy();

        failurePathPassed = true;
      },
      30 * 60_000,
    );

    afterAll(async () => {
      const allPassed = happyPathPassed && failurePathPassed;
      if (!allPassed) {
        console.log("");
        console.log(
          `[LEAVE-INTACT] Skipping teardown (happy=${happyPathPassed}, failure=${failurePathPassed}).`,
        );
        console.log("         To clean up manually:");
        console.log(`           gh repo delete ${fullRepoName} --yes`);
        console.log(
          `           databricks postgres delete-project projects/${projectName}`,
        );
        console.log(
          `           node -e 'import("@databricks-solutions/lakebase-app-dev-kit/lakebase").then(m =>` +
            ` m.removeRunner({fullRepoName: "${fullRepoName}", projectName: "${projectName}"}))'`,
        );
        console.log(`           rm -rf ${parentDir}`);
        return;
      }
      console.log("");
      console.log("[TEARDOWN] Both tests passed. Cleaning up.");

      // Abandon the failing feature so the project ends in a clean
      // state before we delete it. Strictly cosmetic, but keeps any
      // dangling Lakebase branch from outlasting the repo.
      try {
        const abandon = runCli(
          ABANDON_CLI,
          ["--project-dir", projectDir],
          projectDir,
        );
        logCli("abandon (teardown)", abandon);
      } catch (e) {
        console.log(
          `  [teardown] abandon failed: ${(e as Error).message}`,
        );
      }

      try {
        await removeRunner({ fullRepoName, projectName });
        console.log("  [teardown] runner deregistered");
      } catch (e) {
        console.log(
          `  [teardown] removeRunner failed: ${(e as Error).message}`,
        );
      }

      try {
        await octokit.rest.repos.delete({ owner, repo: repoSlug });
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
