// /design intake precondition: product-overview.md + nfrs.md (project) +
// feature-request.md (per-feature) + design-brief.md (UI) must exist and
// conform before /design enters phase 1. This is what makes intake
// un-skippable in real and headless runs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkIntakePreconditions } from "../../scripts/tdd/intake";

const PRODUCT_OVERVIEW = "# Product\n\nWho it is for and what they need to accomplish.\n";
const NFRS = [
  "# NFRs",
  "## Required",
  "- R1: audited",
  "## Preferences",
  "- logs",
  "## Out of bounds",
  "- no auth",
  "",
].join("\n");
const FEATURE_REQUEST = "# v1\n\nA team needs to file bugs and find them later, in their own words.\n";
const DESIGN_BRIEF = "# Design brief\n\n## References\n- partner-asset-tracker for layout + tone\n";

let tdd: string;
const FEATURE = "F1-x";

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "intake-"));
  mkdirSync(join(tdd, "features", FEATURE), { recursive: true });
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("checkIntakePreconditions", () => {
  it("fails when product-overview.md + nfrs.md are absent", () => {
    const r = checkIntakePreconditions({ tddDir: tdd });
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["product-overview.md", "nfrs.md"]);
  });

  it("passes with conformant product-overview.md + nfrs.md (no feature, no UI)", () => {
    writeFileSync(join(tdd, "product-overview.md"), PRODUCT_OVERVIEW);
    writeFileSync(join(tdd, "nfrs.md"), NFRS);
    expect(checkIntakePreconditions({ tddDir: tdd }).ok).toBe(true);
  });

  it("flags a present-but-non-conformant nfrs.md", () => {
    writeFileSync(join(tdd, "product-overview.md"), PRODUCT_OVERVIEW);
    writeFileSync(join(tdd, "nfrs.md"), "# NFRs\n\nprose only, no required sections\n");
    const r = checkIntakePreconditions({ tddDir: tdd });
    expect(r.ok).toBe(false);
    expect(r.nonConformant).toContain("nfrs.md");
  });

  it("requires the feature's feature-request.md when a featureId is given", () => {
    writeFileSync(join(tdd, "product-overview.md"), PRODUCT_OVERVIEW);
    writeFileSync(join(tdd, "nfrs.md"), NFRS);
    const missing = checkIntakePreconditions({ tddDir: tdd, featureId: FEATURE });
    expect(missing.ok).toBe(false);
    expect(missing.missing).toContain("feature-request.md");

    writeFileSync(join(tdd, "features", FEATURE, "feature-request.md"), FEATURE_REQUEST);
    expect(checkIntakePreconditions({ tddDir: tdd, featureId: FEATURE }).ok).toBe(true);
  });

  it("requires design-brief.md only for UI projects (--ui)", () => {
    writeFileSync(join(tdd, "product-overview.md"), PRODUCT_OVERVIEW);
    writeFileSync(join(tdd, "nfrs.md"), NFRS);
    expect(checkIntakePreconditions({ tddDir: tdd }).ok).toBe(true); // non-UI: fine
    const uiMissing = checkIntakePreconditions({ tddDir: tdd, ui: true });
    expect(uiMissing.ok).toBe(false);
    expect(uiMissing.missing).toContain("design-brief.md");

    mkdirSync(join(tdd, "design"), { recursive: true });
    writeFileSync(join(tdd, "design", "design-brief.md"), DESIGN_BRIEF);
    expect(checkIntakePreconditions({ tddDir: tdd, ui: true }).ok).toBe(true);
  });
});
