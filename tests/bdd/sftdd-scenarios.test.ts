// Recorded-scenario replay framework: hermetic integrity guard.
//
// A "scenario" is a self-contained replay corpus under
// examples/sftdd-scenarios/<name>/ : a recorded-artifacts/ design lane, a
// recorded-build/ build corpus, a turns/ per-turn timeline, and a scenario.json
// manifest (scripts/sftdd/schemas/scenario.schema.json). replay-scenario.sh
// replays it live; THIS test is the always-on (no-workspace) guard that every
// committed scenario is well-formed + replay-ready, so a corpus can never rot
// into an un-replayable state unnoticed. See examples/sftdd-scenarios/SCENARIOS.md.
//
// The structural assertions live in assertScenarioCorpus() so they are exercised
// here against the existing bug-tracker corpus immediately (proving the checks),
// and run per scenario discovered under examples/sftdd-scenarios/ (guarding new
// captures like stockflow the moment they are dropped in).

import { describe, it, expect, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCENARIOS_DIR = path.join(REPO_ROOT, "examples", "sftdd-scenarios");

interface ScenarioManifest {
  name: string;
  description: string;
  tiers?: number;
  uiTrack?: boolean;
  features: { id: string; buildReplay?: boolean; summary?: string }[];
  pauseBefore?: "navigator" | "release-engineer";
}

/** Structural integrity of a recorded corpus (a scenario dir, or any dir that
 *  holds recorded-artifacts/ + optionally recorded-build/ + turns/). `features`
 *  is the ordered feature list the manifest (or the caller) expects to replay. */
function assertScenarioCorpus(
  corpusRoot: string,
  features: { id: string; buildReplay?: boolean }[],
): void {
  const artifacts = path.join(corpusRoot, "recorded-artifacts");
  expect(fs.existsSync(artifacts), `recorded-artifacts/ present in ${corpusRoot}`).toBe(true);

  // Each replayed feature has a recorded design dir; build-replayable ones also
  // have a recorded build dir (consumed by restoreBuildTurn). A feature with no
  // recorded build is design-only (live build), which the manifest marks.
  for (const f of features) {
    const featDesign = path.join(artifacts, "features", f.id);
    expect(fs.existsSync(featDesign), `recorded-artifacts/features/${f.id}/ present`).toBe(true);
    if (f.buildReplay !== false) {
      const featBuild = path.join(corpusRoot, "recorded-build", "features", f.id);
      expect(fs.existsSync(featBuild), `recorded-build/features/${f.id}/ present (buildReplay)`).toBe(true);
    }
  }

  // The per-turn timeline (when present) is an ordered index with strictly
  // monotonic ordinals starting at 0, the invariant replayDesignTurn /
  // restoreBuildTurn + the recorder rely on.
  const indexFile = path.join(corpusRoot, "turns", "index.json");
  if (fs.existsSync(indexFile)) {
    const idx = JSON.parse(fs.readFileSync(indexFile, "utf8")) as { turns?: { ordinal: number; dir: string }[] };
    expect(Array.isArray(idx.turns), `turns/index.json has a turns[] array`).toBe(true);
    const turns = idx.turns ?? [];
    turns.forEach((t, i) => {
      expect(t.ordinal, `turn ${i} ordinal is its index (monotonic from 0)`).toBe(i);
      expect(fs.existsSync(path.join(corpusRoot, "turns", t.dir)), `turn dir ${t.dir} exists`).toBe(true);
    });
  }
}

function readManifest(scenarioDir: string): ScenarioManifest {
  return JSON.parse(fs.readFileSync(path.join(scenarioDir, "scenario.json"), "utf8")) as ScenarioManifest;
}

describe("sftdd-scenarios: framework scaffolding", () => {
  it("ships the scenarios home + the SCENARIOS.md capture/replay guide", () => {
    expect(fs.existsSync(SCENARIOS_DIR)).toBe(true);
    expect(fs.existsSync(path.join(SCENARIOS_DIR, "SCENARIOS.md"))).toBe(true);
  });

  it("ships the generic replay + capture entry scripts", () => {
    expect(fs.existsSync(path.join(SCENARIOS_DIR, "replay-scenario.sh"))).toBe(true);
    expect(fs.existsSync(path.join(SCENARIOS_DIR, "capture-scenario.sh"))).toBe(true);
  });
});

// Capture-wiring guard: the exact regression that motivated the single-source
// refactor. capture-scenario.sh must read scenario.json (the single source for a
// scenario's conditions) and funnel it into create-project as flags , NOT set the
// e2e-scaffold door while the drive reads a different uiTrack door. This test locks
// the funnel so the "UI project runs with no UX lane" contradiction cannot return.
describe("capture-scenario.sh funnels scenario.json into create-project (one way in)", () => {
  const src = fs.readFileSync(path.join(SCENARIOS_DIR, "capture-scenario.sh"), "utf8");

  it("reads the manifest via the tested scenario-conditions reader", () => {
    expect(src).toMatch(/scenario-conditions\.cli\.js/);
    expect(src).toMatch(/SCENARIO_MANIFEST=/);
    expect(src).toMatch(/sc uiTrack/);
  });

  it("declares the UX track via create-project --ui-track (the ONE door for the UX lane)", () => {
    expect(src).toMatch(/create_flags\+=\(--ui-track\)/);
  });

  it("funnels language / runner / tiers from the manifest, not a harness hardcode", () => {
    expect(src).toMatch(/create_flags\+=\(--language/);
    expect(src).toMatch(/create_flags\+=\(--runner/);
    expect(src).toMatch(/--tiers/);
    // The old hardcode `--language python --runner self-hosted` is gone: language
    // and runner are only ever passed from the manifest ($SC_LANG / $SC_RUNNER).
    expect(src).not.toMatch(/--language\s+python/);
    expect(src).not.toMatch(/--runner\s+self-hosted/);
  });

  it("has NO second UX door: no --ui->--enable-e2e mapping, no LAKEBASE_SFTDD_UI export", () => {
    expect(src).not.toMatch(/--enable-e2e/); // e2e is derived from uiTrack in create-project
    expect(src).not.toMatch(/LAKEBASE_SFTDD_UI\b/); // the removed env door
  });
});

describe("assertScenarioCorpus: logic exercised against a synthetic fixture", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scenario-fixture-"));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const mk = (rel: string): void => {
    fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), "{}");
  };

  it("passes for a well-formed corpus (design + build + monotonic turns)", () => {
    mk("recorded-artifacts/features/F1-x/feature-spec.json");
    mk("recorded-build/features/F1-x/code/app.py");
    fs.mkdirSync(path.join(tmp, "turns", "0000-cut"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "turns", "index.json"),
      JSON.stringify({ turns: [{ ordinal: 0, dir: "0000-cut" }] }),
    );
    expect(() => assertScenarioCorpus(tmp, [{ id: "F1-x", buildReplay: true }])).not.toThrow();
  });

  it("fails when a build-replay feature is missing its recorded-build dir", () => {
    expect(() => assertScenarioCorpus(tmp, [{ id: "F2-missing", buildReplay: true }])).toThrow();
  });

  it("a design-only feature (buildReplay:false) needs no recorded-build", () => {
    fs.mkdirSync(path.join(tmp, "recorded-artifacts", "features", "F3-designonly"), { recursive: true });
    expect(() => assertScenarioCorpus(tmp, [{ id: "F3-designonly", buildReplay: false }])).not.toThrow();
  });
});

describe("sftdd-scenarios: every committed scenario is well-formed + replay-ready", () => {
  // A subdir is a COMMITTED scenario only once it carries a scenario.json manifest.
  // A capture records INTO examples/sftdd-scenarios/<name>/ and only writes the
  // manifest when the author finalizes it ("add scenario.json, then commit"), so a
  // manifest-less dir is an in-progress / uncommitted capture, NOT a scenario to
  // validate. Requiring the manifest here keeps a live capture from breaking `npm test`.
  const scenarioDirs = fs.existsSync(SCENARIOS_DIR)
    ? fs
        .readdirSync(SCENARIOS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .filter((e) => fs.existsSync(path.join(SCENARIOS_DIR, e.name, "scenario.json")))
        .map((e) => e.name)
    : [];

  if (scenarioDirs.length === 0) {
    it("(no scenarios committed yet, the framework is ready for the first drop-in)", () => {
      expect(scenarioDirs).toEqual([]);
    });
  }

  for (const name of scenarioDirs) {
    describe(`scenario: ${name}`, () => {
      const dir = path.join(SCENARIOS_DIR, name);
      it("has a scenario.json manifest with the required fields", () => {
        const m = readManifest(dir);
        expect(m.name, "manifest name matches the directory name").toBe(name);
        expect(typeof m.description).toBe("string");
        expect(Array.isArray(m.features) && m.features.length > 0).toBe(true);
        for (const f of m.features) expect(f.id).toMatch(/^F[0-9]+(-[a-z0-9-]+)?$/);
        if (m.pauseBefore) expect(["navigator", "release-engineer"]).toContain(m.pauseBefore);
      });
      it("corpus is structurally complete for every manifest feature", () => {
        assertScenarioCorpus(dir, readManifest(dir).features);
      });
    });
  }
});
