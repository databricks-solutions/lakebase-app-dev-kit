#!/usr/bin/env node
// CLI: the /deploy phase. Ship a built feature to a target and verify reachable.
//
//   lakebase-tdd-deploy --target local --project-dir .          # start + poll-reachable
//   lakebase-tdd-deploy --target local --project-dir . --stop   # tear down
//   lakebase-tdd-deploy --target local --json
//
// Only `type: local` targets are implemented; remote types are refused with a
// clear message. Exit codes: 0 ok, 2 bad args, 6 deploy failed.

import { isCliEntry } from "../util/cli-entry.js";
import { deployToTarget, stopLocal } from "./deploy.js";

export async function runDeployCli(argv: string[]): Promise<number> {
  let target: string | undefined;
  let projectDir = ".";
  let stop = false;
  let json = false;
  let lakebaseBranch: string | undefined;
  let featureId: string | undefined;
  let storyId: string | undefined;
  let tddDir: string | undefined;
  let gate = false;
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--target": target = argv[++i]; break;
      case "--project-dir": projectDir = argv[++i]; break;
      case "--lakebase-branch": lakebaseBranch = argv[++i]; break;
      case "--feature": featureId = argv[++i]; break;
      case "--story": storyId = argv[++i]; break;
      case "--tdd-dir": tddDir = argv[++i]; break;
      case "--gate": gate = true; break;
      case "--stop": stop = true; break;
      case "--json": json = true; break;
      case "-h":
      case "--help":
        process.stdout.write(
          "lakebase-tdd-deploy --target <name> [--project-dir <dir>] [--feature <id>] [--story <id>] [--lakebase-branch <branch>] [--stop] [--json]\n" +
            "Ships a built feature to a target and verifies it is reachable. Only 'local' is implemented.\n" +
            "--feature writes features/<F>/deploy-evidence.json (the deploy gate's artifact);\n" +
            "--story (with --feature) writes it at story scope + binds the run to the story's experiment branch;\n" +
            "--lakebase-branch binds the run command to a story's experiment branch DB (per-story deploy).\n",
        );
        return 0;
    }
  }
  if (!target) {
    process.stderr.write("Error: --target is required.\n");
    return 2;
  }

  if (stop) {
    const r = stopLocal(projectDir, target);
    process.stdout.write(`lakebase-tdd-deploy: ${r.stopped ? "stopped" : "nothing to stop"} (${target})\n`);
    return 0;
  }

  const result = await deployToTarget({
    projectDir,
    targetName: target,
    lakebaseBranch,
    featureId,
    storyId,
    tddDir,
    // Gate mode (orchestration-run deploy): reject a foreign occupant of the
    // port so we never verify against the wrong app, and record honest evidence.
    rejectForeignPort: gate,
  });
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (result.ok) {
    process.stdout.write(`lakebase-tdd-deploy: ${target} reachable at ${result.url} (pid ${result.pid})\n`);
  } else {
    process.stderr.write(`lakebase-tdd-deploy: ${target} deploy failed: ${result.reason}\n`);
  }
  // Gate deploys are run by the orchestration: a failure is recorded as honest
  // deploy-evidence + an escalation, and the deterministic driver routes that to
  // a raise-to-hil halt. Exit 0 so the failure does not crash the drive mid-loop
  // (the recorded evidence/escalation is the signal, not the exit code). The
  // interactive /deploy CLI (no --gate) keeps exit 6 on failure.
  if (gate) return 0;
  return result.ok ? 0 : 6;
}

if (isCliEntry(import.meta.url)) {
  runDeployCli(process.argv.slice(2)).then((code) => process.exit(code));
}
