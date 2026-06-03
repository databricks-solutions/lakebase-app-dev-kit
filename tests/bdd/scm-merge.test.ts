// Unit tests for scm-merge (FEIP-7458 phase B+).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const mockMergePaired = vi.fn();
const mockGetOwnerRepo = vi.fn();
const mockGetCurrentBranch = vi.fn();
const mockExec = vi.fn();

vi.mock("../../scripts/github/pr.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../scripts/github/pr.js")
  >("../../scripts/github/pr.js");
  return {
    ...actual,
    mergePairedPullRequest: (...args: unknown[]) => mockMergePaired(...args),
  };
});
vi.mock("../../scripts/git/remote.js", () => ({
  getOwnerRepo: (...args: unknown[]) => mockGetOwnerRepo(...args),
  getGitHubUrl: vi.fn(),
  addRemote: vi.fn(),
  removeRemote: vi.fn(),
  listRemotes: vi.fn(),
  deleteRemoteBranch: vi.fn(),
}));
vi.mock("../../scripts/git/inspect.js", () => ({
  getCurrentBranch: (...args: unknown[]) => mockGetCurrentBranch(...args),
  getRepoRoot: vi.fn(),
}));
vi.mock("../../scripts/util/exec.js", () => ({
  exec: (...args: unknown[]) => mockExec(...args),
  shq: (s: string) => `'${s}'`,
}));

const merge = await import("../../scripts/lakebase/scm-merge.js");
const state = await import("../../scripts/lakebase/scm-workflow-state.js");

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scm-merge-"));
  mockMergePaired.mockReset();
  mockGetOwnerRepo.mockReset();
  mockGetCurrentBranch.mockReset();
  mockExec.mockReset();
  mockGetOwnerRepo.mockResolvedValue("kevin-hartman/demo");
  mockMergePaired.mockResolvedValue({
    message: "Merged",
    headBranch: "feature/x",
    lakebaseBranchDeleted: true,
    warnings: [],
  });
  mockGetCurrentBranch.mockResolvedValue("feature/x");
  mockExec.mockResolvedValue("");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seedCiGreen(prUrl: string = "https://github.com/kevin-hartman/demo/pull/42"): void {
  state.writeWorkflowState(tmpDir, {
    version: 1,
    state: "ci-green",
    tier_topology: 2,
    project_id: "p",
    feature_id: "x",
    branch: "feature/x",
    parent_branch: "staging",
    lakebase_branch_uid: "br-x",
    claimed_at: "2026-05-01T00:00:00Z",
    pr_url: prUrl,
    pushed_at: "2026-05-01T01:00:00Z",
    ci_run_url: "https://github.com/kevin-hartman/demo/actions/runs/9999",
    ci_green_at: "2026-05-01T02:00:00Z",
  });
}

describe("extractPullNumber", () => {
  it("returns the number for a standard PR URL", () => {
    expect(
      merge.extractPullNumber("https://github.com/o/r/pull/123"),
    ).toBe(123);
  });
  it("returns the number when URL has trailing fragments", () => {
    expect(
      merge.extractPullNumber("https://github.com/o/r/pull/123/files"),
    ).toBe(123);
  });
  it("returns undefined for non-PR URLs", () => {
    expect(
      merge.extractPullNumber("https://github.com/o/r"),
    ).toBeUndefined();
  });
});

describe("mergeFeature precondition", () => {
  it("refuses when no state file", async () => {
    await expect(merge.mergeFeature({ projectDir: tmpDir })).rejects.toMatchObject(
      { code: "no-state-file" },
    );
  });
  it("refuses when not at ci-green", async () => {
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "feature-claimed",
      tier_topology: 2,
      project_id: "p",
      feature_id: "x",
      branch: "feature/x",
      parent_branch: "staging",
      lakebase_branch_uid: "br-x",
      claimed_at: "2026-05-01T00:00:00Z",
    });
    await expect(merge.mergeFeature({ projectDir: tmpDir })).rejects.toMatchObject(
      { code: "bad-precondition" },
    );
  });
  it("refuses on a bad PR URL", async () => {
    seedCiGreen("https://example.com/not-a-pr");
    await expect(merge.mergeFeature({ projectDir: tmpDir })).rejects.toMatchObject(
      { code: "bad-pr-url" },
    );
  });
});

describe("mergeFeature happy path", () => {
  it("invokes mergePairedPullRequest with squash + advances to merged", async () => {
    seedCiGreen();
    const result = await merge.mergeFeature({
      projectDir: tmpDir,
      waitMigrate: false,
      now: () => new Date("2026-06-03T12:00:00Z"),
    });
    expect(mockMergePaired).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerRepo: "kevin-hartman/demo",
        pullNumber: 42,
        lakebaseInstance: "p",
        method: "squash",
      }),
    );
    expect(result.state.state).toBe("merged");
    expect(result.state.merged_at).toBe("2026-06-03T12:00:00.000Z");
    expect(result.headAfter).toBe("staging");
    expect(result.localBranchDeleted).toBe(true);
  });

  it("--method override is forwarded", async () => {
    seedCiGreen();
    await merge.mergeFeature({
      projectDir: tmpDir,
      method: "rebase",
      waitMigrate: false,
      now: () => new Date(),
    });
    expect(mockMergePaired.mock.calls[0][0].method).toBe("rebase");
  });

  it("--skip-local-cleanup keeps HEAD on feature branch and skips delete", async () => {
    seedCiGreen();
    const result = await merge.mergeFeature({
      projectDir: tmpDir,
      skipLocalCleanup: true,
      waitMigrate: false,
      now: () => new Date(),
    });
    expect(result.localBranchDeleted).toBe(false);
    expect(result.headAfter).toBe("feature/x");
    // No git checkout / branch -D invocation.
    const checkoutCalled = mockExec.mock.calls.some((c) =>
      String(c[0]).includes("git checkout"),
    );
    expect(checkoutCalled).toBe(false);
  });

  it("propagates warnings from paired merge", async () => {
    seedCiGreen();
    mockMergePaired.mockResolvedValue({
      message: "Merged",
      headBranch: "feature/x",
      lakebaseBranchDeleted: false,
      warnings: ["Lakebase delete failed: branch already gone"],
    });
    const result = await merge.mergeFeature({
      projectDir: tmpDir,
      waitMigrate: false,
      now: () => new Date(),
    });
    expect(result.warnings).toContain(
      "Lakebase delete failed: branch already gone",
    );
    expect(result.state.state).toBe("merged");
  });
});

describe("mergeFeature wait-migrate", () => {
  function makeRun(
    status: string,
    conclusion: string,
    createdAt: string,
    overrides: Partial<{ event: string; branch: string; id: number }> = {},
  ) {
    return {
      id: overrides.id ?? 9999,
      name: "merge",
      status,
      conclusion,
      branch: overrides.branch ?? "staging",
      event: overrides.event ?? "push",
      createdAt,
      updatedAt: createdAt,
    };
  }

  it("waits for downstream workflow, records run url + completed_at on success", async () => {
    seedCiGreen();
    // Merge timestamp = 12:00:00; subsequent now() calls advance the clock.
    let tick = Date.parse("2026-06-03T12:00:00Z");
    const clock = () => {
      const out = new Date(tick);
      tick += 100;
      return out;
    };
    const fetchRuns = vi
      .fn()
      .mockResolvedValueOnce([
        makeRun("in_progress", "", "2026-06-03T12:00:05Z"),
      ])
      .mockResolvedValueOnce([
        makeRun("completed", "success", "2026-06-03T12:00:05Z"),
      ]);
    const result = await merge.mergeFeature({
      projectDir: tmpDir,
      fetchRuns,
      sleep: () => Promise.resolve(),
      now: clock,
      migratePollMs: 1,
      migrateTimeoutMs: 60_000,
    });
    expect(result.migrate?.waited).toBe(true);
    expect(result.migrate?.conclusion).toBe("success");
    expect(result.state.migrate_run_url).toContain(
      "https://github.com/kevin-hartman/demo/actions/runs/9999",
    );
    expect(result.state.migrate_completed_at).toBeDefined();
  });

  it("throws migrate-failed when downstream conclusion is failure", async () => {
    seedCiGreen();
    let tick = Date.parse("2026-06-03T12:00:00Z");
    const clock = () => {
      const out = new Date(tick);
      tick += 100;
      return out;
    };
    const fetchRuns = vi
      .fn()
      .mockResolvedValue([
        makeRun("completed", "failure", "2026-06-03T12:00:05Z"),
      ]);
    await expect(
      merge.mergeFeature({
        projectDir: tmpDir,
        fetchRuns,
        sleep: () => Promise.resolve(),
        now: clock,
        migratePollMs: 1,
        migrateTimeoutMs: 60_000,
      }),
    ).rejects.toMatchObject({ code: "migrate-failed" });
    // State IS already merged (the GH merge succeeded before the wait).
    expect(state.readWorkflowState(tmpDir)?.state).toBe("merged");
  });

  it("throws migrate-timeout if the run never completes", async () => {
    seedCiGreen();
    // Clock advances faster than the timeout budget so the loop exits.
    let tick = Date.parse("2026-06-03T12:00:00Z");
    const clock = () => {
      const out = new Date(tick);
      tick += 30_000;
      return out;
    };
    const fetchRuns = vi
      .fn()
      .mockResolvedValue([
        makeRun("in_progress", "", "2026-06-03T12:00:05Z"),
      ]);
    await expect(
      merge.mergeFeature({
        projectDir: tmpDir,
        fetchRuns,
        sleep: () => Promise.resolve(),
        now: clock,
        migratePollMs: 1,
        migrateTimeoutMs: 60_000,
      }),
    ).rejects.toMatchObject({ code: "migrate-timeout" });
  });

  it("ignores non-push events on parent_branch (no false-positive workflow_dispatch match)", async () => {
    seedCiGreen();
    let tick = Date.parse("2026-06-03T12:00:00Z");
    const clock = () => {
      const out = new Date(tick);
      tick += 30_000;
      return out;
    };
    const fetchRuns = vi.fn().mockResolvedValue([
      makeRun("completed", "success", "2026-06-03T12:00:05Z", {
        event: "workflow_dispatch",
      }),
    ]);
    await expect(
      merge.mergeFeature({
        projectDir: tmpDir,
        fetchRuns,
        sleep: () => Promise.resolve(),
        now: clock,
        migratePollMs: 1,
        migrateTimeoutMs: 60_000,
      }),
    ).rejects.toMatchObject({ code: "migrate-timeout" });
  });
});
