// Orchestrator for `lakebase create-project` – bootstrap a fresh
// Lakebase-paired project.
//
// Wired in. All NotYetPortedError stubs are now real calls to
// the modules under scripts/. Mirrors ProjectCreationService.createProject
// from the extension; sync back to the extension via.

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { writeEnvFile } from "./env-file.js";
import { verifyProject, verifyHooks, verifyWorkflows } from "./project-verify.js";
import { createRepo, getRepoFullName, getCurrentUser } from "../github/repo.js";
import { cloneRepo } from "../git/clone.js";
import { gitInit } from "../git/init.js";
import { commitAndPush } from "../git/commit-push.js";
import {
  createLakebaseProject,
  getDefaultBranchId,
} from "./lakebase-project.js";
import { scaffoldAll } from "./scaffold.js";
import { createLongRunningBranch } from "./long-running-branch.js";
import { enableE2eForProject } from "./enable-e2e.js";
import { enableInfraForProject } from "./enable-infra.js";
import { setupRunner } from "./runner-setup.js";
import { syncCiSecrets } from "../util/ci-secrets.js";
import { delay } from "../util/delay.js";
import {
  initWorkflowState,
  writeWorkflowState,
} from "./scm-workflow-state.js";
import type { AgentRole } from "../tdd/agent-log.js";
import { defaultTddConfig, writeTddConfig } from "../tdd/tdd-config.js";

export interface CreateProjectArgs {
  /** Project name (Lakebase project id and local directory name). */
  projectName: string;
  /** Parent directory where the project folder will be created. */
  parentDir: string;
  /** Databricks workspace host URL (trailing slashes are stripped). */
  databricksHost: string;
  /** GitHub owner – required when createGithubRepo is true. */
  githubOwner?: string;
  /** Whether to create a GitHub repository (default: true). */
  createGithubRepo?: boolean;
  /** Whether to make the GitHub repo private (default: true). */
  privateRepo?: boolean;
  /** Project language stack (default: 'java'). */
  language?: "java" | "kotlin" | "python" | "nodejs";
  /** CI runner type (default: 'self-hosted'). */
  runnerType?: "self-hosted" | "github-hosted";
  /**
   * Lakebase tier topology for this project. An architectural choice
   * the caller (typically a wizard) should surface to the user rather
   * than picking silently. Features are short-lived branches, NOT
   * tiers; they are not counted in this number.
   *
   *   1 (or undefined) - prod only. Features fork from prod.
   *   2                 - prod + staging. Features fork from staging.
   *                       Staging accumulates merged features between
   *                       release windows; releases promote staging
   *                       to prod via a separate PR.
   *   3                 - prod + staging + dev. Features fork from dev.
   *                       Dev accumulates day-to-day feature integration;
   *                       periodically dev is promoted to staging.
   *
   * Scaffolding cuts the extra tiers off prod (staging) and off staging
   * (dev) via `createLongRunningBranch` (Lakebase no_expiry + git push
   * to origin). When `tiers === 1` (or omitted), only the prod default
   * branch exists.
   */
  tiers?: 1 | 2 | 3;
  /** Lay down the .tdd/ scaffold from templates/tdd-bootstrap/ (default: true). */
  enableTdd?: boolean;
  /**
   * Wire Playwright into the project so `[E2E]`-tagged AC rows have a
   * runner: drops `playwright.config.ts` + `tests/e2e/smoke.spec.ts`,
   * adds `test:e2e` script + `@playwright/test` to `package.json`, and
   * appends an E2E block to `scripts/run-tests.sh`. Default: true for
   * `nodejs`, false otherwise. Java/Kotlin/Python projects can still
   * opt-in via `--enable-e2e`; the package.json patch is a no-op when
   * there is no package.json so the wire-up is partial (templates +
   * run-tests.sh only) until the project hand-rolls its own runner.
   * Phase 2.
   */
  enableE2e?: boolean;
  /**
   * Wire the [Infra]-tag runner into the project: adds a `test:infra`
   * script to package.json (which invokes the kit's
   * `lakebase-infra-runner` bin) and appends an infra block to
   * `scripts/run-tests.sh`. Default: true for `nodejs`, false otherwise
   * (mirrors the enableE2e default). Java/Kotlin/Python projects can
   * opt in via `--enable-infra`; the package.json patch is a no-op
   * when there is no package.json, so the wire-up is partial
   * (run-tests.sh only) until the project hand-rolls its own runner.
   */
  enableInfra?: boolean;
  /**
   * Skip the `.claude/commands/{design,build}.md` scaffold. Default:
   * false (commands are written). Set to true for projects that already
   * have their own slash commands they want to keep, or for non-Claude-Code
   * consumers that only use the substrate library.
   */
  skipCommands?: boolean;
  /**
   * Per-role model overrides for the TDD-workflow agents. Each role
   * carries a strongly-recommended model in its definition; this is where the
   * HIL overrides it for THIS project, asked at setup. Keyed by role name
   * (e.g. { "driver": "haiku", "spec-author": "opus" }). Omitted/empty means
   * every role uses its recommended model. Persisted to
   * .lakebase/agent-config.json (recommended seeded from the role defs).
   */
  agentModels?: Partial<Record<AgentRole, string>>;
}

export interface CreateProjectResult {
  projectDir: string;
  githubRepoUrl?: string;
  lakebaseProjectId: string;
  lakebaseDefaultBranch: string;
  warnings: string[];
}

export type ProgressCallback = (step: string, detail?: string) => void;

/**
 * Orchestrate the 10-step project creation.
 *
 *   1. Create GitHub repo (Octokit) – useGithub only
 *   2. Wait for repo visibility (SAML/propagation) – useGithub only
 *   3. Clone repo OR git init local dir
 *   4. Create Lakebase project (databricks postgres create-project)
 *   5. Resolve default branch id
 *   6. Scaffold templates (common + language-specific via Spring Initializr or static).
 *      Ships .env.example only – .env is never written or committed by this flow.
 *      First post-checkout populates .env from .env.example with a fresh JWT.
 *   7. Sync CI secrets (DATABRICKS_HOST / LAKEBASE_PROJECT_ID / DATABRICKS_TOKEN) – useGithub
 *   8. Set up self-hosted runner – useGithub + self-hosted only
 *   9. Initial commit + push (workflow-scope error surfaced clearly) – push only if useGithub
 *  10. Health check (verifyHooks + verifyWorkflows) – warnings reported, not fatal
 */
export async function createProject(
  input: CreateProjectArgs,
  progress?: ProgressCallback
): Promise<CreateProjectResult> {
  const report = progress ?? (() => {});
  const projectDir = path.join(input.parentDir, input.projectName);
  const lakebaseProjectId = input.projectName;
  const host = input.databricksHost.replace(/\/+$/, "");
  const useGithub = input.createGithubRepo !== false;
  const language = input.language ?? "java";
  const runnerType = input.runnerType ?? "self-hosted";
  const enableTdd = input.enableTdd !== false;
  // Phase 2: default-on for Node/React templates only. Java/
  // Kotlin/Python backends opt in explicitly. An undefined input.enableE2e
  // means "fall back to the language default"; an explicit boolean
  // overrides regardless of language.
  const enableE2e =
    input.enableE2e !== undefined ? input.enableE2e : language === "nodejs";
  const enableInfra =
    input.enableInfra !== undefined ? input.enableInfra : language === "nodejs";
  const skipCommands = input.skipCommands === true;
  const tiers = input.tiers;
  const warnings: string[] = [];

  if (useGithub && !input.githubOwner) {
    throw new Error("GitHub owner is required when creating a GitHub repository");
  }
  const fullRepoName = input.githubOwner
    ? `${input.githubOwner}/${input.projectName}`
    : "";

  // ── Step 1+2: GitHub repo + clone, OR local-only setup ────────
  if (useGithub) {
    report("Creating GitHub repository...", fullRepoName);
    await createRepo(fullRepoName, {
      private: input.privateRepo !== false,
      description: `Lakebase project: ${input.projectName}`,
    });

    report("Waiting for GitHub repo to be visible...", fullRepoName);
    const probeDelays = [1000, 2000, 3000, 5000, 8000];
    let probeErr = "";
    let visible = false;
    for (const waitMs of probeDelays) {
      try {
        await getRepoFullName(fullRepoName);
        visible = true;
        break;
      } catch (err) {
        probeErr = err instanceof Error ? err.message : String(err);
        await delay(waitMs);
      }
    }
    if (!visible) {
      let activeUser = "";
      try {
        activeUser = await getCurrentUser();
      } catch {
        /* ignore */
      }
      const samlHint = /SAML|scope does not match|sso/i.test(probeErr)
        ? "\n\nThe error mentions SAML – re-sign in to GitHub and authorize SSO for this org."
        : "";
      const userHint =
        activeUser && activeUser !== input.githubOwner
          ? `\n\nNote: signed in as "${activeUser}", but the repo was created under "${input.githubOwner}".`
          : "";
      throw new Error(
        `GitHub repo "${fullRepoName}" was created but isn't visible after ~19s of polling.${samlHint}${userHint}\n\nLast probe error:\n  ${probeErr.split("\n")[0].slice(0, 200)}`
      );
    }
    report("Cloning repository...", projectDir);
    await cloneRepo({
      repoUrl: `https://github.com/${fullRepoName}.git`,
      parentDir: input.parentDir,
    });
  } else {
    report("Creating local project directory...", projectDir);
    if (fs.existsSync(projectDir)) {
      throw new Error(`Directory already exists: ${projectDir}`);
    }
    fs.mkdirSync(projectDir, { recursive: true });
    await gitInit(projectDir);
  }

  // ── Step 3: Lakebase project ──────────────────────────────────
  report("Creating Lakebase database...", lakebaseProjectId);
  await createLakebaseProject({ projectId: lakebaseProjectId, host });

  // ── Step 4: Default branch lookup (non-fatal if not ready yet) ─
  report("Resolving database endpoint...");
  const defaultBranchId = await getDefaultBranchId({
    projectId: lakebaseProjectId,
    host,
  });

  // ── Step 5: Scaffold (templates + language project) ───────────
  report("Scaffolding project files...");
  await scaffoldAll({
    targetDir: projectDir,
    databricksHost: host,
    lakebaseProjectId,
    language,
    runnerType,
    skipCommands,
    report: (m, d) => report(m, d),
  });

  // ── Step 5b: .tdd/ scaffold (lakebase-tdd-workflows bootstrap) ────────
  if (enableTdd) {
    report("Scaffolding .tdd/ workflow directory...");
    layDownTddScaffold(projectDir);
  }

  // ── Step 5c: Playwright E2E wire-up (phase 2) ────────
  if (enableE2e) {
    report("Wiring Playwright E2E support...");
    const e2e = enableE2eForProject({ projectDir, language });
    if (e2e.templatesWritten.length > 0) {
      report(`  wrote ${e2e.templatesWritten.length} Playwright template(s)`);
    }
    if (e2e.packageJson.patched && (e2e.packageJson.scriptAdded || e2e.packageJson.depAdded)) {
      report("  patched package.json (test:e2e + @playwright/test)");
    } else if (!e2e.packageJson.patched) {
      report("  package.json absent, skipped npm wiring (non-Node project)");
    }
    if (e2e.runTestsScript.inserted) {
      report("  patched scripts/run-tests.sh");
    }
  }

  // ── Step 5d: [Infra]-tag runner wire-up ──────────────────
  if (enableInfra) {
    report("Wiring [Infra]-tag runner support...");
    const infra = enableInfraForProject({ projectDir });
    if (infra.packageJson.patched && infra.packageJson.scriptAdded) {
      report("  patched package.json (test:infra)");
    } else if (!infra.packageJson.patched) {
      report("  package.json absent, skipped npm wiring (non-Node project)");
    }
    if (infra.runTestsScript.inserted) {
      report("  patched scripts/run-tests.sh (infra block)");
    }
  }

  // (Step 6 – write .env – intentionally removed.)
  // Substrate ships .env.example only; .env is gitignored and never committed.
  // The post-checkout hook bootstraps .env from .env.example on first switch
  // and fills in the JWT-bearing connection material then. Keeping .env out
  // of the create flow eliminates the only path by which a real JWT could
  // end up staged in git.

  // ── Step 6: CI secrets (GitHub only) ──────────────────────────
  if (useGithub) {
    report("Setting up CI auth (service principal)...");
    try {
      await syncCiSecrets({
        projectDir,
        databricksHost: host,
        lakebaseProjectId,
        comment: "GitHub Actions CI",
        lifetimeSeconds: 86_400,
        ownerRepo: fullRepoName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`CI auth setup failed: ${msg}`);
      report(`Warning: CI auth setup failed (${msg})`);
    }
  }

  // ── Step 7: Self-hosted runner (GitHub + self-hosted only) ────
  if (useGithub && runnerType === "self-hosted") {
    report("Setting up self-hosted runner...");
    try {
      await setupRunner({
        fullRepoName,
        projectName: input.projectName,
        report: (m) => report(m),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Runner setup failed: ${msg}`);
      report(`Warning: runner setup failed (${msg}). CI workflows will queue until a runner is available.`);
    }
  } else if (useGithub) {
    report("Using GitHub-hosted runners – no local runner needed.");
  } else {
    report("Skipping runner setup (no GitHub repository).");
  }

  // ── Step 7c: SCM workflow-state seed (phase A) ──────
  // Stamp the scaffold-complete row so .lakebase/workflow-state.json
  // exists BEFORE the initial commit. The state file is intentionally
  // tracked in git (it is the gate surface phase B's transition CLIs
  // read + write); if it were written AFTER the initial commit it
  // would be left untracked, and every consumer would hit
  // "dirty-working-tree" on the next prepare-pr / abandon. The write
  // is best-effort: a failure surfaces as a warning rather than
  // aborting the scaffold, since the file is advisory until phase B.
  try {
    writeWorkflowState(
      projectDir,
      initWorkflowState({
        projectId: lakebaseProjectId,
        tierTopology: (tiers ?? 1) as 1 | 2 | 3,
      }),
    );
  } catch (err) {
    warnings.push(
      `SCM workflow-state seed failed (advisory): ${err instanceof Error ? err.message : String(err)}. Run lakebase-scm-state to inspect.`,
    );
  }

  // ── Step 7d: unified TDD run config ──────────
  // Seed .lakebase/tdd-config.json , the one declarative source for the per-role
  // + per-turn model/effort matrix and the build/plan/project knobs (the
  // orchestrator resolves file -> LAKEBASE_TDD_* env -> default). Seeded with each
  // role's recommended model + any HIL model overrides chosen at setup, and the
  // navigator REVIEW turn pinned to low effort (the fast judgment turn). Written
  // before the initial commit so it is tracked, like workflow-state.json.
  // Best-effort: a failure is a warning; the code defaults still apply.
  if (enableTdd) {
    try {
      const tddConfig = defaultTddConfig();
      for (const [role, model] of Object.entries(input.agentModels ?? {})) {
        if (model && tddConfig.roles?.[role as keyof typeof tddConfig.roles]) {
          tddConfig.roles[role as keyof typeof tddConfig.roles]!.model = model;
        }
      }
      writeTddConfig(projectDir, tddConfig);
    } catch (err) {
      warnings.push(
        `TDD config seed failed (advisory): ${err instanceof Error ? err.message : String(err)}. The role defaults still apply.`,
      );
    }
  }

  // ── Step 7e: pin the kit ref + warm the fast-CLI cache (npx-tax kill) ──
  // The scaffolded scripts/lk runs kit CLIs via `node dist/...` (~0.09s) instead
  // of npx-from-github (~3.5s/call, re-resolves the ref every time). lk resolves
  // the kit per ref into a shared cache. Record the ref this project was
  // scaffolded with WHEN PINNED (LAKEBASE_KIT_REF) so lk resolves it from a file
  // (a claude -p agent's bash does not inherit env); unset means lk defaults to
  // "main", matching today's npx default. Then warm the cache once so the first
  // workflow call is already fast. Best-effort: lk installs lazily on first use.
  if (enableTdd) {
    try {
      const kitRef = process.env.LAKEBASE_KIT_REF?.trim();
      if (kitRef) {
        const dir = path.join(projectDir, ".lakebase");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "kit-ref"), `${kitRef}\n`, "utf8");
      }
      const lk = path.join(projectDir, "scripts", "lk");
      if (fs.existsSync(lk)) {
        spawnSync("bash", [lk, "--warm"], { cwd: projectDir, stdio: "ignore", timeout: 180000 });
      }
    } catch (err) {
      warnings.push(
        `Kit fast-CLI cache warm failed (advisory): ${err instanceof Error ? err.message : String(err)}. scripts/lk installs lazily on first use.`,
      );
    }
  }

  // ── Step 8: Initial commit (+ push when GitHub configured) ────
  const langLabels: Record<string, string> = {
    java: "Java/Spring Boot",
    kotlin: "Kotlin/Spring Boot",
    python: "Python/FastAPI",
    nodejs: "Node.js/Express",
  };
  const langLabel = langLabels[language] ?? language;
  report("Creating initial commit...");
  await commitAndPush({
    projectDir,
    message: `Initial project scaffold (${langLabel} + Lakebase)`,
    push: useGithub,
  });

  // ── Step 8b: Long-running tier setup (architectural choice) ───
  // Tier semantics (features are NOT tiers, they are short-lived branches):
  //   tiers === 1 (default): prod only. No extra tiers cut.
  //   tiers === 2: cut staging (off prod).
  //   tiers === 3: cut staging (off prod) + dev (off staging).
  //
  // The substrate's createLongRunningBranch primitive is the only
  // supported path to cut a tier: it creates BOTH the Lakebase side
  // (no_expiry, forked from the named parent) AND the git side
  // (forked + pushed to origin), enforcing "every git branch gets a
  // Lakebase branch" for tiers too.
  //
  // Runs AFTER commitAndPush because createLongRunningBranch needs
  // origin to already have the parent ref (e.g. main, staging).
  if (tiers === 2 || tiers === 3) {
    if (!useGithub) {
      warnings.push(
        `tiers === ${tiers} requires a GitHub repository (createLongRunningBranch pushes the tier's git side to origin). Extra tiers were NOT cut.`,
      );
    } else {
      report(`Cutting staging tier (tiers=${tiers}) via createLongRunningBranch...`);
      try {
        await createLongRunningBranch({
          name: "staging",
          forkFromBranch: "main",
          projectId: lakebaseProjectId,
          workTreeDir: projectDir,
          databricksHost: host,
        });
      } catch (err) {
        warnings.push(
          `tiers === ${tiers} requested but createLongRunningBranch for staging failed: ${err instanceof Error ? err.message : String(err)}.`,
        );
      }

      if (tiers === 3) {
        report("Cutting dev tier (tiers=3) via createLongRunningBranch (off staging)...");
        try {
          await createLongRunningBranch({
            name: "dev",
            forkFromBranch: "staging",
            projectId: lakebaseProjectId,
            workTreeDir: projectDir,
            databricksHost: host,
          });
        } catch (err) {
          warnings.push(
            `tiers === 3 requested but createLongRunningBranch for dev failed: ${err instanceof Error ? err.message : String(err)}.`,
          );
        }
      }
    }
  }


  // ── Step 9: Health check (advisory) ───────────────────────────
  report("Verifying project...");
  const health = verifyProject(projectDir);
  for (const w of health.warnings) {
    warnings.push(w);
    report(`Warning: ${w}`);
  }

  report("Project created successfully!");
  if (enableTdd) {
    // Point the user at the convenient workflow launcher (scaffolded into
    // scripts/tdd.sh): it drives the deterministic orchestrator.
    report(`Next: cd ${projectDir} && ./scripts/tdd.sh plan`);
  }
  return {
    projectDir,
    githubRepoUrl: useGithub ? `https://github.com/${fullRepoName}` : undefined,
    lakebaseProjectId,
    lakebaseDefaultBranch: defaultBranchId,
    warnings,
  };
}

// Re-exports for callers that only need ported leaves.
export { writeEnvFile, verifyHooks, verifyWorkflows, verifyProject };

/**
 * Copy templates/tdd-bootstrap/.tdd/ into <targetDir>/.tdd/.
 *
 * Resolves the bootstrap source relative to this script's location so it works
 * both when the substrate is consumed via git URL (dist + src co-located) and
 * when it's invoked directly from a dev clone.
 *
 * Safe to call when <targetDir>/.tdd/ already exists – existing files are not
 * overwritten so a project that already started TDD work is preserved.
 */
export function layDownTddScaffold(targetDir: string): void {
  // Use the top-level fs + path imports. The prior implementation used
  // dynamic `require()` calls which break in the ESM bundle ("Dynamic
  // require of 'fs' is not supported"); tsup's shims: true gives us
  // __dirname-equivalent semantics via the top-of-file imports.
  const candidates = [
    path.resolve(__dirname, "../../templates/tdd-bootstrap/.tdd"),
    path.resolve(__dirname, "../../../templates/tdd-bootstrap/.tdd"),
  ];
  const source = candidates.find((c) => fs.existsSync(c));
  if (!source) {
    throw new Error(`tdd-bootstrap template not found; looked in: ${candidates.join(", ")}`);
  }
  const dest = path.join(targetDir, ".tdd");
  if (fs.existsSync(dest)) {
    return;
  }
  fs.cpSync(source, dest, { recursive: true });
}
