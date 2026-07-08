// BDD coverage for the spike to design-spec carry-forward primitive.
// Hermetic: tmpdir-based .tdd/ trees, no shell-outs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  attachSpikeInputs,
  collectSpikeInputs,
} from "../../scripts/sftdd/spike-carryforward";

function mkTempTdd(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `spike-carryforward-${prefix}-`));
}

function rm(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

function seedSpike(sftddDir: string, slug: string, notes: string): void {
  const dir = path.join(sftddDir, "spikes", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "notes.md"), notes, "utf8");
  fs.writeFileSync(path.join(dir, "branch.txt"), `spike-${slug}`, "utf8");
}

function seedPlan(sftddDir: string, featureId: string, plan: Record<string, unknown>): void {
  const dir = path.join(sftddDir, "features", featureId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2) + "\n");
}

describe("collectSpikeInputs", () => {
  let sftddDir: string;
  beforeEach(() => {
    sftddDir = mkTempTdd("collect");
  });
  afterEach(() => rm(sftddDir));

  it("returns [] when .tdd/spikes/ does not exist", () => {
    expect(collectSpikeInputs({ sftddDir, featureId: "F1" })).toEqual([]);
  });

  it("matches a spike tagged via YAML frontmatter for_feature", () => {
    seedSpike(
      sftddDir,
      "explore-cart",
      "---\nfor_feature: F1-checkout\n---\n\n# explore-cart\n\nTried postgres arrays. Worked.\n"
    );
    const result = collectSpikeInputs({ sftddDir, featureId: "F1-checkout" });
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("explore-cart");
    expect(result[0].matched_marker).toBe("frontmatter:for_feature");
    expect(result[0].preview).toContain("Tried postgres arrays");
  });

  it("matches a spike tagged via a body line `For feature:`", () => {
    seedSpike(
      sftddDir,
      "explore-json",
      "# explore-json\n\nFor feature: F1-checkout\n\nTried JSON blobs. Cheaper to write.\n"
    );
    const result = collectSpikeInputs({ sftddDir, featureId: "F1-checkout" });
    expect(result).toHaveLength(1);
    expect(result[0].matched_marker).toMatch(/^body:/);
  });

  it("matches multiple key variants in body lines (feature_id, feature)", () => {
    seedSpike(sftddDir, "a", "feature_id: F1\n");
    seedSpike(sftddDir, "b", "feature: F1\n");
    seedSpike(sftddDir, "c", "**For feature:** F1\n");
    const result = collectSpikeInputs({ sftddDir, featureId: "F1" });
    expect(result.map((r) => r.slug)).toEqual(["a", "b", "c"]);
  });

  it("does not match the wrong feature id (no prefix matching)", () => {
    seedSpike(sftddDir, "explore-cart", "for_feature: F1-checkout\n");
    expect(collectSpikeInputs({ sftddDir, featureId: "F1" })).toEqual([]);
    expect(collectSpikeInputs({ sftddDir, featureId: "F1-checkout-extra" })).toEqual([]);
  });

  it("skips untagged spikes without throwing", () => {
    seedSpike(sftddDir, "no-tag", "# spike\n\nGeneric exploration; no feature reference.\n");
    expect(collectSpikeInputs({ sftddDir, featureId: "F1" })).toEqual([]);
  });

  it("returns results sorted by slug for deterministic output", () => {
    seedSpike(sftddDir, "zeta", "for_feature: F1\n");
    seedSpike(sftddDir, "alpha", "for_feature: F1\n");
    seedSpike(sftddDir, "mu", "for_feature: F1\n");
    const result = collectSpikeInputs({ sftddDir, featureId: "F1" });
    expect(result.map((r) => r.slug)).toEqual(["alpha", "mu", "zeta"]);
  });

  it("truncates long previews and excludes frontmatter from preview text", () => {
    const long = "a".repeat(500);
    seedSpike(sftddDir, "long", `---\nfor_feature: F1\n---\n\n${long}\n`);
    const result = collectSpikeInputs({ sftddDir, featureId: "F1" });
    expect(result[0].preview.length).toBeLessThanOrEqual(200);
    expect(result[0].preview).not.toContain("for_feature");
  });

  it("ignores entries in the spikes dir that are not directories with notes.md", () => {
    fs.mkdirSync(path.join(sftddDir, "spikes"), { recursive: true });
    fs.writeFileSync(path.join(sftddDir, "spikes", "stray-file.md"), "for_feature: F1\n");
    expect(collectSpikeInputs({ sftddDir, featureId: "F1" })).toEqual([]);
  });
});

describe("attachSpikeInputs", () => {
  let sftddDir: string;
  beforeEach(() => {
    sftddDir = mkTempTdd("attach");
  });
  afterEach(() => rm(sftddDir));

  it("writes the resolved spike inputs onto plan.json", () => {
    seedSpike(sftddDir, "explore-cart", "for_feature: F1\n\nTried arrays. Worked.\n");
    seedPlan(sftddDir, "F1", { feature_id: "F1", N: 1, mode: "N=1" });
    const result = attachSpikeInputs({ sftddDir, featureId: "F1", slugs: ["explore-cart"] });
    expect(result.attached).toHaveLength(1);
    expect(result.unresolved).toEqual([]);
    const plan = JSON.parse(fs.readFileSync(path.join(sftddDir, "features", "F1", "plan.json"), "utf8"));
    expect(plan.spike_inputs).toHaveLength(1);
    expect(plan.spike_inputs[0].slug).toBe("explore-cart");
  });

  it("reports unresolved slugs without writing them", () => {
    seedSpike(sftddDir, "real-spike", "for_feature: F1\n");
    seedPlan(sftddDir, "F1", { feature_id: "F1" });
    const result = attachSpikeInputs({
      sftddDir,
      featureId: "F1",
      slugs: ["real-spike", "ghost-spike"],
    });
    expect(result.attached).toHaveLength(1);
    expect(result.unresolved).toEqual(["ghost-spike"]);
    const plan = JSON.parse(fs.readFileSync(path.join(sftddDir, "features", "F1", "plan.json"), "utf8"));
    expect(plan.spike_inputs.map((i: { slug: string }) => i.slug)).toEqual(["real-spike"]);
  });

  it("clears spike_inputs when called with an empty slug list", () => {
    seedSpike(sftddDir, "explore", "for_feature: F1\n");
    seedPlan(sftddDir, "F1", {
      feature_id: "F1",
      spike_inputs: [{ slug: "old", notes_path: "x", preview: "y", matched_marker: "z" }],
    });
    attachSpikeInputs({ sftddDir, featureId: "F1", slugs: [] });
    const plan = JSON.parse(fs.readFileSync(path.join(sftddDir, "features", "F1", "plan.json"), "utf8"));
    expect(plan.spike_inputs).toBeUndefined();
  });

  it("is idempotent: re-running with the same slugs produces the same plan.json content", () => {
    seedSpike(sftddDir, "explore", "for_feature: F1\n");
    seedPlan(sftddDir, "F1", { feature_id: "F1" });
    attachSpikeInputs({ sftddDir, featureId: "F1", slugs: ["explore"] });
    const first = fs.readFileSync(path.join(sftddDir, "features", "F1", "plan.json"), "utf8");
    attachSpikeInputs({ sftddDir, featureId: "F1", slugs: ["explore"] });
    const second = fs.readFileSync(path.join(sftddDir, "features", "F1", "plan.json"), "utf8");
    expect(second).toBe(first);
  });

  it("throws when plan.json is missing", () => {
    expect(() => attachSpikeInputs({ sftddDir, featureId: "F1", slugs: ["x"] })).toThrow(
      /plan\.json not found/
    );
  });
});

function seedFeatureDir(sftddDir: string, featureId: string): void {
  fs.mkdirSync(path.join(sftddDir, "features", featureId), { recursive: true });
}

describe("analyzeForGate populates spike_inputs when spikes match", () => {
  it("returns proposed_plan.spike_inputs containing the matching spikes", async () => {
    const { analyzeForGate } = await import("../../scripts/sftdd/design-spec-gate");
    const { writeMasterTestList } = await import("../../scripts/sftdd/test-list");
    const sftddDir = mkTempTdd("analyze");
    try {
      seedFeatureDir(sftddDir, "F1");
      writeMasterTestList(sftddDir, {
        feature_id: "F1",
        items: [{ id: "T1", description: "POST /orders returns 201", ac_id: "AC1", status: "pending" }],
      });
      seedSpike(sftddDir, "explore-cart", "for_feature: F1\n\nTried arrays.\n");
      const analysis = analyzeForGate(sftddDir, "F1", "S1");
      expect(analysis.proposed_plan.spike_inputs).toHaveLength(1);
      expect(analysis.proposed_plan.spike_inputs?.[0].slug).toBe("explore-cart");
    } finally {
      rm(sftddDir);
    }
  });

  it("omits spike_inputs from the proposed plan when no spike matches", async () => {
    const { analyzeForGate } = await import("../../scripts/sftdd/design-spec-gate");
    const { writeMasterTestList } = await import("../../scripts/sftdd/test-list");
    const sftddDir = mkTempTdd("analyze-none");
    try {
      seedFeatureDir(sftddDir, "F1");
      writeMasterTestList(sftddDir, {
        feature_id: "F1",
        items: [{ id: "T1", description: "any", ac_id: "AC1", status: "pending" }],
      });
      const analysis = analyzeForGate(sftddDir, "F1", "S1");
      expect(analysis.proposed_plan.spike_inputs).toBeUndefined();
    } finally {
      rm(sftddDir);
    }
  });
});
