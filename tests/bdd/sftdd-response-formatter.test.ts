// response-formatter: the agent-side precheck a role runs on its OWN output.
// It type-checks the artifact against the role's contract and reports the
// specific violations (the CLI turns a non-ok result into a throw). The canonical
// case is the S2 live stall: a test-strategist per-story list that is empty / has
// null or unmapped ac_id must be caught HERE, before it is handed back.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { formatRoleResponse, designGuideConformance } from "../../scripts/sftdd/response-formatter";

const F = "F1-file-bug";
const S = "S2-submit-create-bug";
let tdd: string;

function writeJson(file: string, obj: unknown): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}
function acsDir(): string {
  return join(tdd, "features", F, "stories", S, "acs");
}
function perStoryList(): string {
  return join(tdd, "features", F, "stories", S, "test-list-per-story.json");
}
function writeAc(id: string, over: Record<string, unknown> = {}): void {
  writeJson(join(acsDir(), `${id}.json`), {
    id,
    layer: "E2E",
    given: "g",
    when: "w",
    then: "t",
    status: "draft",
    ...over,
  });
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-fmt-"));
  mkdirSync(acsDir(), { recursive: true });
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("response-formatter: test-strategist (the S2 contract)", () => {
  beforeEach(() => {
    writeAc("AC1-form-submission-creates-bug");
    writeAc("AC2-redirected-to-detail-page");
  });

  it("FLAGS an empty per-story test list", () => {
    writeJson(perStoryList(), { feature_id: F, story_id: S, items: [] });
    const r = formatRoleResponse({ role: "test-strategist", sftddDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);
    expect(r.violations[0].problem).toMatch(/empty `items`/);
  });

  it("FLAGS an item with null/empty ac_id (the exact S2 bug)", () => {
    writeJson(perStoryList(), {
      feature_id: F,
      story_id: S,
      items: [{ id: "T7", description: "x", ac_id: null, status: "pending" }],
    });
    const r = formatRoleResponse({ role: "test-strategist", sftddDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);
    expect(r.violations[0].problem).toMatch(/null\/empty ac_id/);
  });

  it("FLAGS an item whose ac_id does not map to the story's ACs", () => {
    writeJson(perStoryList(), {
      feature_id: F,
      story_id: S,
      items: [{ id: "T1", description: "x", ac_id: "AC9-not-a-real-ac", status: "pending" }],
    });
    const r = formatRoleResponse({ role: "test-strategist", sftddDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);
    expect(r.violations[0].problem).toMatch(/not one of the story's ACs/);
  });

  it("PASSES a conformant per-story list (>=1 item, every ac_id mapped)", () => {
    writeJson(perStoryList(), {
      feature_id: F,
      story_id: S,
      items: [
        { id: "T1", description: "submit creates", ac_id: "AC1-form-submission-creates-bug", status: "pending" },
        { id: "T2", description: "redirect", ac_id: "AC2-redirected-to-detail-page", status: "pending" },
      ],
    });
    const r = formatRoleResponse({ role: "test-strategist", sftddDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });
});

describe("response-formatter: spec-author + architect-reviewer contracts", () => {
  it("spec-author FLAGS a slug-id AC (not AC<n>) and PASSES a conformant one", () => {
    writeJson(join(acsDir(), "create-form.json"), {
      id: "create-form", // slug id -> violates ac.schema id pattern
      layer: "E2E",
      given: "g",
      when: "w",
      then: "t",
      status: "draft",
    });
    let r = formatRoleResponse({ role: "spec-author", sftddDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);

    rmSync(join(acsDir(), "create-form.json"));
    writeAc("AC1-create-form");
    r = formatRoleResponse({ role: "spec-author", sftddDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(true);
  });

  it("architect-reviewer FLAGS an AC missing its layer", () => {
    // No `layer` -> architect contract unmet. (Write a raw AC w/o layer.)
    writeJson(join(acsDir(), "AC1-form.json"), { id: "AC1-form", given: "g", when: "w", then: "t", status: "draft" });
    const r = formatRoleResponse({ role: "architect-reviewer", sftddDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => /missing\/invalid `layer`/.test(v.problem))).toBe(true);
  });

  it("spec-author FLAGS two ACs with an identical `then` (ac-independence backstop)", () => {
    // The AC2/AC3 overlap that stalled the 2026-06-11 smoke: a non-independent
    // AC whose `then` matches another's can never go RED. Normalization is
    // whitespace + case insensitive.
    writeAc("AC1-submit-files-bug", { then: "Redirects to /bugs/{id}" });
    writeAc("AC2-land-on-bug-url", { then: "redirects to  /bugs/{id}" });
    const r = formatRoleResponse({ role: "spec-author", sftddDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => /identical `then`/.test(v.problem))).toBe(true);
  });

  it("spec-author PASSES ACs with distinct `then` clauses", () => {
    writeAc("AC1-shows-form", { then: "the create-bug form is shown" });
    writeAc("AC2-files-bug", { then: "a new bug row is created" });
    const r = formatRoleResponse({ role: "spec-author", sftddDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(true);
  });
});

describe("response-formatter: ux-designer (design-guide.json conforms to its schema)", () => {
  function designGuide(): string {
    return join(tdd, "design", "design-guide.json");
  }
  const CONFORMANT = {
    typography: {
      font_family: "'DM Sans', sans-serif",
      font_mono: "'DM Mono', monospace",
      scale: { "text-base": "15px" },
      line_heights: { body: "1.5" },
      font_weights: { medium: "500" },
    },
    colors: { brand: { "brand-red": "#FF3621" } },
    spacing: { "space-4": "16px" },
  };

  it("FLAGS a missing design-guide.json", () => {
    const r = formatRoleResponse({ role: "ux-designer", sftddDir: tdd, featureId: F });
    expect(r.ok).toBe(false);
    expect(r.violations[0].problem).toMatch(/not written/);
  });

  it("FLAGS the exact live drift (camelCase keys, nested spacing, extra typography props)", () => {
    writeJson(designGuide(), {
      typography: {
        fontFamilyPrimary: "'DM Sans', sans-serif",
        fontFamilyNumeric: "'DM Mono', monospace",
        scale: { base: "15px" },
        lineHeightBody: "1.5",
        fontWeights: [400, 500],
      },
      colors: { brand: { red: "#FF3621" } },
      spacing: { unit: "4px", scale: { "space-4": "16px" } },
    });
    const r = formatRoleResponse({ role: "ux-designer", sftddDir: tdd, featureId: F });
    expect(r.ok).toBe(false);
    const problem = r.violations.map((v) => v.problem).join(" ");
    expect(problem).toMatch(/font_family/);
    expect(problem).toMatch(/additional properties/i);
  });

  it("PASSES a conformant guide with the expanded typography tokens", () => {
    writeJson(designGuide(), CONFORMANT);
    const r = formatRoleResponse({ role: "ux-designer", sftddDir: tdd, featureId: F });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  // The design-lane gate (orchestrator-effects `designGuideReady`) reads .ok from
  // this SAME helper, so the self-check and the deterministic gate can never
  // disagree. Lock its contract here.
  it("designGuideConformance: the shared gate/self-check decision", () => {
    expect(designGuideConformance(tdd).ok).toBe(false); // missing
    writeJson(designGuide(), { typography: { fontFamilyPrimary: "x", scale: { base: "15px" } }, colors: { brand: {} }, spacing: {} });
    const bad = designGuideConformance(tdd);
    expect(bad.ok).toBe(false);
    expect(bad.problem).toMatch(/font_family|additional properties/i);
    writeJson(designGuide(), CONFORMANT);
    expect(designGuideConformance(tdd)).toEqual({ ok: true });
  });
});

describe("response-formatter: roles with no deterministic contract pass", () => {
  it("an unknown/uncovered role is a no-op PASS", () => {
    const r = formatRoleResponse({ role: "navigator", sftddDir: tdd, featureId: F, story: S });
    expect(r.ok).toBe(true);
  });
});
