// Per-turn build replay: replayBuildTurn overlays the Kth recorded turn's code +
// cycle/experiment records onto the project, in place of spawning the
// Navigator/Driver. The driver visits every build turn (so events run live);
// only the artifact delivery is mocked. Hermetic: real fs, tmpdirs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { replayBuildTurn, listBuildTurns, codeTreeFilter } from "../../scripts/tdd/replay-build.js";

const F = "F1-file-bug";
const S = "S1-create-bug";
let corpus: string;
let proj: string;
let tdd: string;

/** Write one recorded turn dir: turns/<slug>/code/<files> (+ optional cycle). */
function writeTurn(slug: string, files: Record<string, string>): void {
  const code = join(corpus, "features", F, "stories", S, "turns", slug, "code");
  for (const [rel, body] of Object.entries(files)) {
    const p = join(code, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, body);
  }
}

beforeEach(() => {
  corpus = mkdtempSync(join(tmpdir(), "rb-corpus-"));
  proj = mkdtempSync(join(tmpdir(), "rb-proj-"));
  tdd = join(proj, ".tdd");
  // A fresh scaffold's scripts/lk must NOT be clobbered by a snapshot copy.
  mkdirSync(join(proj, "scripts"), { recursive: true });
  writeFileSync(join(proj, "scripts", "lk"), "#FRESH scaffold lk\n");

  // Turn 1 (navigator): the first failing test. Includes junk that must NOT copy.
  writeTurn("001-navigator", {
    "tests/test_ac1.py": "def test_ac1(): assert False\n",
    "scripts/lk": "#stale snapshot lk , must NOT clobber the fresh scaffold\n",
    ".venv/bin/python": "binary-junk",
    "app/__pycache__/x.pyc": "bytecode-junk",
    ".env": "SECRET=should-not-copy\n",
  });
  // Turn 2 (driver): the impl that makes it pass.
  writeTurn("002-driver", {
    "tests/test_ac1.py": "def test_ac1(): assert True\n",
    "app/main.py": "# impl by the driver\n",
  });
});
afterEach(() => {
  rmSync(corpus, { recursive: true, force: true });
  rmSync(proj, { recursive: true, force: true });
});

describe("replayBuildTurn (per-turn build replay)", () => {
  it("lists the story's turns in order", () => {
    expect(listBuildTurns(corpus, F, S)).toEqual(["001-navigator", "002-driver"]);
    expect(listBuildTurns(corpus, F, "S2-uncovered")).toEqual([]);
  });

  it("overlays the Kth turn's code, skipping scaffold-owned + junk + secrets", () => {
    expect(replayBuildTurn({ replayBuildDir: corpus, projectDir: proj, tddDir: tdd, featureId: F, story: S, turnIndex: 1 })).toBe(true);
    // turn 1 RED test landed
    expect(readFileSync(join(proj, "tests", "test_ac1.py"), "utf8")).toMatch(/assert False/);
    // scaffold-owned scripts/lk untouched
    expect(readFileSync(join(proj, "scripts", "lk"), "utf8")).toBe("#FRESH scaffold lk\n");
    // junk + secrets never copied
    expect(existsSync(join(proj, ".venv"))).toBe(false);
    expect(existsSync(join(proj, "app", "__pycache__"))).toBe(false);
    expect(existsSync(join(proj, ".env"))).toBe(false);
  });

  it("advances turn by turn: turn 2 overlays the GREEN impl over turn 1", () => {
    replayBuildTurn({ replayBuildDir: corpus, projectDir: proj, tddDir: tdd, featureId: F, story: S, turnIndex: 1 });
    expect(replayBuildTurn({ replayBuildDir: corpus, projectDir: proj, tddDir: tdd, featureId: F, story: S, turnIndex: 2 })).toBe(true);
    expect(readFileSync(join(proj, "tests", "test_ac1.py"), "utf8")).toMatch(/assert True/); // RED -> GREEN
    expect(existsSync(join(proj, "app", "main.py"))).toBe(true);
  });

  it("returns false past the last recorded turn (falls back to the live agent)", () => {
    expect(replayBuildTurn({ replayBuildDir: corpus, projectDir: proj, tddDir: tdd, featureId: F, story: S, turnIndex: 3 })).toBe(false);
  });

  it("returns false for a story the corpus does not cover", () => {
    const ok = replayBuildTurn({ replayBuildDir: corpus, projectDir: proj, tddDir: tdd, featureId: F, story: "S2-uncovered", turnIndex: 1 });
    expect(ok).toBe(false);
    expect(existsSync(join(proj, "app"))).toBe(false);
  });

  it("codeTreeFilter rejects scaffold/junk/secret paths, keeps real source", () => {
    const root = "/p";
    const f = codeTreeFilter(root);
    expect(f("/p/app/main.py")).toBe(true);
    expect(f("/p/tests/test_x.py")).toBe(true);
    expect(f("/p/scripts/lk")).toBe(false); // scaffold-owned top dir
    expect(f("/p/app/__pycache__/x.pyc")).toBe(false); // junk at depth
    expect(f("/p/.venv/bin/python")).toBe(false);
    expect(f("/p/.env")).toBe(false); // secret
    expect(f("/p/.env.example")).toBe(true); // template kept
  });
});
