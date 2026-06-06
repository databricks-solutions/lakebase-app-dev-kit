// HIL NFR brief (nfrs.md) conformance + cross-artifact coverage against
// architecture.json. The HIL states Required NFRs (each with an R<n> id); the
// Architect must carry every Required item into architecture.json via a
// matching brief_ref. An uncovered Required NFR HARD-BLOCKS the architecture
// gate (decision locked: explicit brief_ref + hard-block).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkArtifactConformance,
  parseRequiredNfrs,
  checkNfrCoverage,
  scanFeatureConformance,
} from "../../scripts/tdd/artifact-conformance";

const CONFORMANT_NFRS = [
  "---",
  "author: Product Owner",
  "---",
  "",
  "# NFRs",
  "",
  "## Required",
  "- R1: every write path is audited",
  "- R2: p95 read latency under 200ms at 1k rows",
  "",
  "## Preferences",
  "- structured JSON logs",
  "",
  "## Out of bounds",
  "- no multi-region for now",
  "",
].join("\n");

describe("nfrs.md conformance (md-sections)", () => {
  it("passes with Required + Preferences + Out of bounds + H1", () => {
    expect(checkArtifactConformance("nfrs.md", CONFORMANT_NFRS)).toEqual({ ok: true });
  });

  it("fails when a required section is missing", () => {
    const noOob = CONFORMANT_NFRS.replace("## Out of bounds\n- no multi-region for now\n", "");
    const r = checkArtifactConformance("nfrs.md", noOob);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/Out of bounds/i);
  });
});

describe("parseRequiredNfrs", () => {
  it("extracts R<n> ids from the Required section only", () => {
    const items = parseRequiredNfrs(CONFORMANT_NFRS);
    expect(items.map((i) => i.id)).toEqual(["R1", "R2"]);
    expect(items[0].text).toBe("every write path is audited");
  });

  it("tolerates **R1** bolding and various separators", () => {
    const md = "## Required\n- **R1** audited\n- R2. fast\n- R3) resilient\n## Preferences\n";
    expect(parseRequiredNfrs(md).map((i) => i.id)).toEqual(["R1", "R2", "R3"]);
  });

  it("flags a Required list item with no id (id=null)", () => {
    const md = "## Required\n- every write path is audited\n## Preferences\n";
    const items = parseRequiredNfrs(md);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBeNull();
  });
});

describe("checkNfrCoverage", () => {
  const arch = (refs: Array<string | undefined>) =>
    JSON.stringify({
      feature_id: "F1-x",
      nfrs: refs.map((r, i) => ({
        category: "security",
        requirement: `nfr ${i}`,
        ...(r ? { brief_ref: r } : {}),
      })),
    });

  it("passes when every Required id is covered by a brief_ref", () => {
    expect(checkNfrCoverage(CONFORMANT_NFRS, arch(["R1", "R2"]))).toEqual({ ok: true });
  });

  it("hard-fails when a Required NFR is not covered", () => {
    const r = checkNfrCoverage(CONFORMANT_NFRS, arch(["R1"]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/R2 .*not covered/);
  });

  it("hard-fails when a Required item has no id (untrackable)", () => {
    const md = "## Required\n- audited\n## Preferences\n";
    const r = checkNfrCoverage(md, arch([]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/no R<n> id/);
  });

  it("reports invalid architecture.json", () => {
    const r = checkNfrCoverage(CONFORMANT_NFRS, "{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/not valid JSON/);
  });

  it("is vacuously ok when there are no Required NFRs", () => {
    const md = "# NFRs\n## Required\n## Preferences\n## Out of bounds\n";
    expect(checkNfrCoverage(md, arch([]))).toEqual({ ok: true });
  });
});

describe("scanFeatureConformance: enforces NFR coverage once architecture.json exists", () => {
  let tdd: string;
  let fdir: string;
  const FEATURE = "F1-x";
  const ARCH = (refs: string[]) =>
    JSON.stringify({
      feature_id: FEATURE,
      nfrs: refs.map((r) => ({ category: "security", requirement: "x", brief_ref: r })),
    });

  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "nfr-cov-"));
    fdir = join(tdd, "features", FEATURE);
    mkdirSync(fdir, { recursive: true });
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("skips coverage when architecture.json is absent (feature mid-design)", () => {
    writeFileSync(join(tdd, "nfrs.md"), CONFORMANT_NFRS);
    const report = scanFeatureConformance(tdd, FEATURE);
    expect(report.entries.some((e) => e.artifact.includes("NFR coverage"))).toBe(false);
  });

  it("fails the scan when a project-level Required NFR is uncovered", () => {
    writeFileSync(join(tdd, "nfrs.md"), CONFORMANT_NFRS); // R1 + R2
    writeFileSync(join(fdir, "architecture.json"), ARCH(["R1"])); // R2 missing
    const report = scanFeatureConformance(tdd, FEATURE);
    expect(report.ok).toBe(false);
    const cov = report.entries.find((e) => e.artifact.includes("NFR coverage"));
    expect(cov?.violations.join(" ")).toMatch(/R2 .*not covered/);
  });

  it("passes when every Required NFR is covered", () => {
    writeFileSync(join(tdd, "nfrs.md"), CONFORMANT_NFRS);
    writeFileSync(join(fdir, "architecture.json"), ARCH(["R1", "R2"]));
    const report = scanFeatureConformance(tdd, FEATURE);
    const cov = report.entries.find((e) => e.artifact.includes("NFR coverage"));
    expect(cov?.ok).toBe(true);
  });
});
