// /design intake precondition.
//
// Intake artifacts (product-overview.md + nfrs.md, the per-feature
// feature-request.md, and design-brief.md for UI projects) are INPUTS the design
// roles read, not gate deliverables: product-overview.md / nfrs.md are
// project-level and LIVING (refined across sprints), so they are a PRECONDITION,
// not a tamper-evident gate. /design refuses to enter phase 1 unless they exist
// and conform; the orchestrator produces them (interactive interview, or Human
// Proxy supply in headless) to satisfy the check.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkArtifactConformance } from "./artifact-conformance.js";
import { resolveTddDir, featureRequestMd } from "./sftdd-paths.js";
import { resolveSftddSettings } from "./sftdd-config.js";

export interface IntakeCheckArgs {
  /** Artifact root. Default ./.sftdd (honors a legacy ./.tdd) */
  tddDir?: string;
  /** When set, also require this feature's feature-request.md. */
  featureId?: string;
  /** Project root that holds `.lakebase/sftdd-config.json`. Defaults to the
   *  parent of `tddDir`. Locates the config that supplies `uiTrack`. */
  projectDir?: string;
}

export interface IntakeArtifactStatus {
  artifact: string;
  path: string;
  present: boolean;
  conformant: boolean;
  violations: string[];
}

export interface IntakeCheckResult {
  ok: boolean;
  statuses: IntakeArtifactStatus[];
  /** Required artifacts that are absent. */
  missing: string[];
  /** Required artifacts present but non-conformant. */
  nonConformant: string[];
}

/**
 * Verify the intake artifacts /design requires before phase 1. product-overview.md
 * + nfrs.md are always required; feature-request.md when a featureId is given;
 * design-brief.md when the project is a UI project (read from `project.uiTrack` in
 * sftdd-config.json). Returns the per-artifact status plus the missing /
 * non-conformant lists.
 */
export function checkIntakePreconditions(args: IntakeCheckArgs = {}): IntakeCheckResult {
  const tddDir = args.tddDir ?? resolveTddDir();
  const projectDir = args.projectDir ?? dirname(tddDir);
  // The one way in for the UX track: the persisted project setting, not a flag.
  const uiTrack = resolveSftddSettings({ projectDir }).project.uiTrack;

  const required: Array<{ artifact: string; path: string }> = [
    { artifact: "product-overview.md", path: join(tddDir, "product-overview.md") },
    { artifact: "nfrs.md", path: join(tddDir, "nfrs.md") },
  ];
  if (uiTrack) {
    required.push({ artifact: "design-brief.md", path: join(tddDir, "design", "design-brief.md") });
  }
  if (args.featureId) {
    // featureRequestMd resolves the on-disk feature dir (exact or <id>-<slug>),
    // falling back to the exact path when it does not exist yet (reports absent).
    required.push({ artifact: "feature-request.md", path: featureRequestMd(tddDir, args.featureId) });
  }

  const statuses: IntakeArtifactStatus[] = required.map(({ artifact, path }) => {
    if (!existsSync(path)) {
      return { artifact, path, present: false, conformant: false, violations: [] };
    }
    const result = checkArtifactConformance(artifact, readFileSync(path, "utf8"));
    return {
      artifact,
      path,
      present: true,
      conformant: result.ok,
      violations: result.ok ? [] : result.violations,
    };
  });

  const missing = statuses.filter((s) => !s.present).map((s) => s.artifact);
  const nonConformant = statuses.filter((s) => s.present && !s.conformant).map((s) => s.artifact);
  return { ok: missing.length === 0 && nonConformant.length === 0, statuses, missing, nonConformant };
}
