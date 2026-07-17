// Finding 29: a spec-author can write a truncated / invalid-JSON AC file (e.g.
// ending right after `architectural_notes` with no closing brace). It used to
// pass the per-story spec gate AND the reflect gate (neither parsed the AC files)
// and only fail at deploy gate-conformance, long after build + accept. The
// per-story spec-gate approval now runs the SAME conformance the deploy gate
// trusts, so the defect fails at approve time, where it is produced. Hermetic.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initPipeline,
  writePipeline,
  surfaceForGate,
  approveStoryGateFromDisk,
} from "../../scripts/sftdd/story-pipeline";
import { featureDir, storyAcsConformanceReason } from "../../scripts/sftdd/gate-conformance-guard";

const F = "F4-pick-outbound";
const S = "S2-stock-row-unchanged";
const APPROVER = "po@example.com";

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-ac-conf-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

function acsDir(): string {
  const d = join(tdd, "features", F, "stories", S, "acs");
  mkdirSync(d, { recursive: true });
  return d;
}

/** A schema-conformant first-in-story AC. */
const CONFORMANT_AC = {
  id: "AC1-row-unchanged",
  layer: "Infra",
  given: "a stock row exists",
  when: "a pick is recorded elsewhere",
  then: "this row is unchanged",
  status: "draft",
  architectural_notes: "owner: stock service",
};

/** The exact defect: valid up to `architectural_notes`, then the file is cut off
 *  with NO closing brace (the truncation the spec-author writer left behind). */
const TRUNCATED_AC =
  '{\n  "id": "AC2-inline-error",\n  "layer": "API",\n  "given": "a quantity field",\n' +
  '  "when": "an invalid quantity is submitted",\n  "then": "an inline error is shown",\n' +
  '  "status": "draft",\n  "architectural_notes": "owner: pick form\n';

function surfaced(): void {
  const p = initPipeline(F);
  surfaceForGate(p, S); // creates the story entry + opens its gate
  writePipeline(tdd, p);
}

describe("storyAcsConformanceReason (Finding 29)", () => {
  it("returns null when every AC parses + conforms", () => {
    writeFileSync(join(acsDir(), "AC1-row-unchanged.json"), JSON.stringify(CONFORMANT_AC));
    expect(storyAcsConformanceReason(featureDir(tdd, F), S)).toBeNull();
  });

  it("flags a truncated / invalid-JSON AC as not valid JSON", () => {
    writeFileSync(join(acsDir(), "AC1-row-unchanged.json"), JSON.stringify(CONFORMANT_AC));
    writeFileSync(join(acsDir(), "AC2-inline-error.json"), TRUNCATED_AC);
    const reason = storyAcsConformanceReason(featureDir(tdd, F), S);
    expect(reason).toMatch(/not valid JSON/);
    expect(reason).toMatch(/AC2-inline-error\.json/);
  });
});

describe("approveStoryGateFromDisk refuses a malformed AC at the spec gate (Finding 29)", () => {
  it("approves a story whose ACs all conform", () => {
    surfaced();
    writeFileSync(join(acsDir(), "AC1-row-unchanged.json"), JSON.stringify(CONFORMANT_AC));
    const r = approveStoryGateFromDisk(tdd, F, S, { approver: APPROVER });
    expect(r.ok).toBe(true);
  });

  it("REFUSES to approve when an AC is truncated (the deploy-gate defect, caught early)", () => {
    surfaced();
    writeFileSync(join(acsDir(), "AC1-row-unchanged.json"), JSON.stringify(CONFORMANT_AC));
    writeFileSync(join(acsDir(), "AC2-inline-error.json"), TRUNCATED_AC);
    const r = approveStoryGateFromDisk(tdd, F, S, { approver: APPROVER });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not valid JSON/);
    // The gate stays unapproved: the story was never queued for build.
    expect(r.queue).toBeUndefined();
  });
});
