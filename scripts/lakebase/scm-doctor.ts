// SCM workflow doctor (FEIP-7458 phase C+): read-only diagnostic that
// cross-checks .lakebase/workflow-state.json against the actual git +
// Lakebase + .env state and reports inconsistencies.
//
// Phase C ships --fix <id> for a curated set of findings (env-branch-
// drift, head-branch-drift, tier-topology-mismatch, orphan-current-
// branch). Each fix maps to one shell command, executed only when the
// finding is present in the current report; unsupported fix ids return
// an error rather than performing a related-but-different remediation.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  getBranchByName,
  listBranches,
  type LakebaseBranchInfo,
} from "./branch-utils.js";
import { getCurrentBranch } from "../git/inspect.js";
import { adoptScmState, inferTierTopology } from "./scm-adopt-state.js";
import { recoverOrphans } from "./scm-recover-orphans.js";
import {
  readWorkflowState,
  type ScmWorkflowState,
  type TierTopology,
} from "./scm-workflow-state.js";
import { sanitizeBranchName } from "../util/sanitize-branch-name.js";
import { findStaleBranches } from "../tdd/stale-branches.js";
import { exec } from "../util/exec.js";
import { collapseMigrationHeads } from "./schema-migrate.js";
import { updateEnvConnection } from "./env-file.js";

export type DoctorSeverity = "ok" | "warn" | "fail";

export interface DoctorFinding {
  id: string;
  severity: DoctorSeverity;
  message: string;
  /** One-line shell command the user can run to address this. */
  suggestion?: string;
}

export interface DoctorArgs {
  projectDir: string;
  /** Lakebase project id. Required to reach the Lakebase side. */
  instance?: string;
}

export interface DoctorReport {
  projectDir: string;
  workflowStatePresent: boolean;
  state?: ScmWorkflowState;
  inferredTierTopology?: TierTopology;
  findings: DoctorFinding[];
  /** Convenience aggregate. */
  worstSeverity: DoctorSeverity;
}

const FEATURE_PREFIX = "feature/";
const TIER_LEAFS = new Set(["staging", "dev"]);

function readEnv(projectDir: string): Map<string, string> {
  const envPath = path.join(projectDir, ".env");
  const out = new Map<string, string>();
  if (!fs.existsSync(envPath)) return out;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) out.set(m[1], m[2].replace(/^["']|["']$/g, ""));
  }
  return out;
}

function leafOf(b: LakebaseBranchInfo): string {
  return b.name.split("/").pop() ?? b.name;
}

function worstOf(a: DoctorSeverity, b: DoctorSeverity): DoctorSeverity {
  const order: DoctorSeverity[] = ["ok", "warn", "fail"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))] as DoctorSeverity;
}

export async function runDoctor(args: DoctorArgs): Promise<DoctorReport> {
  const projectDir = args.projectDir;
  const findings: DoctorFinding[] = [];
  const env = readEnv(projectDir);
  const instance = args.instance ?? env.get("LAKEBASE_PROJECT_ID");
  const state = readWorkflowState(projectDir);
  const workflowStatePresent = state !== null;

  // 0. Stale spikes + experiments (FEIP-7566), named distinctly. Hermetic
  // (reads .tdd records only), so it runs even without a Lakebase instance.
  for (const stale of findStaleBranches(path.join(projectDir, ".tdd"))) {
    const where = stale.feature_id ? ` ${stale.feature_id}/${stale.story_id}` : "";
    findings.push({
      id: `stale-${stale.kind}`,
      severity: "warn",
      message: `Stale ${stale.kind}${where} "${stale.slug}"${stale.branch ? ` (branch ${stale.branch})` : ""}: ${stale.reason}.`,
      suggestion:
        stale.kind === "experiment"
          ? `lakebase-tdd-experiment discard --feature ${stale.feature_id} --story ${stale.story_id} --slug ${stale.slug} --instance <id> --approver <you> --reason "doctor: stale experiment"`
          : "lakebase-tdd-spike teardown (or delete the spike's paired branch) once its learning has carried forward",
    });
  }

  // 1. workflow-state present?
  if (!workflowStatePresent) {
    findings.push({
      id: "no-state-file",
      severity: "fail",
      message:
        "No .lakebase/workflow-state.json. Either the project pre-dates the SCM workflow or scaffold did not seed it.",
      suggestion: "lakebase-scm-adopt-state",
    });
  }

  // 2. .env reachability
  if (!env.has("LAKEBASE_PROJECT_ID")) {
    findings.push({
      id: "env-missing-project-id",
      severity: "fail",
      message:
        ".env does not contain LAKEBASE_PROJECT_ID. The post-checkout hook will exit early; workflow CLIs will need an explicit --instance.",
      suggestion: "Set LAKEBASE_PROJECT_ID=<your project id> in .env",
    });
  }
  if (!instance) {
    // Without an instance we cannot cross-check the Lakebase side.
    return finalize({
      projectDir,
      workflowStatePresent,
      state: state ?? undefined,
      findings,
    });
  }

  // 3. Reach Lakebase + infer tier topology
  let lakebaseBranches: LakebaseBranchInfo[] = [];
  try {
    lakebaseBranches = await listBranches({ instance });
  } catch (err) {
    findings.push({
      id: "lakebase-unreachable",
      severity: "fail",
      message: `Could not list Lakebase branches for instance ${instance}: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: "databricks auth login (or check DATABRICKS_CONFIG_PROFILE).",
    });
    return finalize({
      projectDir,
      workflowStatePresent,
      state: state ?? undefined,
      findings,
    });
  }
  const inferredTopology = inferTierTopology(lakebaseBranches);
  if (state && state.tier_topology !== inferredTopology) {
    findings.push({
      id: "tier-topology-mismatch",
      severity: "warn",
      message: `workflow-state records tier_topology=${state.tier_topology}, but the Lakebase tier inventory suggests ${inferredTopology}.`,
      suggestion: "lakebase-scm-adopt-state --force",
    });
  }

  // 4. Cross-check workflow state with the world
  const headBranch = await getCurrentBranch({ cwd: projectDir });
  if (state && state.state === "feature-claimed") {
    if (state.branch && headBranch && headBranch !== state.branch) {
      findings.push({
        id: "head-branch-drift",
        severity: "warn",
        message: `workflow says feature-claimed for "${state.branch}", but HEAD is on "${headBranch}".`,
        suggestion: `git checkout '${state.branch}'`,
      });
    }
    if (state.branch) {
      const sanitized = sanitizeBranchName(state.branch);
      let pair: LakebaseBranchInfo | undefined;
      try {
        pair = await getBranchByName(sanitized, { instance });
      } catch {
        pair = undefined;
      }
      if (!pair) {
        findings.push({
          id: "lakebase-pair-missing",
          severity: "fail",
          message: `workflow says feature-claimed for "${state.branch}", but no Lakebase branch "${sanitized}" exists.`,
          suggestion: `lakebase-scm-abandon-feature  # reset state; re-claim if needed`,
        });
      } else if (state.lakebase_branch_uid && pair.uid !== state.lakebase_branch_uid) {
        findings.push({
          id: "lakebase-uid-drift",
          severity: "warn",
          message: `workflow records lakebase_branch_uid=${state.lakebase_branch_uid}, but the live branch reports ${pair.uid}.`,
          suggestion: "lakebase-scm-adopt-state --force",
        });
      }
    }
  }

  // 5. .env credentials match the current branch?
  if (state && state.state === "feature-claimed" && state.branch) {
    const envBranchId = env.get("LAKEBASE_BRANCH_ID");
    const sanitized = sanitizeBranchName(state.branch);
    if (envBranchId && envBranchId !== sanitized) {
      findings.push({
        id: "env-branch-drift",
        severity: "warn",
        message: `.env LAKEBASE_BRANCH_ID=${envBranchId} but workflow says ${sanitized}. The post-checkout hook may not have run since the last branch switch.`,
        suggestion: `git checkout '${state.branch}'  # re-fires post-checkout`,
      });
    }
  }

  // 6. Orphan git branches?
  // Conservative: only flag the current branch as orphan (a deep scan
  // is in lakebase-scm-recover-orphans). The doctor is read-only and
  // wants the report to be quick.
  if (
    headBranch &&
    !TIER_LEAFS.has(headBranch) &&
    headBranch.startsWith(FEATURE_PREFIX)
  ) {
    const sanitized = sanitizeBranchName(headBranch);
    const paired = lakebaseBranches.some((b) => leafOf(b) === sanitized);
    if (!paired) {
      findings.push({
        id: "orphan-current-branch",
        severity: "fail",
        message: `Current git branch "${headBranch}" has no Lakebase pair (post-checkout fallback retired in phase C).`,
        suggestion: `lakebase-scm-recover-orphans --claim --only-branch '${headBranch}'`,
      });
    }
  }

  // 7. Sanity for ci-green that hasn't been merged in a while
  // (No clock-vs-state heuristics in this first cut; deliberate.)

  // 8. Multiple migration heads (a sibling merge that skipped the collapse).
  // Best-effort + non-mutating (dry-run): only DAG tools (Alembic) can report
  // >1 head; flat-list tools no-op. Skip silently if the tool can't be
  // resolved or its CLI isn't installed here, that is not a determinable fault.
  try {
    const heads = await collapseMigrationHeads({ projectDir, dryRun: true });
    if (heads.headsBefore.length > 1) {
      findings.push({
        id: "multiple-migration-heads",
        severity: "fail",
        message: `Migrations have ${heads.headsBefore.length} heads (${heads.headsBefore.join(", ")}); a sibling-feature merge left them un-collapsed. \`upgrade head\` will refuse until they are unified.`,
        suggestion: "lakebase-tdd-collapse-heads",
      });
    }
  } catch {
    // tool unresolved / CLI absent / no project: not a determinable fault.
  }

  return finalize({
    projectDir,
    workflowStatePresent,
    state: state ?? undefined,
    inferredTierTopology: inferredTopology,
    findings,
  });
}

function finalize(report: Omit<DoctorReport, "worstSeverity">): DoctorReport {
  let worst: DoctorSeverity = "ok";
  for (const f of report.findings) {
    worst = worstOf(worst, f.severity);
  }
  return { ...report, worstSeverity: worst };
}

export class ScmDoctorFixError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "finding-not-present"
      | "unsupported-finding"
      | "fix-failed",
  ) {
    super(message);
    this.name = "ScmDoctorFixError";
  }
}

/** Findings the doctor can auto-fix. Others require manual intervention. */
export const FIXABLE_FINDING_IDS = [
  "env-branch-drift",
  "head-branch-drift",
  "tier-topology-mismatch",
  "orphan-current-branch",
  "multiple-migration-heads",
] as const;

export type FixableFindingId = (typeof FIXABLE_FINDING_IDS)[number];

export interface FixFindingArgs {
  projectDir: string;
  instance?: string;
  findingId: FixableFindingId;
  /** Use the supplied report instead of re-running runDoctor (for tests). */
  report?: DoctorReport;
}

export interface FixFindingResult {
  /** Finding that was acted on. */
  findingId: FixableFindingId;
  /** One-line summary of the remediation that ran. */
  action: string;
  /** Doctor report captured after the remediation. */
  postReport: DoctorReport;
}

/**
 * Apply a targeted remediation for one finding. Refuses if the
 * finding isn't present in the current report (so the user can't
 * accidentally run a `--fix` against a stale plan). Refuses on
 * unsupported finding ids.
 */
export async function fixFinding(
  args: FixFindingArgs,
): Promise<FixFindingResult> {
  if (!FIXABLE_FINDING_IDS.includes(args.findingId)) {
    throw new ScmDoctorFixError(
      `Finding "${args.findingId}" is not supported by --fix. Supported: ${FIXABLE_FINDING_IDS.join(", ")}.`,
      "unsupported-finding",
    );
  }
  const report =
    args.report ??
    (await runDoctor({ projectDir: args.projectDir, instance: args.instance }));
  const present = report.findings.find((f) => f.id === args.findingId);
  if (!present) {
    throw new ScmDoctorFixError(
      `Finding "${args.findingId}" is not present in the current report. Re-run lakebase-scm-doctor to see what needs fixing.`,
      "finding-not-present",
    );
  }

  let action = "";
  try {
    switch (args.findingId) {
      case "env-branch-drift": {
        // Rewrite .env's LAKEBASE_BRANCH_ID line directly. Earlier
        // versions of this fix ran `git checkout <state.branch>` and
        // expected the post-checkout hook to resync .env, but that
        // path has two failure modes that left users stuck:
        //   1. If git's HEAD was already on state.branch, the
        //      checkout was a no-op for HEAD-change purposes and the
        //      post-checkout hook (which gates on a real branch
        //      switch in some setups) silently did nothing.
        //   2. post-checkout bails early on databricks CLI auth
        //      failure, leaving .env untouched even when the
        //      workflow-state.json knew the right branch.
        // The drift this finding flags is purely about the
        // LAKEBASE_BRANCH_ID line; updateEnvConnection rewrites just
        // the connection block (preserving every other line) and
        // doesn't depend on the post-checkout chain. Credentials
        // (DATABASE_URL / DB_USERNAME / DB_PASSWORD / LAKEBASE_HOST)
        // are left empty here; the next post-checkout (or a manual
        // mint) refreshes them. The BRANCH_ID is the load-bearing
        // value -- everything else can be re-derived.
        const branch = report.state?.branch;
        if (!branch) {
          throw new ScmDoctorFixError(
            "Cannot fix: workflow state has no branch field.",
            "fix-failed",
          );
        }
        const sanitized = sanitizeBranchName(branch);
        updateEnvConnection({
          envPath: path.join(args.projectDir, ".env"),
          branchId: sanitized,
          databaseUrl: "",
          username: "",
          password: "",
        });
        action = `rewrote .env LAKEBASE_BRANCH_ID=${sanitized} (credentials left empty; next post-checkout or manual mint refreshes them)`;
        break;
      }
      case "head-branch-drift": {
        const branch = report.state?.branch;
        if (!branch) {
          throw new ScmDoctorFixError(
            "Cannot fix: workflow state has no branch field.",
            "fix-failed",
          );
        }
        await exec(`git checkout ${shellEscape(branch)}`, {
          cwd: args.projectDir,
          timeout: 15_000,
        });
        action = `git checkout ${branch} (re-fires post-checkout to resync HEAD)`;
        break;
      }
      case "tier-topology-mismatch": {
        const instance = args.instance ?? report.state?.project_id;
        if (!instance) {
          throw new ScmDoctorFixError(
            "Cannot fix: missing Lakebase project id.",
            "fix-failed",
          );
        }
        await adoptScmState({
          projectDir: args.projectDir,
          instance,
          force: true,
        });
        action = `adopted state with --force to re-infer tier_topology`;
        break;
      }
      case "orphan-current-branch": {
        const instance = args.instance ?? report.state?.project_id;
        if (!instance) {
          throw new ScmDoctorFixError(
            "Cannot fix: missing Lakebase project id.",
            "fix-failed",
          );
        }
        const headBranch = await getCurrentBranch({ cwd: args.projectDir });
        if (!headBranch) {
          throw new ScmDoctorFixError(
            "Cannot fix: detached HEAD or no current branch.",
            "fix-failed",
          );
        }
        await recoverOrphans({
          projectDir: args.projectDir,
          instance,
          claim: true,
          onlyBranch: headBranch,
        });
        action = `recovered orphan ${headBranch} via createFeaturePairedBranch`;
        break;
      }
      case "multiple-migration-heads": {
        const r = await collapseMigrationHeads({ projectDir: args.projectDir });
        if (r.status !== "ok" || !r.mergeRevision) {
          throw new ScmDoctorFixError(
            `Expected to create a merge revision but got status="${r.status}".`,
            "fix-failed",
          );
        }
        action = `collapsed ${r.headsBefore.length} heads into merge revision ${r.mergeRevision} (commit it)`;
        break;
      }
    }
  } catch (err) {
    if (err instanceof ScmDoctorFixError) throw err;
    throw new ScmDoctorFixError(
      `Remediation failed: ${err instanceof Error ? err.message : String(err)}`,
      "fix-failed",
    );
  }

  const postReport = await runDoctor({
    projectDir: args.projectDir,
    instance: args.instance,
  });
  return { findingId: args.findingId, action, postReport };
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
