// Unit tests for scm-prepare-pr (phase B+).
//
// Mocks the substrate's PR helpers + git status + remote lookups so we
// can drive the helper without touching GitHub. Pins precondition
// gates + happy-path state transition.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const mockGetCurrentBranch = vi.fn();
const mockIsDirty = vi.fn();
const mockGetOwnerRepo = vi.fn();
const mockCreatePr = vi.fn();
const mockGetPr = vi.fn();
const mockExec = vi.fn();

vi.mock("../../scripts/git/inspect.js", () => ({
  getCurrentBranch: (...args: unknown[]) => mockGetCurrentBranch(...args),
  getRepoRoot: vi.fn(),
}));
vi.mock("../../scripts/git/status.js", () => ({
  isDirty: (...args: unknown[]) => mockIsDirty(...args),
  hasUpstream: vi.fn(),
  getAheadBehind: vi.fn(),
}));
vi.mock("../../scripts/git/remote.js", () => ({
  getOwnerRepo: (...args: unknown[]) => mockGetOwnerRepo(...args),
  getGitHubUrl: vi.fn(),
  addRemote: vi.fn(),
  removeRemote: vi.fn(),
  listRemotes: vi.fn(),
  deleteRemoteBranch: vi.fn(),
}));
vi.mock("../../scripts/github/pr.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../scripts/github/pr.js")
  >("../../scripts/github/pr.js");
  return {
    ...actual,
    createPullRequest: (...args: unknown[]) => mockCreatePr(...args),
    getPullRequest: (...args: unknown[]) => mockGetPr(...args),
  };
});
vi.mock("../../scripts/util/exec.js", () => ({
  exec: (...args: unknown[]) => mockExec(...args),
  shq: (s: string) => `'${s}'`,
}));

const prep = await import("../../scripts/lakebase/scm-prepare-pr.js");
const state = await import("../../scripts/lakebase/scm-workflow-state.js");

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scm-prep-"));
  mockGetCurrentBranch.mockReset();
  mockIsDirty.mockReset();
  mockGetOwnerRepo.mockReset();
  mockCreatePr.mockReset();
  mockGetPr.mockReset();
  mockExec.mockReset();
  mockGetCurrentBranch.mockResolvedValue("feature/x");
  mockIsDirty.mockResolvedValue(false);
  mockGetOwnerRepo.mockResolvedValue("kevin-hartman/demo");
  mockCreatePr.mockResolvedValue("https://github.com/kevin-hartman/demo/pull/42");
  mockGetPr.mockResolvedValue(undefined);
  // Default: 3 commits ahead of parent.
  mockExec.mockImplementation((cmd: string) => {
    if (cmd.includes("rev-list --count")) return Promise.resolve("3\n");
    return Promise.resolve("");
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seedClaim(): void {
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
}

const fixedNow = () => new Date("2026-06-03T12:00:00Z");

describe("preparePr precondition", () => {
  it("refuses when no state file", async () => {
    await expect(
      prep.preparePr({ projectDir: tmpDir }),
    ).rejects.toMatchObject({ code: "no-state-file" });
  });

  it("refuses when not at feature-claimed", async () => {
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "p",
    });
    await expect(
      prep.preparePr({ projectDir: tmpDir }),
    ).rejects.toMatchObject({ code: "bad-precondition" });
  });

  it("refuses if HEAD is on a different branch", async () => {
    seedClaim();
    mockGetCurrentBranch.mockResolvedValue("main");
    await expect(
      prep.preparePr({ projectDir: tmpDir }),
    ).rejects.toMatchObject({ code: "wrong-branch" });
  });

  it("refuses on dirty working tree without --force", async () => {
    seedClaim();
    mockIsDirty.mockResolvedValue(true);
    await expect(
      prep.preparePr({ projectDir: tmpDir }),
    ).rejects.toMatchObject({ code: "dirty-working-tree" });
  });

  it("scopes the dirty-tree check to CODE: asks isDirty to ignore .sftdd/ + .tdd/ + .lakebase/", async () => {
    // The driver writes .sftdd log + phase pointer and .lakebase state mid-run, on
    // the very step that opens the PR; the guard must tolerate that, refusing only
    // on uncommitted code. Assert prepare-pr passes the ignore prefixes.
    seedClaim();
    mockIsDirty.mockResolvedValue(false); // no CODE changes once metadata is ignored
    await prep.preparePr({ projectDir: tmpDir });
    expect(mockIsDirty).toHaveBeenCalledWith(
      expect.objectContaining({ ignore: [".sftdd/", ".tdd/", ".lakebase/", ".claude/agent-memory/"] }),
    );
  });

  it("refuses when 0 commits ahead of parent without --allow-no-commits", async () => {
    seedClaim();
    mockExec.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-list --count")) return Promise.resolve("0\n");
      return Promise.resolve("");
    });
    await expect(
      prep.preparePr({ projectDir: tmpDir }),
    ).rejects.toMatchObject({ code: "no-commits-ahead" });
  });

  it("fails push-failed AND carries an account-mismatch hint when the remote rejects the push", async () => {
    seedClaim();
    mockExec.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-list --count")) return Promise.resolve("3\n");
      if (cmd.includes("git push")) {
        return Promise.reject(
          new Error(
            "remote: Repository not found.\nfatal: repository 'https://github.com/org/repo.git/' not found",
          ),
        );
      }
      return Promise.resolve("");
    });
    const err = (await prep
      .preparePr({ projectDir: tmpDir })
      .catch((e: unknown) => e)) as { code?: string; message?: string };
    expect(err.code).toBe("push-failed");
    // the opaque "Repository not found" gets the wrong-account remediation appended
    expect(err.message).toMatch(/gh auth switch/);
    // and the state is NOT advanced to pr-ready on a failed push
    expect(state.readWorkflowState(tmpDir)?.state).toBe("feature-claimed");
  });

  it("refuses when origin is not a github.com remote", async () => {
    seedClaim();
    mockGetOwnerRepo.mockResolvedValue("");
    await expect(
      prep.preparePr({ projectDir: tmpDir }),
    ).rejects.toMatchObject({ code: "no-github-remote" });
  });
});

describe("preparePr happy path", () => {
  it("pushes the branch, opens a PR, writes pr-ready state", async () => {
    seedClaim();
    const result = await prep.preparePr({ projectDir: tmpDir, now: fixedNow });
    expect(result.state.state).toBe("pr-ready");
    expect(result.state.pr_url).toBe(
      "https://github.com/kevin-hartman/demo/pull/42",
    );
    expect(result.state.pushed_at).toBe("2026-06-03T12:00:00.000Z");
    expect(result.prCreated).toBe(true);
    // git push was invoked.
    const pushCall = mockExec.mock.calls.find((c) =>
      String(c[0]).includes("git push -u"),
    );
    expect(pushCall).toBeDefined();
    expect(String(pushCall![0])).toContain("'feature/x'");
    // createPullRequest was invoked with the right base.
    expect(mockCreatePr.mock.calls[0][0]).toMatchObject({
      ownerRepo: "kevin-hartman/demo",
      headBranch: "feature/x",
      baseBranch: "staging",
    });
  });

  it("reuses an existing open PR instead of creating a new one", async () => {
    seedClaim();
    mockGetPr.mockResolvedValue({
      number: 5,
      title: "feat: x",
      url: "https://github.com/kevin-hartman/demo/pull/5",
      state: "OPEN",
      isDraft: false,
      ciStatus: "pending",
      checks: [],
      headBranch: "feature/x",
      baseBranch: "staging",
    });
    const result = await prep.preparePr({ projectDir: tmpDir, now: fixedNow });
    expect(result.prCreated).toBe(false);
    expect(result.prUrl).toBe("https://github.com/kevin-hartman/demo/pull/5");
    expect(mockCreatePr).not.toHaveBeenCalled();
  });
});

describe("pushFailureHint", () => {
  it("adds wrong-account guidance for an access-shaped rejection", () => {
    expect(prep.pushFailureHint("remote: Repository not found.")).toMatch(/gh auth switch/);
    expect(prep.pushFailureHint("fatal: Authentication failed for 'https://...'")).toMatch(/gh auth switch/);
    expect(prep.pushFailureHint("could not read Password for 'https://...'")).toMatch(/gh auth switch/);
  });

  it("stays silent on unrelated push failures (no misleading guidance)", () => {
    expect(prep.pushFailureHint("error: failed to push some refs (non-fast-forward)")).toBe("");
    expect(prep.pushFailureHint("fatal: unable to access: Could not resolve host: github.com")).toBe("");
  });
});
