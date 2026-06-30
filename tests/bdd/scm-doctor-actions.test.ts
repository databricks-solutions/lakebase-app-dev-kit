// scm-doctor: surface GitHub-Actions-disabled (the EMU "CI never ran" case).
// Run without an instance so runDoctor returns right after the Actions check
// (before any Lakebase call); the two GitHub helpers are mocked.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const mockGetOwnerRepo = vi.fn();
const mockGetActionsEnabled = vi.fn();

vi.mock("../../scripts/git/remote.js", async () => {
  const actual = await vi.importActual<typeof import("../../scripts/git/remote.js")>(
    "../../scripts/git/remote.js",
  );
  return { ...actual, getOwnerRepo: (...a: unknown[]) => mockGetOwnerRepo(...a) };
});
vi.mock("../../scripts/github/repo.js", async () => {
  const actual = await vi.importActual<typeof import("../../scripts/github/repo.js")>(
    "../../scripts/github/repo.js",
  );
  return { ...actual, getActionsEnabled: (...a: unknown[]) => mockGetActionsEnabled(...a) };
});

const doctor = await import("../../scripts/lakebase/scm-doctor.js");

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scm-doctor-actions-"));
  mockGetOwnerRepo.mockReset();
  mockGetActionsEnabled.mockReset();
});
afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
});

// No .env + no instance -> runDoctor returns at the no-instance gate, which is
// AFTER the Actions check, so the check always runs.
const run = () => doctor.runDoctor({ projectDir: tmpDir });
const actionsFinding = (r: Awaited<ReturnType<typeof run>>) =>
  r.findings.find((f) => f.id === "github-actions-disabled");

describe("scm-doctor: GitHub Actions disabled", () => {
  it("flags github-actions-disabled (warn) when Actions is off for the repo", async () => {
    mockGetOwnerRepo.mockResolvedValue("databricks-field-eng/partner-asset-tracker");
    mockGetActionsEnabled.mockResolvedValue(false);
    const f = actionsFinding(await run());
    expect(f).toBeTruthy();
    expect(f!.severity).toBe("warn");
    expect(f!.message).toMatch(/Actions is disabled/);
    expect(f!.suggestion).toMatch(/org/i);
  });

  it("no finding when Actions is enabled", async () => {
    mockGetOwnerRepo.mockResolvedValue("o/r");
    mockGetActionsEnabled.mockResolvedValue(true);
    expect(actionsFinding(await run())).toBeUndefined();
  });

  it("no finding when the state is undetermined (no token / repo invisible)", async () => {
    mockGetOwnerRepo.mockResolvedValue("o/r");
    mockGetActionsEnabled.mockResolvedValue(undefined);
    expect(actionsFinding(await run())).toBeUndefined();
  });

  it("no probe + no finding when there is no GitHub remote", async () => {
    mockGetOwnerRepo.mockResolvedValue("");
    const f = actionsFinding(await run());
    expect(mockGetActionsEnabled).not.toHaveBeenCalled();
    expect(f).toBeUndefined();
  });

  it("never alarms when the probe throws", async () => {
    mockGetOwnerRepo.mockResolvedValue("o/r");
    mockGetActionsEnabled.mockRejectedValue(new Error("network"));
    expect(actionsFinding(await run())).toBeUndefined();
  });
});
