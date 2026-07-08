#!/usr/bin/env node
// CLI for the deterministic architect-notes projection (FEIP-7902): write a
// story's per-AC architectural_notes from the project canon, with NO architect
// agent turn, for the common case where the story maps cleanly onto the canon.
// The design lane's `project-architect-notes` effect calls this; the driver's
// project-or-dispatch decision (architectProjectable) already established it is
// safe (feature architecture.json exists, canon established, story not novel).
//
// Idempotent: an AC that already carries architectural_notes is left untouched.
//
// Usage:
//   lakebase-sftdd-canon-notes --feature <F> --story <S> [--tdd-dir <path>]

import { projectStoryNotes, evaluateStoryCanon } from "./architecture-canon.js";
import { resolveSftddDir } from "./sftdd-paths.js";
import { writeSmellsLog } from "./smells.js";

interface Parsed {
  feature: string;
  story: string;
  sftddDir?: string;
}

function parse(argv: string[]): Parsed {
  const out: Parsed = { feature: "", story: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--feature" && i + 1 < argv.length) out.feature = argv[++i];
    else if (a === "--story" && i + 1 < argv.length) out.story = argv[++i];
    else if (a === "--tdd-dir" && i + 1 < argv.length) out.sftddDir = argv[++i];
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}

function help(): never {
  process.stdout.write(
    `lakebase-sftdd-canon-notes , project a story's per-AC architectural_notes from the canon\n\n` +
      `Usage:\n` +
      `  lakebase-sftdd-canon-notes --feature <F> --story <S> [--tdd-dir <path>]\n`,
  );
  process.exit(0);
}

const p = parse(process.argv.slice(2));
if (!p.feature || !p.story) {
  process.stderr.write("lakebase-sftdd-canon-notes: --feature and --story are required\n");
  process.exit(2);
}

const sftddDir = p.sftddDir ?? resolveSftddDir();

// FAIL-TOWARD-PROJECTION with a reactive fallback: if the canon does NOT cover the
// story (an AC layer / architecture dimension it has not seen), do NOT write a
// blind note , raise the architect-canon-gap smell (spec-level, architect-owned).
// The escalation machinery routes it to the architect (re-annotate + amend the
// canon) via revise-routing, bounded to one revise then HITL. Otherwise project.
const coverage = evaluateStoryCanon(sftddDir, p.feature, p.story);
if (!coverage.ok) {
  writeSmellsLog(sftddDir, [
    {
      smell: "architect-canon-gap",
      cycle_ids: [],
      story_id: p.story,
      detail:
        `Canon does not cover ${p.feature}/${p.story}: ${coverage.gaps.join("; ")}. ` +
        `Route to the Architect to annotate the uncovered ACs + amend the canon.`,
    },
  ]);
  process.stdout.write(
    `canon-notes: ${p.feature}/${p.story} has a canon gap (${coverage.gaps.length}); raised architect-canon-gap (no blind projection).\n`,
  );
  process.exit(0);
}

const n = projectStoryNotes(sftddDir, p.feature, p.story);
process.stdout.write(`canon-notes: projected architectural_notes onto ${n} AC(s) for ${p.feature}/${p.story}\n`);
process.exit(0);
