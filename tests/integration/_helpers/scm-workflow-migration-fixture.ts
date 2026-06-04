// Shared driver for the SCM workflow + real-migration live tests.
//
// Three sister tests in tests/integration/ exercise this end-to-end
// against real Lakebase + GitHub + a real self-hosted runner, one per
// migration tool:
//
//   scm-workflow-e2e-live.test.ts          – Python  / alembic
//   scm-workflow-flyway-live.test.ts       – Java    / flyway
//   scm-workflow-knex-live.test.ts         – Nodejs  / knex
//
// Each test file calls `runScmWorkflowMigrationE2E({ language, writeMigration, expectJdkStepsToRun })`
// once. The driver is responsible for:
//
//   - createProject(language) on the target Databricks workspace
//   - lakebase-scm-claim-feature-branch (substrate CLI)
//   - The caller's writeMigration callback (commits the migration file)
//   - lakebase-scm-prepare-pr -> assert state=pr-ready
//   - lakebase-scm-wait-ci    -> assert state=ci-green
//   - Query the ci-pr-N Lakebase branch's schema; assert the marker
//     table the migration created actually exists. This is the
//     proof the migration applied on the PR's paired branch.
//   - Fetch the pr.yml workflow run's job steps; assert the JDK
//     probe step ran vs was skipped per `expectJdkStepsToRun`. This
//     is the regression assertion for the scaffold bug where
//     setup-java ran unconditionally on non-Java projects.
//   - lakebase-scm-merge --wait-migrate -> assert state=merged
//   - Query the parent branch (staging) schema; assert the marker
//     table now exists there too. Proves the merge --wait-migrate
//     path applies migrations to the parent's Lakebase pair.
//   - Same JDK-probe assertion on the merge.yml run.
//   - Teardown on pass; preserve on fail (per kit convention).

import { expect } from "vitest";
import { execFileSync, spawnSync, type SpawnSyncReturns } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Octokit } from "octokit";
import { resolveGitHubToken } from "../../../scripts/github/auth.js";
import { createProject } from "../../../scripts/lakebase/create-project.js";
import { removeRunner } from "../../../scripts/lakebase/runner-setup.js";
import {
  readWorkflowState,
  type ScmWorkflowState,
} from "../../../scripts/lakebase/scm-workflow-state.js";
import { queryBranchSchema } from "../../../scripts/lakebase/branch-schema.js";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const CLI_DIR = path.join(REPO_ROOT, "dist", "scripts", "lakebase");
export const CLI = {
  claim: path.join(CLI_DIR, "scm-claim-feature.cli.js"),
  prepare: path.join(CLI_DIR, "scm-prepare-pr.cli.js"),
  waitCi: path.join(CLI_DIR, "scm-wait-ci.cli.js"),
  merge: path.join(CLI_DIR, "scm-merge.cli.js"),
  abandon: path.join(CLI_DIR, "scm-abandon-feature.cli.js"),
};

export function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "inherit" });
}

export function gitCommit(
  cwd: string,
  owner: string,
  message: string,
): void {
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

export function runCli(
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

export function logCli(
  label: string,
  result: SpawnSyncReturns<string>,
): void {
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

export function readState(projectDir: string): ScmWorkflowState {
  const s = readWorkflowState(projectDir);
  if (!s)
    throw new Error(`No workflow-state.json at ${projectDir}/.lakebase/`);
  return s;
}

export function pullNumber(prUrl: string): number {
  const m = prUrl.match(/\/pull\/(\d+)$/);
  if (!m) throw new Error(`Cannot parse PR number from ${prUrl}`);
  return Number(m[1]);
}

export async function assertTableExists(args: {
  instance: string;
  branch: string;
  table: string;
}): Promise<void> {
  const schema = await queryBranchSchema({
    instance: args.instance,
    branch: args.branch,
  });
  const tableNames = schema.map((t) => t.name);
  if (!tableNames.includes(args.table)) {
    throw new Error(
      `expected table "${args.table}" on Lakebase branch "${args.branch}" of project "${args.instance}", ` +
        `but only found: [${tableNames.join(", ")}]`,
    );
  }
}

export async function fetchRunSteps(
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

/**
 * Assert the JDK probe + fallback step outcomes match expectation.
 * - For non-Java languages: probe should be SKIPPED (gated on lang == 'java').
 * - For Java with local JDK present: probe SUCCESS, fallback SKIPPED.
 * - For Java with no local JDK: probe SUCCESS, fallback SUCCESS.
 *
 * The non-Java assertion is the live regression test for the bug
 * where scaffold.ts shipped setup-java unconditionally; the Java
 * assertion proves the probe + fallback wiring is correct.
 */
export function assertJdkProbeOutcome(
  steps: Array<{ name: string; conclusion: string | null }>,
  expectation: "skipped" | "ran",
): void {
  const probe = steps.find((s) =>
    /Set up JDK \(probe local\)/.test(s.name),
  );
  const fallback = steps.find((s) =>
    /Set up JDK \(download via actions\/setup-java fallback\)/.test(s.name),
  );
  if (expectation === "skipped") {
    if (probe) expect(probe.conclusion).toBe("skipped");
    if (fallback) expect(fallback.conclusion).toBe("skipped");
  } else {
    if (!probe) {
      throw new Error(
        "expected JDK probe step to exist (lang == 'java'), but it was not found",
      );
    }
    expect(probe.conclusion).toBe("success");
    // fallback may be skipped (local found) or success (downloaded).
    if (fallback && fallback.conclusion !== null) {
      expect(["skipped", "success"]).toContain(fallback.conclusion);
    }
  }
}

export interface ScmWorkflowMigrationE2EArgs {
  language: "python" | "java" | "nodejs";
  /**
   * Short tag for the migration tool, used in logs + the marker
   * table name. e.g. "alembic", "flyway", "knex".
   */
  tool: string;
  /**
   * Callback to write the migration file(s) under projectDir. Should
   * register exactly one new migration that creates the markerTable
   * (passed in). Caller is responsible for the migration's content
   * and filename in the language's convention.
   */
  writeMigration: (args: {
    projectDir: string;
    markerTable: string;
  }) => string[];
  /**
   * Whether the scaffold's pr.yml is expected to RUN the JDK probe
   * step ("ran") or SKIP it ("skipped"). non-Java languages skip;
   * Java runs the probe (the fallback may run or skip depending on
   * whether local java is available on the runner).
   */
  expectJdkStepsToRun: "ran" | "skipped";
}

export interface ScmWorkflowMigrationE2EContext {
  projectName: string;
  fullRepoName: string;
  projectDir: string;
  parentDir: string;
  owner: string;
  octokit: Octokit;
}

/**
 * Run the full SCM workflow + migration round-trip for one language /
 * tool combination. Returns the context (project + repo identifiers)
 * so the caller's afterAll can tear down.
 *
 * Throws on any assertion failure; the caller's allPassed flag
 * controls the teardown vs preserve decision.
 */
export async function runScmWorkflowMigrationE2E(
  cfg: ScmWorkflowMigrationE2EArgs,
): Promise<ScmWorkflowMigrationE2EContext> {
  const token = await resolveGitHubToken();
  const octokit = new Octokit({ auth: token });
  const me = await octokit.rest.users.getAuthenticated();
  const owner = me.data.login;

  const projectName = `scm-${cfg.tool}-verify-${timestamp()}`;
  const fullRepoName = `${owner}/${projectName}`;
  const parentDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `scm-${cfg.tool}-${Date.now()}-`),
  );

  console.log("");
  console.log(`[NOTICE] SCM ${cfg.tool} live e2e will create:`);
  console.log(`         lakebase project: ${projectName}`);
  console.log(`         github repo:      ${fullRepoName} (private)`);
  console.log(
    `         self-hosted runner: ~/.lakebase/runners/${projectName}/`,
  );
  console.log(`         local project dir: ${parentDir}/${projectName}`);
  console.log("");

  const result = await createProject({
    projectName,
    parentDir,
    databricksHost:
      process.env.DATABRICKS_HOST ||
      (process.env.LAKEBASE_TEST_HOST ?? "https://workspace.invalid"),
    githubOwner: owner,
    createGithubRepo: true,
    privateRepo: true,
    language: cfg.language,
    runnerType: "self-hosted",
    tiers: 2,
    enableTdd: false,
    enableE2e: false,
    enableInfra: false,
    skipCommands: true,
  });
  const projectDir = result.projectDir;
  console.log(`  [setup] createProject succeeded at ${projectDir}`);

  const initialState = readState(projectDir);
  expect(initialState.state).toBe("scaffold-complete");
  expect(initialState.tier_topology).toBe(2);
  expect(initialState.project_id).toBe(projectName);

  // ─── 1. CLAIM ─────────────────────────────────────────────────
  const featureId = `F1-${cfg.tool}-roundtrip`;
  console.log(`  [step 1] lakebase-scm-claim-feature-branch ${featureId}`);
  const claim = runCli(
    CLI.claim,
    [featureId, "--project-dir", projectDir],
    projectDir,
  );
  logCli("claim", claim);
  expect(claim.status).toBe(0);

  const stateAfterClaim = readState(projectDir);
  expect(stateAfterClaim.state).toBe("feature-claimed");
  expect(stateAfterClaim.feature_id).toBe(featureId.toLowerCase());
  expect(stateAfterClaim.parent_branch).toBe("staging");

  // ─── 2. WRITE THE MIGRATION ───────────────────────────────────
  const markerTable = `live_e2e_marker_${cfg.tool}_${Date.now()}`;
  cfg.writeMigration({ projectDir, markerTable });
  // Log the dirty state for diagnostics; the substrate's claim +
  // post-checkout may have left other untracked files (e.g. .env
  // already in .gitignore, or scaffold artifacts not yet tracked).
  // Then stage EVERYTHING. The test mirrors a real user's `git add -A`
  // pattern: the migration plus any substrate-produced files in the
  // same commit. prepare-pr requires a clean tree, so anything the
  // claim left behind must be committed too (or stashed; we go with
  // commit to keep the round-trip end-to-end visible in git history).
  const dirty = execFileSync("git", ["status", "--porcelain"], {
    cwd: projectDir,
    encoding: "utf8",
  });
  if (dirty.trim()) {
    console.log(
      `  [step 2] git status --porcelain before commit:\n${dirty
        .split("\n")
        .filter((l) => l)
        .map((l) => `    ${l}`)
        .join("\n")}`,
    );
  }
  git(projectDir, ["add", "-A"]);
  gitCommit(
    projectDir,
    owner,
    `live test: ${cfg.tool} migration round-trip (${markerTable})`,
  );
  console.log(
    `  [step 2] committed ${cfg.tool} migration creating ${markerTable}`,
  );

  // ─── 3. PREPARE-PR ────────────────────────────────────────────
  console.log("  [step 3] lakebase-scm-prepare-pr");
  const prepare = runCli(
    CLI.prepare,
    [
      "--project-dir",
      projectDir,
      "--title",
      `live e2e: ${cfg.tool} round-trip`,
      "--body",
      `Live integration test for the SCM workflow + ${cfg.tool} migration round-trip.`,
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

  // ─── 4. WAIT-CI ───────────────────────────────────────────────
  console.log("  [step 4] lakebase-scm-wait-ci (expecting green)");
  const waitCi = runCli(CLI.waitCi, ["--project-dir", projectDir], projectDir);
  logCli("wait-ci", waitCi);
  expect(waitCi.status).toBe(0);

  const stateAfterCi = readState(projectDir);
  expect(stateAfterCi.state).toBe("ci-green");
  expect(stateAfterCi.ci_run_url).toBeTruthy();

  // 4a: migration round-trip on ci-pr-N
  const ciPrBranch = `ci-pr-${pullNumber(stateAfterCi.pr_url!)}`;
  console.log(
    `  [step 4a] querying Lakebase schema on ${ciPrBranch} for ${markerTable}`,
  );
  await assertTableExists({
    instance: projectName,
    branch: ciPrBranch,
    table: markerTable,
  });

  // 4b: JDK probe regression assertion on pr.yml run
  const ciSteps = await fetchRunSteps(
    octokit,
    owner,
    projectName,
    stateAfterCi.ci_run_url!,
  );
  assertJdkProbeOutcome(ciSteps, cfg.expectJdkStepsToRun);

  // ─── 5. MERGE --wait-migrate ──────────────────────────────────
  console.log("  [step 5] lakebase-scm-merge --wait-migrate");
  const merge = runCli(
    CLI.merge,
    ["--project-dir", projectDir, "--method", "squash"],
    projectDir,
  );
  logCli("merge", merge);
  expect(merge.status).toBe(0);

  const stateAfterMerge = readState(projectDir);
  expect(stateAfterMerge.state).toBe("merged");
  expect(stateAfterMerge.migrate_run_url).toMatch(
    /^https:\/\/github\.com\/.+\/actions\/runs\/\d+$/,
  );

  // 5a: migration round-trip on the parent branch (staging)
  console.log(
    `  [step 5a] querying Lakebase schema on staging for ${markerTable}`,
  );
  await assertTableExists({
    instance: projectName,
    branch: "staging",
    table: markerTable,
  });

  // 5b: JDK probe regression on merge.yml run
  const migrateSteps = await fetchRunSteps(
    octokit,
    owner,
    projectName,
    stateAfterMerge.migrate_run_url!,
  );
  assertJdkProbeOutcome(migrateSteps, cfg.expectJdkStepsToRun);

  return { projectName, fullRepoName, projectDir, parentDir, owner, octokit };
}

/**
 * Best-effort teardown matching the kit convention: deregister runner,
 * delete GitHub repo, delete Lakebase project, rm local dir. Each step
 * is independently try/catched so a partial failure still cleans up
 * what it can.
 */
export async function teardownScmWorkflowMigrationE2E(
  ctx: ScmWorkflowMigrationE2EContext,
): Promise<void> {
  try {
    await removeRunner({
      fullRepoName: ctx.fullRepoName,
      projectName: ctx.projectName,
    });
    console.log("  [teardown] runner deregistered");
  } catch (e) {
    console.log(`  [teardown] removeRunner failed: ${(e as Error).message}`);
  }
  try {
    await ctx.octokit.rest.repos.delete({
      owner: ctx.owner,
      repo: ctx.projectName,
    });
    console.log("  [teardown] github repo deleted");
  } catch (e) {
    console.log(`  [teardown] repo delete failed: ${(e as Error).message}`);
  }
  try {
    execFileSync(
      "databricks",
      ["postgres", "delete-project", `projects/${ctx.projectName}`],
      { stdio: "ignore" },
    );
    console.log("  [teardown] lakebase project deleted");
  } catch (e) {
    console.log(`  [teardown] lakebase delete failed: ${(e as Error).message}`);
  }
  try {
    fs.rmSync(ctx.parentDir, { recursive: true, force: true });
    console.log("  [teardown] local project dir removed");
  } catch {
    /* best-effort */
  }
}

/**
 * Print the recovery commands the user can run if the test failed
 * and they want to clean up by hand. Used in afterAll when allPassed
 * is false.
 */
export function printLeaveIntactNotice(
  ctx: ScmWorkflowMigrationE2EContext,
): void {
  console.log("");
  console.log("[LEAVE-INTACT] Skipping teardown (test failed).");
  console.log("         To clean up manually:");
  console.log(`           gh repo delete ${ctx.fullRepoName} --yes`);
  console.log(
    `           databricks postgres delete-project projects/${ctx.projectName}`,
  );
  console.log(
    `           node -e 'import("@databricks-solutions/lakebase-app-dev-kit/lakebase").then(m =>` +
      ` m.removeRunner({fullRepoName: "${ctx.fullRepoName}", projectName: "${ctx.projectName}"}))'`,
  );
  console.log(`           rm -rf ${ctx.parentDir}`);
}
