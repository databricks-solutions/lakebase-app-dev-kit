#!/usr/bin/env node
// CLI: print the CANONICAL feature branch name for a feature-id.
//
//   lakebase-scm-feature-branch <feature-id>
//
// Single source of truth for "what branch does this feature claim?": reuses
// sanitizeFeatureSlug + featureBranchName (which runs the substrate's
// sanitizeBranchName), so scripts and assertions never re-implement the
// sanitization. Exit codes: 0 ok (branch on stdout); 2 bad args / invalid id.

import { isCliEntry } from "../util/cli-entry.js";
import { sanitizeFeatureSlug, featureBranchName, ScmClaimError } from "./scm-claim-feature.js";

export function runScmFeatureBranchCli(argv: string[]): number {
  const featureId = argv.find((a) => !a.startsWith("-"));
  if (!featureId) {
    process.stderr.write("Usage: lakebase-scm-feature-branch <feature-id>\n");
    return 2;
  }
  try {
    process.stdout.write(`${featureBranchName(sanitizeFeatureSlug(featureId))}\n`);
    return 0;
  } catch (e) {
    const msg = e instanceof ScmClaimError ? e.message : (e as Error).message;
    process.stderr.write(`lakebase-scm-feature-branch: ${msg}\n`);
    return 2;
  }
}

if (isCliEntry(import.meta.url)) {
  process.exit(runScmFeatureBranchCli(process.argv.slice(2)));
}
