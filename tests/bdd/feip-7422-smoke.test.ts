// FEIP-7422: hermetic guard rails on the smoke artifacts.
//
// The smoke itself (examples/feip-7422-smoke/orchestrator/run-smoke.sh)
// drives a real scaffolded project through 5 iterations + CI; it's
// expensive and not appropriate as a vitest. This test only asserts
// the smoke's SHAPE and that its authored documents follow the kit's
// role conventions: the Product Owner's product-overview.md is
// open-ended product intent, the 5 per-iteration feature-requests/ are
// in Feature Requester voice (no implementation or operational detail),
// the orchestrator references all 5 iterations in order, the 3 mode
// flags are documented, and each iteration has a matching verify-v*.sh.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { checkArtifactConformance, parseRequiredNfrs } from "../../scripts/tdd/artifact-conformance";

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

  it("has the Product Owner requirements doc at product-overview.md", () => {
    expect(fs.existsSync(path.join(SMOKE_DIR, "product-overview.md"))).toBe(true);
  });

  it("has the recorded HIL NFR brief at nfrs.md", () => {
    expect(fs.existsSync(path.join(SMOKE_DIR, "nfrs.md"))).toBe(true);
  });

  it("has a feature-requests/ subdir with the 5 specs", () => {
    const reqDir = path.join(SMOKE_DIR, "feature-requests");
    expect(fs.existsSync(reqDir)).toBe(true);
    for (const iter of ITERATIONS) {
      expect(fs.existsSync(path.join(reqDir, `${iter}.md`)), `missing feature-requests/${iter}.md`).toBe(true);
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

describe("FEIP-7422 smoke: product-overview.md is well-formed (Product Owner voice)", () => {
  // product-overview.md is the Product Owner's standing intent: who the
  // product is for + what they need to accomplish, open-ended and
  // refined across iterations. Stack, schema, endpoints, and tier flags
  // are the Architect's / harness's concern (the smoke README), not here.
  const md = fs.readFileSync(path.join(SMOKE_DIR, "product-overview.md"), "utf8");

  it("carries YAML frontmatter declaring author: Product Owner", () => {
    expect(md).toMatch(/^---\n[\s\S]*?\bauthor:\s*Product Owner\b[\s\S]*?\n---\n/);
  });

  it("has a top-level H1 title", () => {
    expect(md).toMatch(/^#\s+\S/m);
  });

  it("contains substantive product-intent prose (>=400 chars beyond the title)", () => {
    const body = md.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^#.*$/m, "").trim();
    expect(body.length, `product-overview should have substantive intent; got ${body.length} chars`).toBeGreaterThanOrEqual(400);
  });

  it("stays open-ended product intent: no implementation or operational detail", () => {
    expect(md, "no Schema section (architect's concern)").not.toMatch(/##\s*Schema/im);
    expect(md, "no HTTP endpoint listing (architect's concern)").not.toMatch(/\b(POST|GET|PATCH|PUT|DELETE)\s+\//);
    expect(md, "no --tiers operational flag (harness concern)").not.toMatch(/--tiers\b/);
    expect(md, "no SQL DDL (implementation concern)").not.toMatch(/\b(CREATE TABLE|ALTER TABLE|FOREIGN KEY)\b/i);
  });
});

describe("FEIP-7422 smoke: recorded HIL intake artifacts conform (Human Proxy answers)", () => {
  it("product-overview.md conforms to its declared format", () => {
    const md = fs.readFileSync(path.join(SMOKE_DIR, "product-overview.md"), "utf8");
    expect(checkArtifactConformance("product-overview.md", md)).toEqual({ ok: true });
  });

  it("nfrs.md conforms (Required / Preferences / Out of bounds) and carries R<n> ids", () => {
    const md = fs.readFileSync(path.join(SMOKE_DIR, "nfrs.md"), "utf8");
    expect(checkArtifactConformance("nfrs.md", md)).toEqual({ ok: true });
    const ids = parseRequiredNfrs(md).map((r) => r.id);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(ids.every((id) => id !== null)).toBe(true);
  });
});

describe("FEIP-7422 smoke: orchestrator supplies intake via the Human Proxy", () => {
  const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");

  it("stages project intake (product-overview.md + nfrs.md) via human-proxy supply", () => {
    expect(runSmoke).toMatch(/lakebase-tdd-human-proxy supply/);
    expect(runSmoke).toMatch(/stage_project_intake/);
    expect(runSmoke).toMatch(/product-overview\.md/);
    expect(runSmoke).toMatch(/nfrs\.md/);
  });

  it("supplies the per-iteration feature-request.md via the proxy (not a bare cp)", () => {
    expect(runSmoke).toMatch(/proxy_supply "\$spec".*feature-request\.md/);
    // The old bare `cp "$spec" .../feature-request.md` staging is gone.
    expect(runSmoke).not.toMatch(/cp "\$spec"/);
  });
});

describe("FEIP-7422 smoke: iteration specs are well-formed (feature-request.md voice)", () => {
  // Iteration specs are feature-request.md files: pure feature-requester narrative
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
      const md = fs.readFileSync(path.join(SMOKE_DIR, "feature-requests", `${iter}.md`), "utf8");

      it("carries YAML frontmatter declaring author: Feature Requester", () => {
        // Every artifact in the kit's workflow records the ROLE that
        // authored it (not the person). Iteration specs ARE feature-request.md
        // files, authored by the feature requester. Spec Author /
        // Architect Reviewer / Test Strategist / driver+navigator
        // outputs each carry their own role in this frontmatter slot
        // when they land.
        expect(md).toMatch(/^---\n[\s\S]*?\bauthor:\s*Feature Requester\b[\s\S]*?\n---\n/);
      });

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

describe("FEIP-7422 smoke: orchestrator is TDD-only (SCM workflow tested elsewhere)", () => {
  const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");

  it("declares ITERATIONS in order v1..v5", () => {
    const m = runSmoke.match(/ITERATIONS=\(([^)]+)\)/);
    expect(m, "run-smoke.sh missing ITERATIONS=(...) declaration").not.toBeNull();
    const declared = m![1].trim().split(/\s+/);
    expect(declared).toEqual(ITERATIONS);
  });

  it("requires claude on PATH (for /design + /build skill invocations)", () => {
    expect(runSmoke).toMatch(/require_cmd\s+claude/);
  });

  it("does NOT invoke the SCM workflow CLIs (those live in tests/integration/scm-workflow-e2e-live.test.ts)", () => {
    // The TDD smoke MUST NOT shell out to lakebase-scm-prepare-pr /
    // wait-ci / merge. Those CLIs are the contract of the SCM workflow
    // substrate; testing them belongs in the live integration suite.
    // Match only invocation lines (not comment mentions in the header).
    const invocations = runSmoke
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(invocations).not.toMatch(/lakebase-scm-prepare-pr\b/);
    expect(invocations).not.toMatch(/lakebase-scm-wait-ci\b/);
    expect(invocations).not.toMatch(/lakebase-scm-merge\b/);
  });

  it("does NOT define an is_full_cycle gate (TDD-only smoke; no PR cycle)", () => {
    expect(runSmoke).not.toMatch(/is_full_cycle\b/);
  });

  it("does NOT require gh (no GitHub PR/merge ops in the TDD smoke)", () => {
    expect(runSmoke).not.toMatch(/require_cmd\s+gh\b/);
  });

  it("invokes lakebase-tdd-human-proxy between claude passes (gate-drain loop)", () => {
    // The human-proxy replaces the human HITL approver so the TDD
    // smoke can run headless. Stripping this would let the smoke hang
    // at the first /design gate.
    expect(runSmoke).toMatch(/lakebase-tdd-human-proxy\b/);
  });

  it("abandons the prior feature before claiming the next (substrate CLI)", () => {
    // Each iteration claims a fresh feature; the SCM state machine
    // refuses concurrent claims, so the orchestrator must abandon the
    // prior one between iterations.
    expect(runSmoke).toMatch(/lakebase-scm-abandon-feature\b/);
  });
});
