// FEIP-7422: hermetic guard rails on the smoke artifacts.
//
// The smoke itself (examples/feip-7422-smoke/orchestrator/run-smoke.sh)
// drives a real scaffolded project through 5 iterations + CI; it's
// expensive and not appropriate as a vitest. This test only asserts
// the smoke's SHAPE: the 5 iteration specs exist, contain the right
// AC structure, v5 carries an `[E2E]` row, the orchestrator references
// all 5 iterations in order, the 3 mode flags are documented, and each
// iteration has a matching verify-v*.sh.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SMOKE_DIR = path.join(REPO_ROOT, "examples", "feip-7422-smoke", "orchestrator");

const ITERATIONS = [
  "v1-initial-domain",
  "v2-add-owners",
  "v3-status-table",
  "v4-split-bug-entity",
  "v5-list-view",
];

describe("FEIP-7422 smoke: directory structure", () => {
  it("ships under examples/feip-7422-smoke/orchestrator/", () => {
    expect(fs.existsSync(SMOKE_DIR)).toBe(true);
  });

  it("has the canonical domain doc at 00-domain.md", () => {
    expect(fs.existsSync(path.join(SMOKE_DIR, "00-domain.md"))).toBe(true);
  });

  it("has an iterations/ subdir with the 5 specs", () => {
    const iterDir = path.join(SMOKE_DIR, "iterations");
    expect(fs.existsSync(iterDir)).toBe(true);
    for (const iter of ITERATIONS) {
      expect(fs.existsSync(path.join(iterDir, `${iter}.md`)), `missing iterations/${iter}.md`).toBe(true);
    }
  });

  it("has an assertions/ subdir with verify-v1..v5 + verify-v5-e2e", () => {
    const assertDir = path.join(SMOKE_DIR, "assertions");
    expect(fs.existsSync(assertDir)).toBe(true);
    for (const v of ["v1", "v2", "v3", "v4", "v5"]) {
      expect(fs.existsSync(path.join(assertDir, `verify-${v}.sh`)), `missing assertions/verify-${v}.sh`).toBe(true);
    }
    expect(fs.existsSync(path.join(assertDir, "verify-v5-e2e.sh"))).toBe(true);
  });

  it("has run-smoke.sh as the entrypoint", () => {
    const entry = path.join(SMOKE_DIR, "run-smoke.sh");
    expect(fs.existsSync(entry)).toBe(true);
    // Executable bit set so direct invocation works.
    const mode = fs.statSync(entry).mode;
    expect((mode & 0o111) !== 0, "run-smoke.sh must be executable").toBe(true);
  });
});

describe("FEIP-7422 smoke: iteration specs are well-formed (feature.md voice)", () => {
  // Iteration specs are feature.md files: pure feature-requester narrative
  // describing WHAT the user wants, in user-behavior language. They do NOT
  // contain implementation details (no SQL, no HTTP verbs, no table names,
  // no file paths), no Acceptance Criteria tables (the kit's
  // test-strategist phase produces those from the prose), and no
  // operational metadata (branch name, Lakebase parent, migration version
  // are all derived by the orchestrator from convention).
  //
  // These assertions guard the requester-voice invariant: future edits
  // that try to re-insert implementation specifics into the iteration
  // specs will fail the BDD.

  for (const iter of ITERATIONS) {
    describe(iter, () => {
      const md = fs.readFileSync(path.join(SMOKE_DIR, "iterations", `${iter}.md`), "utf8");

      it("has a top-level H1 title", () => {
        expect(md).toMatch(/^#\s+v\d/m);
      });

      it("contains substantive narrative prose (>=400 chars beyond the title)", () => {
        const body = md.replace(/^#.*$/m, "").trim();
        expect(body.length, `${iter} should have substantive narrative; got ${body.length} chars`).toBeGreaterThanOrEqual(400);
      });

      it("documents what's out of scope", () => {
        expect(md).toMatch(/##\s*Out of scope/i);
      });

      it("does NOT include implementation-leaking sections (architect's voice)", () => {
        // Schema / Migration / Files-/build-produces sections belong to
        // the architect-reviewer + driver phases of /design + /build, not
        // to the feature requester's narrative.
        expect(md, `${iter} should not have a 'Schema' or 'Schema delta' section`).not.toMatch(/##\s*Schema/im);
        expect(md, `${iter} should not have a 'Migration' header`).not.toMatch(/^\*\*Migration\*\*:/m);
        expect(md, `${iter} should not list files /build is expected to produce`).not.toMatch(/##.*Files.*\/build.*produce/i);
      });

      it("does NOT include operational metadata (derived by orchestrator)", () => {
        expect(md, `${iter} should not declare its branch name (orchestrator derives it)`).not.toMatch(/^\*\*Branch\*\*:/m);
        expect(md, `${iter} should not declare its Lakebase parent (smoke is 2-tier by convention)`).not.toMatch(/^\*\*Lakebase parent\*\*:/m);
      });

      it("does NOT include a pre-decided Acceptance Criteria table", () => {
        // ACs are the test-strategist's output (acs/AC*.json + acs/AC*.md
        // per .tdd/ spec-format), not the requester's pre-decision.
        expect(md, `${iter} should not have an 'Acceptance Criteria' section`).not.toMatch(/##\s*Acceptance Criteria/i);
        // Stricter: no markdown table rows starting with | AC<n> |
        expect(md, `${iter} should not contain | AC<n> | table rows`).not.toMatch(/^\|\s*\*?\*?AC\d/m);
      });
    });
  }
});

describe("FEIP-7422 smoke: orchestrator references all 5 iterations + 3 modes", () => {
  const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");

  it("declares ITERATIONS in order v1..v5", () => {
    const m = runSmoke.match(/ITERATIONS=\(([^)]+)\)/);
    expect(m, "run-smoke.sh missing ITERATIONS=(...) declaration").not.toBeNull();
    const declared = m![1].trim().split(/\s+/);
    expect(declared).toEqual(ITERATIONS);
  });

  it("documents and implements --fast, --standard, --full modes", () => {
    expect(runSmoke).toMatch(/--fast/);
    expect(runSmoke).toMatch(/--standard/);
    expect(runSmoke).toMatch(/--full/);
    expect(runSmoke).toMatch(/MODE="(fast|standard|full)"/);
  });

  it("requires claude on PATH (for /design + /build skill invocations)", () => {
    expect(runSmoke).toMatch(/require_cmd\s+claude/);
  });

  it("requires gh on PATH only outside --fast mode", () => {
    expect(runSmoke).toMatch(/\$MODE.*!=\s*"fast"[\s\S]*?require_cmd\s+gh/);
  });

  it("calls is_full_cycle gate that only fires v5 in --standard", () => {
    // The case body for "standard" must restrict to v5-*.
    expect(runSmoke).toMatch(/standard\)\s*\[\[\s*"\$iter"\s*==\s*v5-\*/);
  });
});
