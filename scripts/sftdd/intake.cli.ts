#!/usr/bin/env node
// CLI: /design intake precondition check.
//
//   lakebase-sftdd-intake                         # require product-overview.md + nfrs.md
//   lakebase-sftdd-intake --feature F1-x          # + that feature's feature-request.md
//   lakebase-sftdd-intake --ui                    # + design/design-brief.md (UI projects)
//   lakebase-sftdd-intake --json --pretty
//
// /design calls this BEFORE phase 1 and refuses to proceed when it fails, so
// the HIL intake (product-overview.md / nfrs.md / ...) can never be skipped.
// Exit codes: 0 satisfied, 2 bad args, 5 precondition unmet (missing or
// non-conformant intake artifact).

import { isCliEntry } from "../util/cli-entry.js";
import { checkIntakePreconditions } from "./intake.js";

export function runIntakeCli(argv: string[]): number {
  let featureId: string | undefined;
  let ui = false;
  let tddDir: string | undefined;
  let json = false;
  let pretty = false;
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": featureId = argv[++i]; break;
      case "--ui": ui = true; break;
      case "--tdd-dir": tddDir = argv[++i]; break;
      case "--json": json = true; break;
      case "--pretty": pretty = true; break;
      case "-h":
      case "--help":
        process.stdout.write(
          "lakebase-sftdd-intake [--feature <id>] [--ui] [--tdd-dir <path>] [--json] [--pretty]\n" +
            "Verifies the HIL intake artifacts /design requires before phase 1.\n",
        );
        return 0;
    }
  }

  const result = checkIntakePreconditions({ tddDir, featureId, ui });
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, pretty ? 2 : 0)}\n`);
  } else if (result.ok) {
    process.stdout.write(`lakebase-sftdd-intake: intake satisfied (${result.statuses.length} artifact(s) present + conformant)\n`);
  } else {
    if (result.missing.length > 0) {
      process.stderr.write(`lakebase-sftdd-intake: MISSING intake artifact(s): ${result.missing.join(", ")}\n`);
    }
    for (const s of result.statuses.filter((s) => s.present && !s.conformant)) {
      process.stderr.write(`lakebase-sftdd-intake: non-conformant ${s.artifact}: ${s.violations.join("; ")}\n`);
    }
    process.stderr.write("lakebase-sftdd-intake: /design cannot proceed; the orchestrator must facilitate intake (interview the human, or Human Proxy supply in headless) first.\n");
  }
  return result.ok ? 0 : 5;
}

if (isCliEntry(import.meta.url)) {
  process.exit(runIntakeCli(process.argv.slice(2)));
}
