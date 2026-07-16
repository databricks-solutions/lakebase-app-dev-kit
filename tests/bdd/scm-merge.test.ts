// Unit tests for scm-merge (phase B+).

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

  it("fast-forwards the local parent tier to the merged remote (post-merge checkout is not stale)", async () => {
    // Regression: the PR merges SERVER-SIDE, so after `git checkout <parent>` the
    // local <parent> is still pre-merge. Without a fetch + ff, a post-merge
    // run-tests.sh / run-dev.sh runs stale code against the already-migrated DB
    // and alembic fails "Can't locate revision". scm-merge must sync the local
    // parent to origin/<parent>.
    seedCiGreen();
    await merge.mergeFeature({ projectDir: tmpDir, waitMigrate: false, now: () => new Date() });
    const calls = mockExec.mock.calls.map((c) => String(c[0]));
    const coIdx = calls.findIndex((c) => c.includes("git checkout") && c.includes("staging"));
    const fetchIdx = calls.findIndex((c) => c.includes("git fetch origin") && c.includes("staging"));
    const ffIdx = calls.findIndex((c) => /git merge --ff-only .*origin\/staging/.test(c));
    expect(coIdx).toBeGreaterThanOrEqual(0);
    expect(fetchIdx).toBeGreaterThan(coIdx); // fetch + ff happen AFTER the checkout
    expect(ffIdx).toBeGreaterThan(fetchIdx);
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
    overrides: Partial<{ event: string; branch: string; id: number; headSha: string }> = {},
  ) {
    return {
      id: overrides.id ?? 9999,
      name: "merge",
      status,
      conclusion,
      branch: overrides.branch ?? "staging",
      event: overrides.event ?? "push",
      headSha: overrides.headSha,
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

  it("with migrateTimeoutFatal=false, a never-completing run is a warning, not a throw (state stays merged)", async () => {
    seedCiGreen();
    let tick = Date.parse("2026-06-03T12:00:00Z");
    const clock = () => {
      const out = new Date(tick);
      tick += 30_000;
      return out;
    };
    const fetchRuns = vi
      .fn()
      .mockResolvedValue([makeRun("in_progress", "", "2026-06-03T12:00:05Z")]);
    const result = await merge.mergeFeature({
      projectDir: tmpDir,
      fetchRuns,
      sleep: () => Promise.resolve(),
      now: clock,
      migratePollMs: 1,
      migrateTimeoutMs: 60_000,
      migrateTimeoutFatal: false,
    });
    expect(result.migrate?.waited).toBe(true);
    expect(result.migrate?.timedOut).toBe(true);
    expect(result.warnings.some((w) => /not confirmed within/.test(w))).toBe(true);
    // The merge already landed; the state is merged regardless of the migrate wait.
    expect(state.readWorkflowState(tmpDir)?.state).toBe("merged");
  });

  it("with migrateTimeoutFatal=false, a COMPLETED-but-FAILED run is still fatal (a real migration failure)", async () => {
    seedCiGreen();
    let tick = Date.parse("2026-06-03T12:00:00Z");
    const clock = () => {
      const out = new Date(tick);
      tick += 100;
      return out;
    };
    const fetchRuns = vi
      .fn()
      .mockResolvedValue([makeRun("completed", "failure", "2026-06-03T12:00:05Z")]);
    await expect(
      merge.mergeFeature({
        projectDir: tmpDir,
        fetchRuns,
        sleep: () => Promise.resolve(),
        now: clock,
        migratePollMs: 1,
        migrateTimeoutMs: 60_000,
        migrateTimeoutFatal: false,
      }),
    ).rejects.toMatchObject({ code: "migrate-failed" });
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

describe("mergeFeature wait-migrate SHA matching (clock-skew regression)", () => {
  const MERGE_SHA = "abc123def456abc123def456abc123def456abcd";

  function makeRun(
    status: string,
    conclusion: string,
    createdAt: string,
    overrides: Partial<{ event: string; branch: string; id: number; headSha: string }> = {},
  ) {
    return {
      id: overrides.id ?? 9999,
      name: "merge",
      status,
      conclusion,
      branch: overrides.branch ?? "staging",
      event: overrides.event ?? "push",
      headSha: overrides.headSha,
      createdAt,
      updatedAt: createdAt,
    };
  }

  // The regression: mergedAt is captured AFTER the local post-merge cleanup
  // (checkout / fetch / ff / branch delete), so it reads a clock LATER than the
  // moment GitHub created the merge commit + its push run. The timestamp window
  // (`createdAt >= mergedAt - 5s`) then drops the real run forever. SHA matching
  // is immune: it keys on the merge commit the API returned.
  it("matches the downstream run by merge-commit SHA even when its createdAt precedes mergedAt", async () => {
    seedCiGreen();
    mockMergePaired.mockResolvedValueOnce({
      message: "Merged",
      headBranch: "feature/x",
      lakebaseBranchDeleted: true,
      mergeCommitSha: MERGE_SHA,
      warnings: [],
    });
    // mergedAt reads 12:00:30 (30s of local cleanup skew); the real run was
    // created at 12:00:05, BEFORE mergedAt, so the old timestamp predicate
    // would have rejected it.
    let tick = Date.parse("2026-06-03T12:00:30Z");
    const clock = () => {
      const out = new Date(tick);
      tick += 100;
      return out;
    };
    const fetchRuns = vi.fn().mockResolvedValue([
      makeRun("completed", "success", "2026-06-03T12:00:05Z", { headSha: MERGE_SHA }),
    ]);
    const result = await merge.mergeFeature({
      projectDir: tmpDir,
      fetchRuns,
      sleep: () => Promise.resolve(),
      now: clock,
      migratePollMs: 1,
      migrateTimeoutMs: 60_000,
    });
    expect(result.migrate?.conclusion).toBe("success");
    expect(result.state.migrate_run_url).toContain("/actions/runs/9999");
    expect(result.state.migrate_completed_at).toBeDefined();
  });

  it("does NOT match a run whose headSha differs from the merge commit (even if it is newer)", async () => {
    seedCiGreen();
    mockMergePaired.mockResolvedValueOnce({
      message: "Merged",
      headBranch: "feature/x",
      lakebaseBranchDeleted: true,
      mergeCommitSha: MERGE_SHA,
      warnings: [],
    });
    let tick = Date.parse("2026-06-03T12:00:00Z");
    const clock = () => {
      const out = new Date(tick);
      tick += 30_000; // burn the budget quickly
      return out;
    };
    const fetchRuns = vi.fn().mockResolvedValue([
      makeRun("completed", "success", "2026-06-03T12:05:00Z", {
        headSha: "0000000000000000000000000000000000000000",
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

  it("falls back to the timestamp window when the merge SHA is unavailable", async () => {
    seedCiGreen();
    // Default mock returns NO mergeCommitSha, so the timestamp predicate is used.
    let tick = Date.parse("2026-06-03T12:00:00Z");
    const clock = () => {
      const out = new Date(tick);
      tick += 100;
      return out;
    };
    // No headSha on the run either; timestamp match (createdAt >= mergedAt-5s) wins.
    const fetchRuns = vi.fn().mockResolvedValue([
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
    expect(result.migrate?.conclusion).toBe("success");
  });
});

// FEIP-8020: the downstream (staging) migrate uses a short-lived CI token frozen
// at push time that can expire before the run, so git promotes without the
// schema (a partial promotion). Interim mitigation: a migrate-auth precondition
// before merging + a local-migrate fallback when the downstream migrate does not
// confirm. Both are injected here (the CLI wires them to real substrate).
describe("mergeFeature migrate-auth precondition + local-migrate fallback (FEIP-8020)", () => {
  function run(conclusion: string) {
    return {
      id: 7,
      branch: "staging",
      status: "completed",
      conclusion,
      createdAt: "2026-06-03T12:00:05Z",
      event: "push",
    } as unknown as Parameters<NonNullable<Parameters<typeof merge.mergeFeature>[0]["migrateRunPredicate"]>>[0];
  }
  const fixedNow = () => new Date("2026-06-03T12:00:00Z");

  it("refuses to merge when the migrate-auth precondition fails (no partial promotion)", async () => {
    seedCiGreen();
    await expect(
      merge.mergeFeature({
        projectDir: tmpDir,
        now: fixedNow,
        verifyMigrateAuth: async () => ({ ok: false, detail: "Invalid Token" }),
      }),
    ).rejects.toMatchObject({ code: "migrate-auth" });
    // fail-fast BEFORE the merge: nothing was merged.
    expect(mockMergePaired).not.toHaveBeenCalled();
  });

  it("proceeds + records authVerified when the precondition passes", async () => {
    seedCiGreen();
    const verify = vi.fn(async () => ({ ok: true }));
    const result = await merge.mergeFeature({
      projectDir: tmpDir,
      now: fixedNow,
      verifyMigrateAuth: verify,
      migrateRunPredicate: () => true,
      fetchRuns: async () => [run("success")],
      migratePollMs: 1,
      migrateTimeoutMs: 60_000,
    });
    expect(verify).toHaveBeenCalledOnce();
    expect(result.migrate?.conclusion).toBe("success");
    expect(result.migrate?.authVerified).toBe(true);
  });

  it("skips the precondition when not waiting on the migrate", async () => {
    seedCiGreen();
    const verify = vi.fn(async () => ({ ok: true }));
    await merge.mergeFeature({ projectDir: tmpDir, waitMigrate: false, now: fixedNow, verifyMigrateAuth: verify });
    expect(verify).not.toHaveBeenCalled();
    expect(mockMergePaired).toHaveBeenCalled();
  });

  it("applies the parent migrations LOCALLY when the downstream migrate FAILS, instead of throwing", async () => {
    seedCiGreen();
    const fallback = vi.fn(async () => ({ ok: true, detail: "applied 1 migration" }));
    const result = await merge.mergeFeature({
      projectDir: tmpDir,
      now: fixedNow,
      migrateRunPredicate: () => true,
      fetchRuns: async () => [run("failure")],
      localMigrateFallback: fallback,
      migratePollMs: 1,
      migrateTimeoutMs: 60_000,
    });
    expect(fallback).toHaveBeenCalledOnce();
    expect(result.migrate?.appliedLocally).toBe(true);
    expect(result.state.migrate_completed_at).toBeTruthy();
    expect(result.warnings.some((w) => /LOCALLY/.test(w))).toBe(true);
  });

  it("throws migrate-failed when the downstream migrate fails AND the local fallback fails", async () => {
    seedCiGreen();
    await expect(
      merge.mergeFeature({
        projectDir: tmpDir,
        now: fixedNow,
        migrateRunPredicate: () => true,
        fetchRuns: async () => [run("failure")],
        localMigrateFallback: async () => ({ ok: false, detail: "boom" }),
        migratePollMs: 1,
        migrateTimeoutMs: 60_000,
      }),
    ).rejects.toMatchObject({ code: "migrate-failed" });
  });

  it("applies locally on a fatal migrate TIMEOUT (no matching run)", async () => {
    seedCiGreen();
    const fallback = vi.fn(async () => ({ ok: true, detail: "applied" }));
    // NB: use the REAL clock here (not fixedNow) so the poll budget actually
    // elapses; with a frozen clock pollUntil never times out.
    const result = await merge.mergeFeature({
      projectDir: tmpDir,
      fetchRuns: async () => [], // never a matching run -> timeout
      sleep: () => Promise.resolve(),
      localMigrateFallback: fallback,
      migratePollMs: 1,
      migrateTimeoutMs: 1,
    });
    expect(fallback).toHaveBeenCalledOnce();
    expect(result.migrate?.appliedLocally).toBe(true);
  });
});
