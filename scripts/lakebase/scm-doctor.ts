// SCM workflow doctor (FEIP-7458 phase C): read-only diagnostic that
// cross-checks .lakebase/workflow-state.json against the actual git +
// Lakebase + .env state and reports inconsistencies.
//
// Read-only first cut. The CLI prints a human-readable report; a
// future iteration can offer `--fix <check-id>` to apply targeted
// remediations (e.g. resync .env when LAKEBASE_BRANCH_ID drifts). For
// now, every finding ends with a one-line suggested command the user
// can run to address it.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  getBranchByName,
  listBranches,
  type LakebaseBranchInfo,
} from "./branch-utils.js";
import { getCurrentBranch } from "../git/inspect.js";
import { inferTierTopology } from "./scm-adopt-state.js";
import {
  readWorkflowState,
  type ScmWorkflowState,
  type TierTopology,
} from "./scm-workflow-state.js";
import { sanitizeBranchName } from "../util/sanitize-branch-name.js";

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
