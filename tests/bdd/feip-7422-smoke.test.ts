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

  it("has the recorded HIL design brief at design-brief.md (UI smoke)", () => {
    expect(fs.existsSync(path.join(SMOKE_DIR, "design-brief.md"))).toBe(true);
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

  it("has an advisory verify-story-pipeline.sh assert (FEIP-7565) wired into run-smoke.sh", () => {
    const assertScript = path.join(SMOKE_DIR, "assertions", "verify-story-pipeline.sh");
    expect(fs.existsSync(assertScript), "missing assertions/verify-story-pipeline.sh").toBe(true);
    expect((fs.statSync(assertScript).mode & 0o111) !== 0, "verify-story-pipeline.sh must be executable").toBe(true);
    const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");
    expect(runSmoke).toMatch(/verify-story-pipeline\.sh/);
  });

  it("has run-smoke.sh as the entrypoint", () => {
    const entry = path.join(SMOKE_DIR, "run-smoke.sh");
    expect(fs.existsSync(entry)).toBe(true);
    // Executable bit set so direct invocation works.
    const mode = fs.statSync(entry).mode;
    expect((mode & 0o111) !== 0, "run-smoke.sh must be executable").toBe(true);
  });

  it("scaffolds a FRESH project every run: unique default name + hard-abort on a stale dir", () => {
    const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");
    // Default PROJECT_NAME carries a per-run unique id so the runner can never
    // silently reuse a stale scaffold or collide with a prior run's resources.
    expect(runSmoke).toMatch(/RUN_ID="\$\(date /);
    expect(runSmoke).toMatch(/PROJECT_NAME="bug-tracker-\$\{RUN_ID\}"/);
    // A pre-existing project dir hard-aborts (exit 1) instead of proceeding.
    expect(runSmoke).toMatch(/already exists[\s\S]*?exit 1/);
  });
});

describe("FEIP-7422 smoke: headless speed (MCP strip + per-role model tiering)", () => {
  const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");

  it("strips MCP + pins the orchestrator model via a shared flag array on every claude -p boot", () => {
    // One shared flag array, applied to every claude invocation (DRY).
    // --strict-mcp-config = zero MCP servers; --model sonnet pins the
    // orchestrator (scrum-master, otherwise `inherit` = the slow opus default)
    // to a fast tier that still reliably emits its phase/handoff log events
    // (haiku drops them, and they are not artifact-backed so the reconcile
    // backstop cannot recover them).
    expect(runSmoke).toMatch(/CLAUDE_FLAGS=\(--strict-mcp-config --model sonnet\)/);
    // Every `claude -p` call threads the shared flags (no bare invocation that
    // would reload the operator's personal MCP servers).
    const calls = runSmoke.match(/claude -p "[^"]*"/g) ?? [];
    expect(calls.length, "expected claude -p invocations").toBeGreaterThanOrEqual(3);
    for (const line of runSmoke.split("\n")) {
      if (/^\s*claude -p "/.test(line)) {
        expect(line, `claude -p call missing CLAUDE_FLAGS: ${line.trim()}`).toContain('"${CLAUDE_FLAGS[@]}"');
      }
    }
  });

  it("tiers roles for the smoke via --agent-model: only architect + code-writers on sonnet, rest haiku", () => {
    // The architect (AC layering / NFR coverage) stays on sonnet as the quality
    // backstop; navigator/driver keep the kit-default sonnet (their output must
    // compile + pass tests). Every other role runs haiku for speed.
    expect(runSmoke).toMatch(/--agent-model architect-reviewer=sonnet/);
    expect(runSmoke).toMatch(/--agent-model spec-author=haiku/);
    expect(runSmoke).toMatch(/--agent-model test-strategist=haiku/);
    expect(runSmoke).toMatch(/--agent-model ux-designer=haiku/);
    expect(runSmoke).toMatch(/--agent-model product-owner=haiku/);
    expect(runSmoke).toMatch(/--agent-model release-engineer=haiku/);
  });

  it("makes role observability structural: live-tails the agent log + reconciles after each phase", () => {
    // The agent log is streamed to the console during each (silent) claude -p
    // turn, so subagent progress is visible live. Backgrounded directly (not via
    // $(...)) so the command substitution can't deadlock on the tail -f pipe.
    expect(runSmoke).toMatch(/\(\s*tail -n0 -f "\$tdd_log"/);
    expect(runSmoke).toMatch(/local tail_pid=\$!/);
    // After each pass, a deterministic reconcile emits artifact.written for any
    // artifact a role model did not log itself.
    expect(runSmoke).toMatch(/lakebase-tdd-log --reconcile --feature/);
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

  it("design-brief.md conforms (has a References section)", () => {
    const md = fs.readFileSync(path.join(SMOKE_DIR, "design-brief.md"), "utf8");
    expect(checkArtifactConformance("design-brief.md", md)).toEqual({ ok: true });
  });
});

describe("FEIP-7422 smoke: orchestrator supplies intake via the Human Proxy", () => {
  const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");

  it("stages project intake (product-overview.md + nfrs.md + design-brief.md) via human-proxy supply", () => {
    expect(runSmoke).toMatch(/lakebase-tdd-human-proxy supply/);
    expect(runSmoke).toMatch(/stage_project_intake/);
    expect(runSmoke).toMatch(/product-overview\.md/);
    expect(runSmoke).toMatch(/nfrs\.md/);
    expect(runSmoke).toMatch(/design-brief\.md/);
  });

  it("declares the UI track (LAKEBASE_TDD_UI=1) so the UX Designer + design-brief intake run", () => {
    expect(runSmoke).toMatch(/export LAKEBASE_TDD_UI=1/);
  });

  it("supplies each sprint's feature-request.md via the proxy at /plan (not a bare cp)", () => {
    expect(runSmoke).toMatch(/proxy_supply "\$spec".*feature-request\.md/);
    // The old bare `cp "$spec" .../feature-request.md` staging is gone.
    expect(runSmoke).not.toMatch(/cp "\$spec"/);
    // The supply is hoisted into /plan (run_plan_sprint), not the per-feature loop.
    expect(runSmoke).toMatch(/run_plan_sprint\s*\(\)/);
    const planFn = runSmoke.slice(runSmoke.indexOf("run_plan_sprint() {"));
    expect(planFn, "feature-request supply lives in run_plan_sprint").toMatch(
      /proxy_supply "\$spec".*feature-request\.md/
    );
  });
});

describe("FEIP-7422 smoke: /plan authors each sprint's backlog (two sprints, feedback loop)", () => {
  const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");

  it("runs two sprints sliced from ITERATIONS (sprint-1 = v1..v3, sprint-2 = v4..v5)", () => {
    expect(runSmoke).toMatch(/SPRINT1_ITERS=\(.*ITERATIONS\[@\]:0:3.*\)/);
    expect(runSmoke).toMatch(/SPRINT2_ITERS=\(.*ITERATIONS\[@\]:3:2.*\)/);
    expect(runSmoke).toMatch(/run_sprint "sprint-1" "\$\{SPRINT1_ITERS\[@\]\}"/);
    expect(runSmoke).toMatch(/run_sprint "sprint-2" "\$\{SPRINT2_ITERS\[@\]\}"/);
  });

  it("/plan enforces the project-intake precondition (lakebase-tdd-intake without --feature)", () => {
    // run_plan_sprint is defined after run_iteration; slice from its definition
    // to the run_sprint driver that follows it in the main block.
    const planFn = runSmoke.slice(
      runSmoke.indexOf("run_plan_sprint() {"),
      runSmoke.indexOf("run_sprint() {")
    );
    // The project-level gate is a bare `lakebase-tdd-intake \` (line-continued,
    // no --feature); the per-feature confirmation passes --feature.
    expect(planFn).toMatch(/lakebase-tdd-intake \\$/m);
    expect(planFn).toMatch(/lakebase-tdd-intake --feature/);
  });

  it("commits the sprint backlog + project intake to trunk so feature branches inherit requests", () => {
    expect(runSmoke).toMatch(/git commit -m "plan \$\{sprint_name\}/);
    expect(runSmoke).toMatch(/git commit -m "intake: project/);
  });

  it("exercises the actual /plan command via claude -p (parity)", () => {
    expect(runSmoke).toMatch(/claude -p "\/plan --sprint \$\{sprint_name\}"/);
  });
});

describe("FEIP-7422 smoke: orchestrator deploys each iteration to local (working software)", () => {
  const runSmoke = fs.readFileSync(path.join(SMOKE_DIR, "run-smoke.sh"), "utf8");

  it("runs /deploy via the actual command (claude -p), not by emulating the substrate", () => {
    // Parity: /deploy is driven through the real command, which delegates to the
    // release-engineer agent + records the PO deploy gate. The smoke no longer
    // calls lakebase-tdd-deploy to perform the deploy itself.
    expect(runSmoke).toMatch(/claude -p "\/deploy \$\{feature_id\} --target local"/);
    // The smoke still tears the local app down between iterations (safety).
    expect(runSmoke).toMatch(/lakebase-tdd-deploy --target local --project-dir "\$PROJECT_DIR" --stop/);
  });

  it("v5's feature request is list-view-only: deploy/reachability moved to the per-sprint /deploy", () => {
    const v5 = fs.readFileSync(path.join(SMOKE_DIR, "feature-requests", "v5-list-view.md"), "utf8");
    expect(v5, "v5 should not carry per-PR deployment intent (that is the orchestrated /deploy)").not.toMatch(/pull request|deployed to a new environment/i);
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
