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

// Full replay-artifact completeness. The runtime hard-fail (drive.cli.ts
// ReplayCorpusMissError) refuses to run an agent when a replay lane is told to
// reproduce a turn the corpus lacks. This test is that same contract, moved
// EARLIER: it fails hermetically in CI (naming the missing file) the moment a
// shipped scenario is missing an artifact the driver would restore, so a drop
// never survives to surface as a live-replay hard-fail. It keys off what the
// corpus actually SHIPS (tracked story.json / feature dir), so it cannot
// false-fail on an optional feature , if you ship a story, you must ship every
// artifact its replay needs.
describe("scenario corpus: every replay artifact the driver restores is tracked (no silent drop)", () => {
  const roots = trackedScenarioRoots();

  for (const root of roots) {
    it(`${root}: design + reflect + build artifacts are all shipped`, () => {
      const files = tracked(root);
      const aroot = `${root}/recorded-artifacts`;
      const broot = `${root}/recorded-build`;
      const has = (p: string) => files.has(p);
      const hasUnder = (prefix: string) => [...files].some((f) => f.startsWith(prefix));

      // scenario.json drives feature-level replay knobs (uiTrack -> design-guide;
      // buildReplay -> recorded-build turns). Absent knobs take the replay defaults.
      let manifest: { uiTrack?: boolean; features?: Array<{ id?: string; buildReplay?: boolean }> } = {};
      try {
        manifest = JSON.parse(readFileSync(join(REPO_ROOT, root, "scenario.json"), "utf8"));
      } catch {
        /* keep defaults */
      }
      const buildReplayFor = (feature: string): boolean =>
        manifest.features?.find((f) => f.id === feature)?.buildReplay !== false;

      // Enumerate the SHIPPED stories from tracked story.json, grouped by feature.
      const storyByFeature = new Map<string, Set<string>>();
      for (const f of files) {
        const m = f.match(new RegExp(`^${aroot}/features/([^/]+)/stories/([^/]+)/story\\.json$`));
        if (!m) continue;
        const [, feature, story] = m;
        (storyByFeature.get(feature) ?? storyByFeature.set(feature, new Set()).get(feature)!).add(story);
      }

      const missing: string[] = [];
      const need = (p: string) => {
        if (!has(p)) missing.push(p);
      };
      const needAny = (prefix: string, label: string) => {
        if (!hasUnder(prefix)) missing.push(`${label} (>=1 file under ${prefix})`);
      };

      // A uiTrack scenario replays the UX designer turn from design/design-guide.json.
      if (manifest.uiTrack) need(`${aroot}/design/design-guide.json`);

      for (const [feature, stories] of storyByFeature) {
        // Feature-level design turns: Spec Author breakdown (feature-spec.json),
        // Architect (architecture.json), Test Strategist (test-list.json).
        need(`${aroot}/features/${feature}/feature-spec.json`);
        need(`${aroot}/features/${feature}/architecture.json`);
        need(`${aroot}/features/${feature}/test-list.json`);
        for (const story of stories) {
          const sdir = `${aroot}/features/${feature}/stories/${story}`;
          // Per-story: the Spec Author acs (>=1) and the reflect gate verdict.
          needAny(`${sdir}/acs/`, `${feature}/${story} acs`);
          need(`${sdir}/reflect-verdict.json`);
          // Build lane (unless buildReplay:false): the recorded per-turn code tree.
          if (buildReplayFor(feature)) {
            needAny(`${broot}/features/${feature}/stories/${story}/turns/`, `${feature}/${story} recorded-build turns`);
          }
        }
      }

      expect(storyByFeature.size, `no shipped stories found under ${aroot} (is the corpus tracked?)`).toBeGreaterThan(0);
      expect(
        missing,
        `shipped scenario '${root}' is missing replay artifact(s) the driver restores. A live replay would ` +
          `hard-fail (ReplayCorpusMissError) on these. Check .gitignore is not dropping them, then git add:\n` +
          missing.map((m) => `  ${m}`).join("\n"),
      ).toEqual([]);
    });
  }
});
