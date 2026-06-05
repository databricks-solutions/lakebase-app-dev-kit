// Unit tests for the SCM phase B claim-feature helper (FEIP-7458).
//
// claimFeatureBranch is the workflow-aware wrapper around
// createFeaturePairedBranch. These tests pin its precondition gate +
// parent-branch resolution + state transition without hitting Lakebase
// or git. createFeaturePairedBranch + getDefaultBranchId are mocked.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const mockCreateFeaturePairedBranch = vi.fn();
const mockGetDefaultBranchId = vi.fn();

vi.mock("../../scripts/lakebase/convention-branches.js", () => ({
  createFeaturePairedBranch: (...args: unknown[]) =>
    mockCreateFeaturePairedBranch(...args),
}));
vi.mock("../../scripts/lakebase/lakebase-project.js", () => ({
  getDefaultBranchId: (...args: unknown[]) => mockGetDefaultBranchId(...args),
}));

const scm = await import("../../scripts/lakebase/scm-claim-feature.js");
const state = await import("../../scripts/lakebase/scm-workflow-state.js");
type ScmWorkflowState = Awaited<ReturnType<typeof state.readWorkflowState>> &
  object;

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scm-claim-"));
  mockCreateFeaturePairedBranch.mockReset();
  mockGetDefaultBranchId.mockReset();
  mockCreateFeaturePairedBranch.mockResolvedValue({
    branch: {
      name: "projects/p/branches/feature-initial-domain",
      uid: "br-broad-sky-d2k5gewt",
      state: "READY",
      isDefault: false,
    },
    gitBranch: "feature-initial-domain",
    gitBranchCreated: true,
    envSynced: true,
    warnings: [],
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seedState(s: ScmWorkflowState): void {
  state.writeWorkflowState(tmpDir, s);
}

const fixedNow = () => new Date("2026-06-03T12:00:00Z");

describe("sanitizeFeatureSlug", () => {
  it("strips whitespace + sanitizes to lakebase-safe slug", () => {
    expect(scm.sanitizeFeatureSlug("  initial domain  ")).toBe(
      "initial-domain",
    );
  });
  it("rejects empty / whitespace-only input", () => {
    expect(() => scm.sanitizeFeatureSlug("")).toThrow(/empty/);
    expect(() => scm.sanitizeFeatureSlug("   ")).toThrow(/empty/);
  });
  it("rejects input with no alphanumerics", () => {
    expect(() => scm.sanitizeFeatureSlug("---")).toThrow(
      /no letters\/digits/,
    );
  });
});

describe("featureBranchName", () => {
  it("returns the canonical sanitized branch name (slash-less, lowercased)", () => {
    // The canonical name is what the substrate's sanitizer produces, so a
    // paired git branch matches its Lakebase branch id.
    expect(scm.featureBranchName("initial-domain")).toBe("feature-initial-domain");
    expect(scm.featureBranchName("F1-initial-domain")).toBe("feature-f1-initial-domain");
  });
});

describe("resolveParentBranch", () => {
  it("tier 1 -> default branch from Lakebase", async () => {
    mockGetDefaultBranchId.mockResolvedValue("main");
    const parent = await scm.resolveParentBranch(1, "proj-x");
    expect(parent).toBe("main");
    expect(mockGetDefaultBranchId).toHaveBeenCalledWith({ projectId: "proj-x" });
  });
  it("tier 2 -> staging (no Lakebase call needed)", async () => {
    expect(await scm.resolveParentBranch(2, "p")).toBe("staging");
    expect(mockGetDefaultBranchId).not.toHaveBeenCalled();
  });
  it("tier 3 -> dev (no Lakebase call needed)", async () => {
    expect(await scm.resolveParentBranch(3, "p")).toBe("dev");
    expect(mockGetDefaultBranchId).not.toHaveBeenCalled();
  });
  it("tier 1 throws when default branch resolution comes back empty", async () => {
    mockGetDefaultBranchId.mockResolvedValue("");
    await expect(scm.resolveParentBranch(1, "p")).rejects.toThrow(
      /no default Lakebase branch/,
    );
  });
});

describe("claimFeatureBranch precondition", () => {
  it("refuses when no state file exists (no-state-file)", async () => {
    await expect(
      scm.claimFeatureBranch({
        projectDir: tmpDir,
        featureId: "initial-domain",
      }),
    ).rejects.toMatchObject({
      name: "ScmClaimError",
      code: "no-state-file",
    });
  });

  it("refuses claim from pr-ready (bad-precondition)", async () => {
    seedState({
      version: 1,
      state: "pr-ready",
      tier_topology: 2,
      project_id: "p",
      feature_id: "old",
      branch: "feature/old",
      parent_branch: "staging",
      lakebase_branch_uid: "br-old",
      claimed_at: "2026-05-01T00:00:00Z",
      pr_url: "https://github.com/o/r/pull/1",
      pushed_at: "2026-05-01T01:00:00Z",
    });
    await expect(
      scm.claimFeatureBranch({
        projectDir: tmpDir,
        featureId: "new-feature",
      }),
    ).rejects.toMatchObject({ code: "bad-precondition" });
  });

  it("refuses re-claim of a DIFFERENT feature when already feature-claimed", async () => {
    seedState({
      version: 1,
      state: "feature-claimed",
      tier_topology: 2,
      project_id: "p",
      feature_id: "existing",
      branch: "feature/existing",
      parent_branch: "staging",
      lakebase_branch_uid: "br-existing",
      claimed_at: "2026-05-01T00:00:00Z",
    });
    await expect(
      scm.claimFeatureBranch({
        projectDir: tmpDir,
        featureId: "different-feature",
      }),
    ).rejects.toMatchObject({ code: "already-claimed-other" });
  });

  it("idempotent re-claim of the SAME feature returns a no-op", async () => {
    seedState({
      version: 1,
      state: "feature-claimed",
      tier_topology: 2,
      project_id: "p",
      feature_id: "initial-domain",
      branch: "feature-initial-domain",
      parent_branch: "staging",
      lakebase_branch_uid: "br-old",
      claimed_at: "2026-05-01T00:00:00Z",
    });
    const result = await scm.claimFeatureBranch({
      projectDir: tmpDir,
      featureId: "initial-domain",
    });
    expect(result.alreadyClaimed).toBe(true);
    expect(mockCreateFeaturePairedBranch).not.toHaveBeenCalled();
  });

  // FEIP-7508 smoke findings: the stored branch is the substrate's sanitized
  // hyphen form ("feature-f1-initial-domain") and the canonical feature id
  // carries case ("F1-..."). Idempotency must compare by slug so neither the
  // slash-vs-hyphen nor the case difference mislabels a same-feature re-claim.
  it("idempotent re-claim is immune to branch-format + case (real smoke shape)", async () => {
    seedState({
      version: 1,
      state: "feature-claimed",
      tier_topology: 2,
      project_id: "p",
      feature_id: "F1-initial-domain",
      branch: "feature-f1-initial-domain",
      parent_branch: "staging",
      lakebase_branch_uid: "br-old",
      claimed_at: "2026-05-01T00:00:00Z",
    });
    const result = await scm.claimFeatureBranch({
      projectDir: tmpDir,
      featureId: "F1-initial-domain",
    });
    expect(result.alreadyClaimed).toBe(true);
    expect(mockCreateFeaturePairedBranch).not.toHaveBeenCalled();
  });
});

describe("claimFeatureBranch happy path", () => {
  it("tier-2 project: calls substrate with parent=staging + writes feature-claimed state", async () => {
    seedState({
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "demo-app",
    });
    const result = await scm.claimFeatureBranch({
      projectDir: tmpDir,
      featureId: "initial-domain",
      now: fixedNow,
    });

    expect(result.alreadyClaimed).toBe(false);
    expect(mockCreateFeaturePairedBranch).toHaveBeenCalledTimes(1);
    expect(mockCreateFeaturePairedBranch.mock.calls[0][0]).toMatchObject({
      instance: "demo-app",
      branch: "feature-initial-domain",
      parentBranch: "staging",
      cwd: tmpDir,
    });
    expect(result.state).toMatchObject({
      state: "feature-claimed",
      feature_id: "initial-domain",
      branch: "feature-initial-domain",
      parent_branch: "staging",
      lakebase_branch_uid: "br-broad-sky-d2k5gewt",
      claimed_at: "2026-06-03T12:00:00.000Z",
    });

    // State file on disk should round-trip back.
    const reread = state.readWorkflowState(tmpDir);
    expect(reread?.state).toBe("feature-claimed");
    expect(reread?.branch).toBe("feature-initial-domain");
    expect(reread?.lakebase_branch_uid).toBe("br-broad-sky-d2k5gewt");
  });

  it("tier-3 project: forks from dev", async () => {
    seedState({
      version: 1,
      state: "scaffold-complete",
      tier_topology: 3,
      project_id: "demo-app",
    });
    await scm.claimFeatureBranch({
      projectDir: tmpDir,
      featureId: "foo",
      now: fixedNow,
    });
    expect(mockCreateFeaturePairedBranch.mock.calls[0][0]).toMatchObject({
      parentBranch: "dev",
    });
  });

  it("tier-1 project: forks from the Lakebase default branch", async () => {
    seedState({
      version: 1,
      state: "scaffold-complete",
      tier_topology: 1,
      project_id: "tiny",
    });
    mockGetDefaultBranchId.mockResolvedValue("main");
    await scm.claimFeatureBranch({
      projectDir: tmpDir,
      featureId: "foo",
      now: fixedNow,
    });
    expect(mockGetDefaultBranchId).toHaveBeenCalledWith({ projectId: "tiny" });
    expect(mockCreateFeaturePairedBranch.mock.calls[0][0]).toMatchObject({
      parentBranch: "main",
    });
  });

  it("--parent override wins over tier-default", async () => {
    seedState({
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "p",
    });
    await scm.claimFeatureBranch({
      projectDir: tmpDir,
      featureId: "hotfix-x",
      parentBranchOverride: "production",
      now: fixedNow,
    });
    expect(mockCreateFeaturePairedBranch.mock.calls[0][0]).toMatchObject({
      parentBranch: "production",
    });
    expect(mockGetDefaultBranchId).not.toHaveBeenCalled();
  });

  it("transitioning from merged is allowed and clears stale later-state fields", async () => {
    seedState({
      version: 1,
      state: "merged",
      tier_topology: 2,
      project_id: "p",
      feature_id: "previous",
      branch: "feature/previous",
      parent_branch: "staging",
      lakebase_branch_uid: "br-previous",
      claimed_at: "2026-05-01T00:00:00Z",
      pr_url: "https://github.com/o/r/pull/1",
      pushed_at: "2026-05-01T01:00:00Z",
      ci_run_url: "https://github.com/o/r/actions/runs/1",
      ci_green_at: "2026-05-01T02:00:00Z",
      merged_at: "2026-05-01T03:00:00Z",
    });
    const result = await scm.claimFeatureBranch({
      projectDir: tmpDir,
      featureId: "fresh-start",
      now: fixedNow,
    });
    expect(result.state.feature_id).toBe("fresh-start");
    expect(result.state.pr_url).toBeUndefined();
    expect(result.state.pushed_at).toBeUndefined();
    expect(result.state.ci_run_url).toBeUndefined();
    expect(result.state.ci_green_at).toBeUndefined();
    expect(result.state.merged_at).toBeUndefined();
  });

  it("--instance flag overrides project_id from state", async () => {
    seedState({
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "from-state",
    });
    await scm.claimFeatureBranch({
      projectDir: tmpDir,
      featureId: "foo",
      instance: "from-flag",
      now: fixedNow,
    });
    expect(mockCreateFeaturePairedBranch.mock.calls[0][0]).toMatchObject({
      instance: "from-flag",
    });
  });
});

