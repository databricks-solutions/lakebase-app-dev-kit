// createPairedBranch step 4 (.env sync) must WAIT for the branch's endpoint to
// come up, not single-shot it. A freshly-cut Lakebase branch provisions its
// endpoint asynchronously, so a bare getEndpoint right after the cut races the
// host appearing: it returns undefined, the sync is silently skipped, and the
// experiment branch is left with an empty DATABASE_URL (the symptom only surfaces
// turns later at the build's honest-GREEN verify). Step 4 therefore uses
// ensureEndpoint (get-or-create + poll until a host appears, or throw on timeout).
// These hermetic tests pin that wiring by mocking the substrate seams.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const createBranch = vi.fn();
const waitForBranchReady = vi.fn();
const ensureEndpoint = vi.fn();
const getEndpoint = vi.fn();
const getCredential = vi.fn();
const mintCredential = vi.fn();
const updateEnvConnection = vi.fn();
const ensureProfilePinned = vi.fn();

vi.mock("../../scripts/lakebase/branch-create", () => ({
  createBranch: (...a: unknown[]) => createBranch(...a),
  waitForBranchReady: (...a: unknown[]) => waitForBranchReady(...a),
}));
vi.mock("../../scripts/lakebase/branch-endpoint", () => ({
  ensureEndpoint: (...a: unknown[]) => ensureEndpoint(...a),
  getEndpoint: (...a: unknown[]) => getEndpoint(...a),
  getCredential: (...a: unknown[]) => getCredential(...a),
  endpointPath: (instance: string, branch: string) => `projects/${instance}/branches/${branch}/endpoints/primary`,
}));
vi.mock("../../scripts/lakebase/get-connection", () => ({
  mintCredential: (...a: unknown[]) => mintCredential(...a),
}));
vi.mock("../../scripts/lakebase/env-file", () => ({
  updateEnvConnection: (...a: unknown[]) => updateEnvConnection(...a),
}));
vi.mock("../../scripts/lakebase/databricks-profile", () => ({
  ensureProfilePinned: (...a: unknown[]) => ensureProfilePinned(...a),
}));

import { createPairedBranch } from "../../scripts/lakebase/paired-branch";

let proj: string;

beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), "paired-envsync-"));
  for (const m of [
    createBranch,
    waitForBranchReady,
    ensureEndpoint,
    getEndpoint,
    getCredential,
    mintCredential,
    updateEnvConnection,
    ensureProfilePinned,
  ]) {
    m.mockReset();
  }
  createBranch.mockResolvedValue({ name: "projects/inst/branches/exp1", state: "READY" });
  ensureEndpoint.mockResolvedValue({ host: "exp1.db.example.com", state: "ACTIVE" });
  mintCredential.mockResolvedValue({ token: "tok", email: "u@example.com" });
  ensureProfilePinned.mockResolvedValue(undefined);
});

describe("createPairedBranch .env sync waits for the endpoint", () => {
  it("syncs via ensureEndpoint (the waiting primitive), not a bare getEndpoint", async () => {
    const res = await createPairedBranch({
      instance: "inst",
      branch: "exp1",
      cwd: proj,
      createGitBranch: false,
      syncEnv: true,
    });

    expect(ensureEndpoint).toHaveBeenCalledTimes(1);
    // The race-prone single-shot getEndpoint must NOT be the step-4 path.
    expect(getEndpoint).not.toHaveBeenCalled();
    expect(res.envSynced).toBe(true);
    expect(res.warnings).toEqual([]);
    // .env was written with the resolved endpoint host.
    expect(updateEnvConnection).toHaveBeenCalledWith(
      expect.objectContaining({ endpointHost: "exp1.db.example.com", branchId: "exp1" })
    );
  });

  it("reports envSynced=false with a warning when the endpoint never comes up", async () => {
    ensureEndpoint.mockRejectedValue(new Error("did not reach ACTIVE within 120000ms"));
    const res = await createPairedBranch({
      instance: "inst",
      branch: "exp1",
      cwd: proj,
      createGitBranch: false,
      syncEnv: true,
    });
    expect(res.envSynced).toBe(false);
    expect(res.warnings.join(" ")).toMatch(/\.env sync failed.*did not reach ACTIVE/);
    expect(updateEnvConnection).not.toHaveBeenCalled();
  });
});
