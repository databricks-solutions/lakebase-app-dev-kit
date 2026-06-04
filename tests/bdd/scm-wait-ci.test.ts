// Unit tests for scm-wait-ci (FEIP-7458 phase B+).
//
// Drives the poll loop in-process by injecting a fetchPr stub + a
// sleep stub. The clock advances via a controllable now() so timeout
// behavior is deterministic.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const mockGetOwnerRepo = vi.fn();
vi.mock("../../scripts/git/remote.js", () => ({
  getOwnerRepo: (...args: unknown[]) => mockGetOwnerRepo(...args),
  getGitHubUrl: vi.fn(),
  addRemote: vi.fn(),
  removeRemote: vi.fn(),
  listRemotes: vi.fn(),
  deleteRemoteBranch: vi.fn(),
}));

const wait = await import("../../scripts/lakebase/scm-wait-ci.js");
const state = await import("../../scripts/lakebase/scm-workflow-state.js");

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scm-wait-"));
  mockGetOwnerRepo.mockReset();
  mockGetOwnerRepo.mockResolvedValue("kevin-hartman/demo");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seedPrReady(): void {
  state.writeWorkflowState(tmpDir, {
    version: 1,
    state: "pr-ready",
    tier_topology: 2,
    project_id: "p",
    feature_id: "x",
    branch: "feature/x",
    parent_branch: "staging",
    lakebase_branch_uid: "br-x",
    claimed_at: "2026-05-01T00:00:00Z",
    pr_url: "https://github.com/kevin-hartman/demo/pull/42",
    pushed_at: "2026-05-01T01:00:00Z",
  });
}

describe("waitForCi precondition", () => {
  it("refuses when no state file", async () => {
    await expect(wait.waitForCi({ projectDir: tmpDir })).rejects.toMatchObject(
      { code: "no-state-file" },
    );
  });
  it("refuses when not at pr-ready", async () => {
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "p",
    });
    await expect(wait.waitForCi({ projectDir: tmpDir })).rejects.toMatchObject(
      { code: "bad-precondition" },
    );
  });
  it("refuses when no github remote", async () => {
    seedPrReady();
    mockGetOwnerRepo.mockResolvedValue("");
    await expect(wait.waitForCi({ projectDir: tmpDir })).rejects.toMatchObject(
      { code: "no-github-remote" },
    );
  });
});

describe("waitForCi poll loop", () => {
  function makePr(status: "pending" | "success" | "failure") {
    return {
      number: 42,
      title: "feat: x",
      url: "https://github.com/kevin-hartman/demo/pull/42",
      state: "OPEN",
      isDraft: false,
      ciStatus: status,
      checks: [
        {
          name: "build",
          status: "COMPLETED",
          conclusion: status === "failure" ? "FAILURE" : "SUCCESS",
          detailsUrl:
            "https://github.com/kevin-hartman/demo/actions/runs/9999",
        },
      ],
      headBranch: "feature/x",
      baseBranch: "staging",
    };
  }

  it("advances to ci-green on first successful poll", async () => {
    seedPrReady();
    const fetchPr = vi.fn().mockResolvedValue(makePr("success"));
    const result = await wait.waitForCi({
      projectDir: tmpDir,
      fetchPr,
      sleep: () => Promise.resolve(),
      now: () => new Date("2026-06-03T12:00:00Z"),
    });
    expect(result.state.state).toBe("ci-green");
    expect(result.state.ci_run_url).toBe(
      "https://github.com/kevin-hartman/demo/actions/runs/9999",
    );
    expect(result.state.ci_green_at).toBe("2026-06-03T12:00:00.000Z");
    expect(result.polls).toBe(1);
  });

  it("polls multiple times then succeeds", async () => {
    seedPrReady();
    const seq = [makePr("pending"), makePr("pending"), makePr("success")];
    const fetchPr = vi.fn().mockImplementation(() => Promise.resolve(seq.shift()));
    const result = await wait.waitForCi({
      projectDir: tmpDir,
      fetchPr,
      sleep: () => Promise.resolve(),
      pollMs: 1,
      timeoutMs: 1_000_000,
      now: () => new Date("2026-06-03T12:00:00Z"),
    });
    expect(result.polls).toBe(3);
    expect(result.state.state).toBe("ci-green");
  });

  it("throws ci-failed without advancing state on CI failure", async () => {
    seedPrReady();
    const fetchPr = vi.fn().mockResolvedValue(makePr("failure"));
    await expect(
      wait.waitForCi({
        projectDir: tmpDir,
        fetchPr,
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toMatchObject({ code: "ci-failed" });
    // State unchanged.
    expect(state.readWorkflowState(tmpDir)?.state).toBe("pr-ready");
  });

  it("throws pr-not-found when fetchPr returns undefined", async () => {
    seedPrReady();
    await expect(
      wait.waitForCi({
        projectDir: tmpDir,
        fetchPr: () => Promise.resolve(undefined),
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toMatchObject({ code: "pr-not-found" });
  });

  it("throws timeout when budget elapses without success", async () => {
    seedPrReady();
    let calls = 0;
    const fetchPr = vi.fn().mockResolvedValue(makePr("pending"));
    // Clock advances by 500ms per call so a 1000ms budget covers ~2 polls.
    const clock = (() => {
      let t = Date.parse("2026-06-03T12:00:00Z");
      return () => {
        calls += 1;
        const out = new Date(t);
        t += 500;
        return out;
      };
    })();
    await expect(
      wait.waitForCi({
        projectDir: tmpDir,
        fetchPr,
        sleep: () => Promise.resolve(),
        timeoutMs: 1000,
        pollMs: 1,
        now: clock,
      }),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(calls).toBeGreaterThan(1);
  });
});
