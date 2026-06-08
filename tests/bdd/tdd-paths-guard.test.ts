// Guard: the knowledge of WHERE .tdd artifacts live is defined in ONE place
// (scripts/tdd/tdd-paths.ts), not spread across the codebase. This is the
// enforcement behind the single-source-of-truth refactor (FEIP-7461): the
// deterministic driver kept stalling because a producer and its consumer built
// the same path/format knowledge in different spots and silently drifted.
//
// Two invariants, checked across every scripts/tdd/*.ts (incl. adapters/),
// excluding tdd-paths.ts itself + test files:
//   1. No hand-built `"features"` path segment. Everything routes through the
//      tdd-paths builders (featuresDir / featureDir / storiesDir / ...), so the
//      `.tdd/features/...` layout has exactly one definition.
//   2. No local findFeatureDir / findStoryDir definition. Feature/story dir
//      resolution is the one rule in tdd-paths (findFeatureDir / findStoryDir);
//      the 6 divergent copies that variously threw / picked-first / returned
//      undefined are gone. (Adapter-specific by-id resolvers are named
//      *ById to make clear they are a different operation, not a copy.)

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const TDD_DIR = fileURLToPath(new URL("../../scripts/tdd", import.meta.url));
const SINGLE_SOURCE = "tdd-paths.ts";

/** Every .ts source file under scripts/tdd (recursive), minus tests + the one
 *  module that is allowed to know the layout. */
function tddSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tddSourceFiles(full));
      continue;
    }
    if (!entry.endsWith(".ts")) continue;
    if (entry.endsWith(".test.ts")) continue;
    if (entry === SINGLE_SOURCE) continue;
    out.push(full);
  }
  return out;
}

const FILES = tddSourceFiles(TDD_DIR);

describe("tdd-paths is the single source of truth for .tdd layout", () => {
  it("finds source files to check (sanity)", () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it('no module hand-builds the "features" path segment (route through tdd-paths)', () => {
    const offenders = FILES.filter((f) => /"features"/.test(readFileSync(f, "utf8"))).map((f) =>
      basename(f),
    );
    expect(offenders, `these files hand-build a "features" path; use a tdd-paths builder instead`).toEqual([]);
  });

  it("no module defines its own findFeatureDir / findStoryDir (resolution lives once in tdd-paths)", () => {
    const re = /\b(?:function|const)\s+(?:findFeatureDir|findStoryDir)\b/;
    const offenders = FILES.filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => basename(f));
    expect(offenders, `these files define a local feature/story-dir resolver; import it from tdd-paths`).toEqual([]);
  });
});
