// lakebase-sftdd-spike: cut/list/delete throwaway spike branches.
// cut/delete touch live Lakebase (covered by the live smoke); here we test the
// hermetic parts: the carry-forward note tagging, list, and arg validation.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { spikeNotes } from "../../scripts/sftdd/spike";
import { collectSpikeInputs } from "../../scripts/sftdd/spike-carryforward";
import { runSpikeCli } from "../../scripts/sftdd/spike.cli";

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "spike-cli-"));
});
afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function seedSpike(slug: string, notes: string): void {
  const dir = join(tdd, "spikes", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "branch.txt"), `spike/${slug}`);
  writeFileSync(join(dir, "notes.md"), notes);
}

describe("spikeNotes carry-forward tagging", () => {
  it("plain notes carry no feature marker", () => {
    const notes = spikeNotes("idea-x");
    expect(notes).not.toMatch(/for_feature/);
    seedSpike("idea-x", notes);
    expect(collectSpikeInputs({ tddDir: tdd, featureId: "F1-a" })).toHaveLength(0);
  });

  it("--for tags the notes so the feature's design-spec gate picks them up", () => {
    const notes = spikeNotes("idea-x", "F1-a");
    expect(notes).toMatch(/^---\nfor_feature: F1-a\n---/);
    seedSpike("idea-x", notes);
    const inputs = collectSpikeInputs({ tddDir: tdd, featureId: "F1-a" });
    expect(inputs).toHaveLength(1);
    expect(inputs[0].slug).toBe("idea-x");
    // ... but not for a different feature.
    expect(collectSpikeInputs({ tddDir: tdd, featureId: "F2-b" })).toHaveLength(0);
  });
});

describe("runSpikeCli", () => {
  it("list emits the seeded spikes as JSON", async () => {
    seedSpike("idea-x", spikeNotes("idea-x"));
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s: string | Uint8Array) => {
      out.push(String(s));
      return true;
    });
    const code = await runSpikeCli(["list", "--tdd-dir", tdd, "--json"]);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join("")) as Array<{ spike_slug: string }>;
    expect(parsed.map((s) => s.spike_slug)).toEqual(["idea-x"]);
  });

  it("cut refuses without --slug / --instance", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(await runSpikeCli(["cut", "--slug", "x"])).toBe(2); // no --instance
    expect(await runSpikeCli(["cut", "--instance", "i"])).toBe(2); // no --slug
  });

  it("rejects an unknown subcommand", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(await runSpikeCli(["frobnicate"])).toBe(2);
  });
});
