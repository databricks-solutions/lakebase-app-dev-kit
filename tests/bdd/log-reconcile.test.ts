// FEIP-7510/7422: per-role logging is prose-instructed, so a role model can do
// the substantive work (write story stubs + ACs) while emitting no
// `artifact.written` events. We saw exactly that when the spec-author was tiered
// to sonnet: 5 ACs on disk, zero log events. reconcileArtifactLog makes
// observability of the design phase STRUCTURAL instead of model-dependent: it
// scans the feature's artifacts on disk and emits an `artifact.written` event
// for every one the log does not already cover. Deterministic + idempotent.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { reconcileArtifactLog } from "../../scripts/tdd/log-reconcile";
import { readAgentLog, emitAgentLogEvent } from "../../scripts/tdd/agent-log";

const tmps: string[] = [];
afterEach(() => {
  while (tmps.length) { const d = tmps.pop(); if (d) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } }
});
function mkTdd(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-recon-"));
  tmps.push(root);
  return path.join(root, ".tdd");
}
const F = "F1-initial-domain";
function write(p: string, body = "{}"): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}
function scaffoldFeature(tddDir: string): void {
  const f = path.join(tddDir, "features", F);
  write(path.join(f, "feature-spec.json"));
  write(path.join(f, "stories", "S1", "story.json"));
  write(path.join(f, "stories", "S1", "acs", "AC1.json"));
  write(path.join(f, "stories", "S1", "acs", "AC2.json"));
  write(path.join(f, "stories", "S2", "story.json"));
}

describe("reconcileArtifactLog", () => {
  it("emits an artifact.written for every on-disk artifact the log does not cover", () => {
    const tddDir = mkTdd();
    scaffoldFeature(tddDir);

    const emitted = reconcileArtifactLog({ tddDir, featureId: F });

    const paths = emitted.map((e) => e.data?.path).sort();
    expect(paths).toEqual([
      `features/${F}/feature-spec.json`,
      `features/${F}/stories/S1/acs/AC1.json`,
      `features/${F}/stories/S1/acs/AC2.json`,
      `features/${F}/stories/S1/story.json`,
      `features/${F}/stories/S2/story.json`,
    ]);
    // All attributed to the spec-author (the owner of spec/story/AC artifacts),
    // tagged reconciled so they are distinguishable from a role's own emits.
    expect(emitted.every((e) => e.role === "spec-author")).toBe(true);
    expect(emitted.every((e) => e.event === "artifact.written" && e.data?.reconciled === true)).toBe(true);
    // The events are actually on disk in the log.
    expect(readAgentLog({ tddDir, featureId: F }).length).toBe(5);
  });

  it("is idempotent: a second reconcile emits nothing", () => {
    const tddDir = mkTdd();
    scaffoldFeature(tddDir);
    reconcileArtifactLog({ tddDir, featureId: F });
    const second = reconcileArtifactLog({ tddDir, featureId: F });
    expect(second).toEqual([]);
  });

  it("does not duplicate an artifact a role already logged (exact path)", () => {
    const tddDir = mkTdd();
    scaffoldFeature(tddDir);
    // The spec-author DID log AC1 itself.
    emitAgentLogEvent(
      { role: "spec-author", level: "info", event: "artifact.written", message: "AC1",
        feature_id: F, data: { path: `features/${F}/stories/S1/acs/AC1.json` } },
      { tddDir },
    );
    const emitted = reconcileArtifactLog({ tddDir, featureId: F });
    expect(emitted.map((e) => e.data?.path)).not.toContain(`features/${F}/stories/S1/acs/AC1.json`);
    expect(emitted.length).toBe(4); // the other four artifacts
  });

  it("attributes architecture + test-list to their owning roles", () => {
    const tddDir = mkTdd();
    const f = path.join(tddDir, "features", F);
    write(path.join(f, "architecture.json"));
    write(path.join(f, "test-list.json"));
    const emitted = reconcileArtifactLog({ tddDir, featureId: F });
    const byPath = Object.fromEntries(emitted.map((e) => [e.data?.path, e.role]));
    expect(byPath[`features/${F}/architecture.json`]).toBe("architect-reviewer");
    expect(byPath[`features/${F}/test-list.json`]).toBe("test-strategist");
  });

  it("returns [] for a feature with no artifacts yet", () => {
    const tddDir = mkTdd();
    expect(reconcileArtifactLog({ tddDir, featureId: F })).toEqual([]);
  });
});
