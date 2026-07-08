// reconstituteAgentLog rewrites a design-REPLAYED capture's agent-log into ONE
// coherent recording: the design lane verbatim from the recorded design log
// (original token/cost, original capture date), the live build + any live design
// turn kept with real cost but re-dated onto that timeline, and the synthetic
// "present on disk (reconciled)" placeholders dropped.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { reconstituteAgentLog } from "../../scripts/sftdd/log-reconstitute";

const tmps: string[] = [];
afterEach(() => {
  while (tmps.length) { const d = tmps.pop(); if (d) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } }
});

function setup(): { sftddDir: string; designLog: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-recon2-"));
  tmps.push(root);
  const sftddDir = path.join(root, ".sftdd");
  fs.mkdirSync(sftddDir, { recursive: true });
  return { sftddDir, designLog: path.join(root, "agent-log.design.jsonl") };
}
const jl = (events: object[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";

describe("reconstituteAgentLog", () => {
  it("uses recorded design entries verbatim (date + cost), drops reconciled, re-dates live build onto the design timeline", () => {
    const { sftddDir, designLog } = setup();

    // Recorded design lane (original capture day 2026-06-15), incl. real costs.
    fs.writeFileSync(designLog, jl([
      { timestamp: "2026-06-15T01:55:38.563Z", level: "info", role: "product-owner", event: "gate.approved", message: "product-owner approved intake", metadata: { feature_id: "F1" } },
      { timestamp: "2026-06-15T03:47:12.805Z", level: "info", role: "architect-reviewer", model: "opus", event: "turn.usage", message: "architect-reviewer turn used 320 input + 13584 output tokens", metadata: { feature_id: "F1", input_tokens: 320, output_tokens: 13584, cost_usd: 1.027803, story: "S1" } },
    ]));

    // Live project log (this run, 2026-06-24): a synthetic reconciled placeholder,
    // a live duplicate of the PO intake (wrong run date), a live F6 breakdown turn
    // (not in the corpus), and a live build turn , all on the run's clock.
    fs.writeFileSync(path.join(sftddDir, "agent-log.jsonl"), jl([
      { timestamp: "2026-06-24T11:00:00.000Z", level: "info", role: "product-owner", event: "gate.approved", message: "product-owner approved intake", metadata: { feature_id: "F1" } },
      { timestamp: "2026-06-24T11:01:00.000Z", level: "info", role: "spec-author", event: "artifact.written", message: "spec-author wrote architecture.json , present on disk (reconciled)", metadata: { feature_id: "F1", reconciled: true, path: "x" } },
      { timestamp: "2026-06-24T11:05:00.000Z", level: "info", role: "spec-author", event: "turn.usage", message: "spec-author turn used 9 input + 99 output tokens", metadata: { feature_id: "F6", input_tokens: 9, output_tokens: 99, cost_usd: 0.05, story: "S1" } },
      { timestamp: "2026-06-24T11:30:00.000Z", level: "info", role: "driver", event: "turn.usage", message: "driver turn used 1 input + 2 output tokens", metadata: { feature_id: "F1", input_tokens: 1, output_tokens: 2, cost_usd: 0.5 } },
    ]));

    const final = reconstituteAgentLog({ sftddDir, designLogPath: designLog });

    // No synthetic reconciled placeholders survive.
    expect(final.some((e) => e.metadata?.reconciled === true)).toBe(false);
    // The architect turn.usage is the recorded original: exact cost + 6/15 date.
    const arch = final.find((e) => e.role === "architect-reviewer" && e.event === "turn.usage")!;
    expect(arch.metadata?.cost_usd).toBe(1.027803);
    expect(arch.timestamp).toBe("2026-06-15T03:47:12.805Z");
    // The PO intake appears ONCE, from the corpus (6/15), not the run-dated dup.
    const po = final.filter((e) => e.role === "product-owner" && e.event === "gate.approved");
    expect(po.length).toBe(1);
    expect(po[0].timestamp).toBe("2026-06-15T01:55:38.563Z");
    // The live F6 breakdown + build turns are KEPT with real cost, re-dated onto
    // the 2026-06-15 timeline (after the last design entry), not the run's 6/24.
    const f6 = final.find((e) => e.role === "spec-author" && e.metadata?.feature_id === "F6")!;
    expect(f6.metadata?.cost_usd).toBe(0.05);
    expect(f6.timestamp.startsWith("2026-06-15")).toBe(true);
    const drv = final.find((e) => e.role === "driver")!;
    expect(drv.metadata?.cost_usd).toBe(0.5);
    expect(drv.timestamp.startsWith("2026-06-15")).toBe(true);
    // Re-dated live entries sort AFTER the last design entry.
    expect(Date.parse(drv.timestamp)).toBeGreaterThan(Date.parse(arch.timestamp));
  });
});
