#!/usr/bin/env node
// lakebase-sftdd-cycle: the substrate surface for TDD cycle bookkeeping.
//
// The ORCHESTRATION (deterministic driver) calls this around the pure
// Navigator/Driver agents. The agents never record cycles or touch git:
//   - Navigator writes the next failing test, then the driver runs:
//       lakebase-sftdd-cycle begin --feature F --story S [--tdd-dir D]
//     to stamp the RED cycle for that test.
//   - Driver writes code + runs the project's test command, then the driver runs:
//       lakebase-sftdd-cycle green --feature F --story S [--tdd-dir D]
//     to record the runner outcome + stamp GREEN.
//
// Exit: 0 ok; 2 bad args; 1 op failure (e.g. no open RED cycle to green).

import { join } from "path";
import { resolveTddDir } from "./sftdd-paths.js";
import {
  beginNextPendingCycle,
  beginNextPendingBatch,
  greenOpenCycle,
  reviewAc,
  refactorAc,
  reviewStory,
  refactorStory,
  firstReviewPendingAc,
  firstRefactorPendingAc,
  greenVerifierForEnv,
} from "./cycle-record.js";
import {
  writeSupersededTests,
  readSupersededTests,
  readGreenFailure,
  writeGreenFailure,
  readRegressionAssessment,
  writeRegressionAssessment,
} from "./supersession.js";
import { writeEscalation } from "./escalation.js";

interface Args {
  cmd?: string;
  feature?: string;
  story?: string;
  ac?: string;
  tddDir?: string;
  /** P8b: "hybrid-a" makes `begin` stamp a layer-batch RED (vs one test). */
  loop?: string;
  /** P8b: layer-batch cap for `begin --loop hybrid-a`. */
  batchCap?: number;
  /** flag-superseded: prior test files/node-ids the current AC supersedes. */
  tests?: string[];
  /** flag-superseded: why the prior tests are superseded (new AC + change). */
  reason?: string;
  /** assess-regression: the Navigator's root-cause finding for a genuine regression. */
  diagnosis?: string;
  /** assess-regression: the repair directive when the regression is driver-fixable. */
  fixDirective?: string;
  /** green: this green is the Driver's bounded REPAIR re-verify (consume the attempt). */
  repair?: boolean;
}

function parse(argv: string[]): Args {
  const out: Args = { cmd: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": out.feature = argv[++i]; break;
      case "--story": out.story = argv[++i]; break;
      case "--ac": out.ac = argv[++i]; break;
      case "--tdd-dir": out.tddDir = argv[++i]; break;
      case "--loop": out.loop = argv[++i]; break;
      case "--test": (out.tests ??= []).push(argv[++i]); break;
      case "--reason": out.reason = argv[++i]; break;
      case "--diagnosis": out.diagnosis = argv[++i]; break;
      case "--fix": out.fixDirective = argv[++i]; break;
      case "--repair": out.repair = true; break;
      case "--batch-cap": {
        const n = Number(argv[++i]);
        if (Number.isFinite(n) && n > 0) out.batchCap = Math.floor(n);
        break;
      }
    }
  }
  return out;
}

function usage(msg: string): number {
  process.stderr.write(
    `${msg}\nUsage: lakebase-sftdd-cycle <begin|green|review|refactor> --feature <F> --story <S> [--ac <AC>] [--tdd-dir <D>] [--loop ac|hybrid-a] [--batch-cap <n>]\n`,
  );
  return 2;
}

async function main(): Promise<number> {
  const a = parse(process.argv.slice(2));
  if (!a.feature || !a.story) return usage("Error: --feature and --story are required.");
  const tddDir = a.tddDir ?? resolveTddDir();
  const base = { tddDir, featureId: a.feature, story: a.story };

  switch (a.cmd) {
    case "begin": {
      // P8b: hybrid-a stamps ONE batch RED cycle for the first pending layer's
      // items (capped); the default (ac) stamps one RED for the next test.
      // story: one batch RED covering EVERY pending test in the story (the
      // Navigator writes the whole story's failing tests in one turn).
      // hybrid-a: one layer-batch (capped). ac: one RED for the next test.
      const r =
        a.loop === "story"
          ? beginNextPendingBatch(base, { cap: Number.MAX_SAFE_INTEGER })
          : a.loop === "hybrid-a"
            ? beginNextPendingBatch(base, { cap: a.batchCap })
            : beginNextPendingCycle(base);
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
      // In a build replay (LAKEBASE_SFTDD_REPLAY_BUILD_DIR set) the per-turn
      // full-suite honest-GREEN is invalid (a later AC's test is legitimately RED
      // while only the current AC's code is overlaid), so trust the recorded GREEN
      // for this turn; the final all-ACs state is verified at the deploy gate (FEIP-7702).
      const r = await greenOpenCycle({ ...base, repair: a.repair, verify: greenVerifierForEnv() });
      if (r.needsAssess) {
        process.stdout.write(`cycle: GREEN verify failed for ${r.testId} -> Navigator assess (supersession vs regression): ${r.summary}\n`);
      } else if (r.escalated) {
        process.stdout.write(`cycle: GREEN BLOCKED for ${r.testId} -> raised to HIL: ${r.summary}\n`);
      } else {
        process.stdout.write(`cycle: GREEN ${r.cycleId} for ${r.testId}\n`);
      }
      return 0;
    }
    case "review": {
      // story granularity (default): the Navigator REVIEWs the WHOLE story in
      // one turn (review-verdict.json at the story root); no AC.
      if (a.loop === "story") {
        const r = reviewStory(tddDir, a.feature, a.story);
        process.stdout.write(`cycle: REVIEWED story ${a.story}${r.refactorRequested ? " (refactor requested)" : " (looks good)"}\n`);
        return 0;
      }
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
      // story granularity (default): the Driver REFACTORs the WHOLE story in
      // one turn; honest re-verify gates stamping (same as the per-AC path).
      if (a.loop === "story") {
        const r = await refactorStory(tddDir, a.feature, a.story, { verify: greenVerifierForEnv() });
        if (r.escalated) {
          process.stdout.write(`cycle: REFACTOR BLOCKED for story ${a.story} -> raised to HIL: ${r.summary}\n`);
        } else {
          process.stdout.write(`cycle: REFACTORED story ${a.story}\n`);
        }
        return 0;
      }
      const ac = a.ac ?? firstRefactorPendingAc(tddDir, a.feature, a.story);
      if (!ac) {
        process.stdout.write(`cycle: no AC awaiting refactor for ${a.story}\n`);
        return 0;
      }
      // Same replay-build trust applies to the refactor re-verify (FEIP-7702).
      const r = await refactorAc(tddDir, a.feature, a.story, ac, { verify: greenVerifierForEnv() });
      if (r.escalated) {
        process.stdout.write(`cycle: REFACTOR BLOCKED for ${ac} -> raised to HIL: ${r.summary}\n`);
      } else {
        process.stdout.write(`cycle: REFACTORED ${ac}\n`);
      }
      return 0;
    }
    case "flag-superseded": {
      // The Navigator flags PRIOR tests the current AC supersedes, so the Driver
      // may permissively refactor ONLY those when the honest-GREEN verify breaks
      // them. Requires --ac, at least one --test, and a --reason.
      if (!a.ac) return usage("flag-superseded: --ac is required.");
      if (!a.tests || a.tests.length === 0) return usage("flag-superseded: at least one --test is required.");
      if (!a.reason) return usage("flag-superseded: --reason is required.");
      writeSupersededTests(tddDir, a.feature, a.story, a.ac, { tests: a.tests, reason: a.reason });
      process.stdout.write(`cycle: flagged ${a.tests.length} superseded test(s) for ${a.story}/${a.ac}\n`);
      return 0;
    }
    case "assess-regression": {
      // The Navigator records its root-cause finding for a GENUINE regression
      // (not a supersession), so the diagnosis travels to the Driver / the HIL
      // instead of being lost. With --fix the regression is driver-fixable: the
      // directive routes a bounded Driver repair turn. Without --fix it is not
      // driver-fixable and assess-green will escalate carrying the diagnosis.
      if (!a.ac) return usage("assess-regression: --ac is required.");
      if (!a.diagnosis) return usage("assess-regression: --diagnosis is required.");
      writeRegressionAssessment(tddDir, a.feature, a.story, a.ac, {
        diagnosis: a.diagnosis,
        ...(a.fixDirective ? { fixDirective: a.fixDirective } : {}),
      });
      process.stdout.write(
        `cycle: regression assessed for ${a.story}/${a.ac}${a.fixDirective ? " (driver-fixable; repair directive recorded)" : " (not driver-fixable; will escalate with diagnosis)"}\n`,
      );
      return 0;
    }
    case "assess-green": {
      // Finalize the Navigator's assessment of a failed GREEN verify. Mark the
      // green-failure assessed (so a still-failing verify next escalates rather
      // than re-assessing). The verdict is READ from disk , the role's output:
      //   - superseded-tests.json present  -> supersession (Driver permissive green);
      //   - regression-assessment.json + fixDirective -> driver-fixable regression:
      //       record the diagnosis + directive on the marker; a Driver REPAIR turn
      //       is routed (no escalation yet);
      //   - regression-assessment.json, no fixDirective -> not driver-fixable:
      //       escalate carrying the Navigator's diagnosis;
      //   - nothing written -> genuine regression with no diagnosis: escalate with
      //       the bare verify summary (the prior, diagnosis-free fallback).
      const ac = a.ac;
      if (!ac) return usage("assess-green: --ac is required.");
      const gf = readGreenFailure(tddDir, a.feature, a.story, ac);
      const flagged = readSupersededTests(tddDir, a.feature, a.story, ac);
      const regression = readRegressionAssessment(tddDir, a.feature, a.story, ac);
      writeGreenFailure(tddDir, a.feature, a.story, ac, {
        assessed: true,
        summary: gf?.summary ?? "",
        ...(regression?.diagnosis ? { diagnosis: regression.diagnosis } : {}),
        ...(regression?.fixDirective ? { fixDirective: regression.fixDirective } : {}),
      });
      if (flagged) {
        process.stdout.write(`cycle: assessed ${a.story}/${ac} -> superseded (${flagged.tests.length} test(s) flagged; Driver may permissively green)\n`);
      } else if (regression?.fixDirective) {
        // Driver-fixable regression: a bounded Driver repair turn is routed next
        // (the orchestration sees the fixDirective on the marker). No escalation.
        process.stdout.write(`cycle: assessed ${a.story}/${ac} -> driver-fixable regression; routing Driver repair: ${regression.diagnosis}\n`);
      } else {
        const why = regression?.diagnosis ?? gf?.summary ?? "";
        writeEscalation(tddDir, {
          source: "driver-green",
          reason: `GREEN verify failed for ${ac} in ${a.feature}/${a.story}: Navigator assessed it as a genuine regression${regression ? " (not driver-fixable)" : " (no superseded tests flagged)"}${why ? ` , ${why}` : ""}`,
          feature_id: a.feature,
          story_id: a.story,
          ac_id: ac,
        });
        process.stdout.write(`cycle: assessed ${a.story}/${ac} -> genuine regression, raised to HIL${regression ? " with diagnosis" : ""}\n`);
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
