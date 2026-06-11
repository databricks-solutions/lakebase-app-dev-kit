#!/usr/bin/env node
// lakebase-tdd-cycle: the substrate surface for TDD cycle bookkeeping.
//
// The ORCHESTRATION (deterministic driver) calls this around the pure
// Navigator/Driver agents. The agents never record cycles or touch git:
//   - Navigator writes the next failing test, then the driver runs:
//       lakebase-tdd-cycle begin --feature F --story S [--tdd-dir D]
//     to stamp the RED cycle for that test.
//   - Driver writes code + runs the project's test command, then the driver runs:
//       lakebase-tdd-cycle green --feature F --story S [--tdd-dir D]
//     to record the runner outcome + stamp GREEN.
//
// Exit: 0 ok; 2 bad args; 1 op failure (e.g. no open RED cycle to green).

import { join } from "path";
import {
  beginNextPendingCycle,
  greenOpenCycle,
  reviewAc,
  refactorAc,
  firstReviewPendingAc,
  firstRefactorPendingAc,
} from "./cycle-record.js";

interface Args {
  cmd?: string;
  feature?: string;
  story?: string;
  ac?: string;
  tddDir?: string;
}

function parse(argv: string[]): Args {
  const out: Args = { cmd: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": out.feature = argv[++i]; break;
      case "--story": out.story = argv[++i]; break;
      case "--ac": out.ac = argv[++i]; break;
      case "--tdd-dir": out.tddDir = argv[++i]; break;
    }
  }
  return out;
}

function usage(msg: string): number {
  process.stderr.write(
    `${msg}\nUsage: lakebase-tdd-cycle <begin|green|review|refactor> --feature <F> --story <S> [--ac <AC>] [--tdd-dir <D>]\n`,
  );
  return 2;
}

async function main(): Promise<number> {
  const a = parse(process.argv.slice(2));
  if (!a.feature || !a.story) return usage("Error: --feature and --story are required.");
  const tddDir = a.tddDir ?? join(process.cwd(), ".tdd");
  const base = { tddDir, featureId: a.feature, story: a.story };

  switch (a.cmd) {
    case "begin": {
      const r = beginNextPendingCycle(base);
      process.stdout.write(
        r.recorded
          ? `cycle: RED ${r.cycleId} for ${r.testId} (${r.acId})\n`
          : `cycle: no pending test for ${a.story} (every test-list item already has a cycle)\n`,
      );
      return 0;
    }
    case "green": {
      // HONEST GREEN: greenOpenCycle runs the verify suite against the running
      // app. On failure it leaves the cycle RED + raises an escalation; we exit
      // 0 (the escalation is recorded data, not a command crash) so the driver's
      // next readState routes to a clean raise-to-hil halt.
      const r = await greenOpenCycle(base);
      if (r.escalated) {
        process.stdout.write(`cycle: GREEN BLOCKED for ${r.testId} -> raised to HIL: ${r.summary}\n`);
      } else {
        process.stdout.write(`cycle: GREEN ${r.cycleId} for ${r.testId}\n`);
      }
      return 0;
    }
    case "review": {
      // Record the Navigator's REVIEW of an AC (after its tests are all green).
      const ac = a.ac ?? firstReviewPendingAc(tddDir, a.feature, a.story);
      if (!ac) {
        process.stdout.write(`cycle: no AC awaiting review for ${a.story}\n`);
        return 0;
      }
      const r = reviewAc(tddDir, a.feature, a.story, ac);
      process.stdout.write(`cycle: REVIEWED ${ac}${r.refactorRequested ? " (refactor requested)" : " (looks good)"}\n`);
      return 0;
    }
    case "refactor": {
      // Record that the Driver completed the requested REFACTOR for an AC.
      // Like GREEN, the refactor is re-verified honestly: on a failed verify the
      // AC stays refactor-pending + an escalation is raised; we exit 0 (the
      // escalation is recorded data, not a crash) so the driver's next readState
      // routes to a clean raise-to-hil halt.
      const ac = a.ac ?? firstRefactorPendingAc(tddDir, a.feature, a.story);
      if (!ac) {
        process.stdout.write(`cycle: no AC awaiting refactor for ${a.story}\n`);
        return 0;
      }
      const r = await refactorAc(tddDir, a.feature, a.story, ac);
      if (r.escalated) {
        process.stdout.write(`cycle: REFACTOR BLOCKED for ${ac} -> raised to HIL: ${r.summary}\n`);
      } else {
        process.stdout.write(`cycle: REFACTORED ${ac}\n`);
      }
      return 0;
    }
    default:
      return usage(`unknown subcommand: ${a.cmd}`);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
