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
import { beginNextPendingCycle, greenOpenCycle } from "./cycle-record.js";

interface Args {
  cmd?: string;
  feature?: string;
  story?: string;
  tddDir?: string;
}

function parse(argv: string[]): Args {
  const out: Args = { cmd: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": out.feature = argv[++i]; break;
      case "--story": out.story = argv[++i]; break;
      case "--tdd-dir": out.tddDir = argv[++i]; break;
    }
  }
  return out;
}

function usage(msg: string): number {
  process.stderr.write(
    `${msg}\nUsage: lakebase-tdd-cycle <begin|green> --feature <F> --story <S> [--tdd-dir <D>]\n`,
  );
  return 2;
}

function main(): number {
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
      const r = greenOpenCycle(base);
      process.stdout.write(`cycle: GREEN ${r.cycleId} for ${r.testId}\n`);
      return 0;
    }
    default:
      return usage(`unknown subcommand: ${a.cmd}`);
  }
}

try {
  process.exit(main());
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
