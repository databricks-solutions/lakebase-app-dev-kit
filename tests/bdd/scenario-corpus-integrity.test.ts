// Scenario-corpus referential integrity: every ac_id a test-list references must
// resolve to a git-TRACKED ac file in the shipped fixture.
//
// The defect this guards (field feedback 2026-07-14, Finding 3): a `.gitignore`
// `*conf*.json` glob silently dropped corpus ac files whose names contain "conf"
// (AC2-file-new-stock-confirmed, AC5-nonconforming-count-reported, ...). The files
// existed on disk in a dev clone (so an on-disk check passed) but were never
// committed, so shipped scenarios had test-lists referencing ac files that a
// consumer never received , a dangling reference that stayed green. So this asks
// git (tracked set), not the filesystem, and scopes to scenarios whose
// scenario.json is itself tracked (the real shipped corpora, not stray local dirs).

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");
const SCENARIOS = "examples/sftdd-scenarios";

function tracked(paths: string): Set<string> {
  const out = execFileSync("git", ["ls-files", paths], { cwd: REPO_ROOT, encoding: "utf8" });
  return new Set(out.split("\n").map((l) => l.trim()).filter(Boolean));
}

/** Tracked scenario roots (a scenario.json that git actually ships). */
function trackedScenarioRoots(): string[] {
  return [...tracked(SCENARIOS)]
    .filter((p) => p.endsWith("/scenario.json"))
    .map((p) => dirname(p));
}

describe("scenario corpus: every test-list ac_id resolves to a shipped (tracked) ac file", () => {
  const roots = trackedScenarioRoots();

  it("has at least one shipped scenario to check", () => {
    expect(roots.length).toBeGreaterThan(0);
  });

  for (const root of roots) {
    it(`${root}: no dangling ac_id references`, () => {
      const files = tracked(root);
      const testLists = [...files].filter((f) => /\/test-list.*\.json$/.test(f));
      const acFiles = [...files].filter((f) => /\/acs\/.+\.json$/.test(f));

      const dangling: string[] = [];
      for (const tl of testLists) {
        // A test-list lives under `.../recorded-artifacts/features/<feature>/...`.
        // Resolve its ac files in the SAME recorded-artifacts tree for the SAME
        // feature , NOT in per-turn `.sftdd` snapshots elsewhere in the corpus, or
        // a snapshot copy would mask a missing recorded-artifacts ac.
        const m = tl.match(/^(.*\/recorded-artifacts)\/features\/([^/]+)\//);
        if (!m) continue;
        const [, artifactsRoot, feature] = m;
        const acPrefix = `${artifactsRoot}/features/${feature}/`;
        let doc: { items?: Array<{ ac_id?: string }> };
        try {
          doc = JSON.parse(readFileSync(join(REPO_ROOT, tl), "utf8"));
        } catch {
          continue;
        }
        for (const item of doc.items ?? []) {
          const ac = item?.ac_id;
          if (!ac) continue;
          const hit = acFiles.some((f) => f.startsWith(acPrefix) && f.endsWith(`/acs/${ac}.json`));
          if (!hit) dangling.push(`${tl} -> ${ac}`);
        }
      }

      expect(
        [...new Set(dangling)],
        `test-list ac_id(s) with no tracked ac file (shipped corpus is missing them; ` +
          `check .gitignore is not dropping data files, then git add the ac json):\n` +
          [...new Set(dangling)].map((d) => `  ${d}`).join("\n"),
      ).toEqual([]);
    });
  }
});
