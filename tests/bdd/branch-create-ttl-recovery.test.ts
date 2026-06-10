// TTL auto-recovery for createBranch. Workspaces cap branch
// expiration policy below the kit's 30-day default; the kit now catches
// the cap rejection, probes the project's history_retention_duration,
// and retries with a clamped TTL.
//
// This test covers:
//   1. Pure parse/min helpers (parseLakebaseTtl, minLakebaseTtl,
//      findHistoryRetentionDuration) - fully hermetic, no mocks.
//   2. createBranch retry contract end-to-end via mocks:
//      - first create-branch call rejects with the workspace-cap pattern
//      - get-project probe returns a retention duration
//      - retry create-branch with min(originalTtl, retention) succeeds
//      - per-instance retention cache means subsequent creates skip the probe

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseLakebaseTtl,
  minLakebaseTtl,
  clearRetentionCache,
  getCachedProjectRetention,
  LakebaseBranchTtlTooLongError,
  type LakebaseBranchInfo,
} from "../../scripts/lakebase/branch-utils.js";
import { findHistoryRetentionDuration } from "../../scripts/lakebase/lakebase-project.js";

describe("parseLakebaseTtl", () => {
  it("parses '<seconds>s' to integer seconds", () => {
    expect(parseLakebaseTtl("604800s")).toBe(604800);
    expect(parseLakebaseTtl("2592000s")).toBe(2592000);
  });

  it("tolerates bare integer (no trailing s)", () => {
    expect(parseLakebaseTtl("3600")).toBe(3600);
  });

  it("returns undefined for malformed input", () => {
    expect(parseLakebaseTtl("")).toBeUndefined();
    expect(parseLakebaseTtl(undefined)).toBeUndefined();
    expect(parseLakebaseTtl("7d")).toBeUndefined();
    expect(parseLakebaseTtl("abc")).toBeUndefined();
    expect(parseLakebaseTtl("0s")).toBeUndefined();
    expect(parseLakebaseTtl("-100s")).toBeUndefined();
  });
});

describe("minLakebaseTtl", () => {
  it("returns the smaller of two parseable TTLs", () => {
    expect(minLakebaseTtl("2592000s", "604800s")).toBe("604800s");
    expect(minLakebaseTtl("604800s", "2592000s")).toBe("604800s");
  });

  it("returns the parseable one when the other is malformed", () => {
    expect(minLakebaseTtl("604800s", "garbage")).toBe("604800s");
    expect(minLakebaseTtl(undefined, "604800s")).toBe("604800s");
  });

  it("returns undefined when neither parses", () => {
    expect(minLakebaseTtl(undefined, undefined)).toBeUndefined();
    expect(minLakebaseTtl("nope", "")).toBeUndefined();
  });
});

describe("findHistoryRetentionDuration", () => {
  it("reads protobuf-style snake_case history_retention_duration", () => {
    expect(findHistoryRetentionDuration({ history_retention_duration: "604800s" })).toBe(
      "604800s",
    );
  });

  it("reads lower-camelCase historyRetentionDuration", () => {
    expect(findHistoryRetentionDuration({ historyRetentionDuration: "1209600s" })).toBe(
      "1209600s",
    );
  });

  it("tolerates bare-integer encoding from the API", () => {
    expect(findHistoryRetentionDuration({ history_retention_duration: "604800" })).toBe(
      "604800s",
    );
  });

  it("returns undefined when the field is missing or unparseable", () => {
    expect(findHistoryRetentionDuration({})).toBeUndefined();
    expect(findHistoryRetentionDuration({ history_retention_duration: "" })).toBeUndefined();
    expect(findHistoryRetentionDuration({ history_retention_duration: "7d" })).toBeUndefined();
    expect(
      findHistoryRetentionDuration({ history_retention_duration: 12345 as unknown as string }),
    ).toBeUndefined();
  });
});

// ─── end-to-end retry contract ───────────────────────────────────

const mockGetBranchByName = vi.fn();
const mockGetDefaultBranch = vi.fn();
const mockGetProjectRetentionDuration = vi.fn();
const mockExecFile = vi.fn();

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>(
    "node:child_process",
  );
  return {
    ...actual,
    execFile: (...args: unknown[]) => mockExecFile(...args),
  };
});

vi.mock("../../scripts/lakebase/branch-utils.js", async () => {
  const actual = await vi.importActual<typeof import("../../scripts/lakebase/branch-utils.js")>(
    "../../scripts/lakebase/branch-utils.js",
  );
  return {
    ...actual,
    getBranchByName: (...args: unknown[]) => mockGetBranchByName(...args),
    getDefaultBranch: (...args: unknown[]) => mockGetDefaultBranch(...args),
    projectPath: () => "projects/test-project",
  };
});

vi.mock("../../scripts/lakebase/lakebase-project.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../scripts/lakebase/lakebase-project.js")
  >("../../scripts/lakebase/lakebase-project.js");
  return {
    ...actual,
    getProjectRetentionDuration: (...args: unknown[]) =>
      mockGetProjectRetentionDuration(...args),
  };
});

const { createBranch } = await import("../../scripts/lakebase/branch-create.js");

function fakeBranch(leaf: string, sourceLeaf: string | undefined): LakebaseBranchInfo {
  return {
    name: `projects/test-project/branches/${leaf}`,
    nameLeaf: leaf as LakebaseBranchInfo["nameLeaf"],
    uid: `br-${leaf}` as LakebaseBranchInfo["uid"],
    state: "READY",
    isDefault: false,
    sourceBranchName: sourceLeaf
      ? `projects/test-project/branches/${sourceLeaf}`
      : undefined,
  } as LakebaseBranchInfo;
}

/**
 * Build a fake execFile shape compatible with util.promisify(execFile).
 *
 * Node attaches a custom promisify resolver to the real `execFile` that
 * makes `await promisify(execFile)(...)` resolve to `{ stdout, stderr }`.
 * When we `vi.mock("node:child_process")` and swap in our own function,
 * that custom symbol is lost; promisify falls back to the default
 * `cb(err, value)` wrap that resolves to the second positional arg. So
 * we feed it the object directly via `cb(null, { stdout, stderr })`.
 */
function execFileCallbackShape(
  result: { stdout?: string; stderr?: string; error?: Error & { stderr?: string } },
) {
  return (...args: unknown[]) => {
    const cb = args[args.length - 1] as (
      err: (Error & { stderr?: string }) | null,
      value?: { stdout: string; stderr: string },
    ) => void;
    if (result.error) {
      cb(result.error);
    } else {
      cb(null, { stdout: result.stdout ?? "", stderr: result.stderr ?? "" });
    }
  };
}

let stderrChunks: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stderrSpy: any;

beforeEach(() => {
  mockGetBranchByName.mockReset();
  mockGetDefaultBranch.mockReset();
  mockGetProjectRetentionDuration.mockReset();
  mockExecFile.mockReset();
  clearRetentionCache();
  stderrChunks = [];
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderrChunks.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  stderrSpy.mockRestore();
});

describe("createBranch – TTL auto-recovery", () => {
  it("retries with a retention-clamped TTL when workspace rejects the original", async () => {
    // Parent lookup: 'staging' exists. Target lookup: returns undefined
    // on the idempotency check (pre-create), then a READY branch on the
    // wait-for-ready poll (post-create). State tracked via the execFile
    // call counter: target lookups before any successful create-branch
    // return undefined; after, return the READY branch.
    let targetCreated = false;
    mockGetBranchByName.mockImplementation((branchName: string) => {
      if (branchName === "staging") return Promise.resolve(fakeBranch("staging", "production"));
      if (branchName === "feature-x") {
        return Promise.resolve(targetCreated ? fakeBranch("feature-x", "staging") : undefined);
      }
      return Promise.resolve(undefined);
    });
    mockGetProjectRetentionDuration.mockResolvedValue("604800s");

    // First create-branch call: rejects with the workspace-cap error.
    // Second create-branch call (the retry with clamped TTL): succeeds.
    const capError = Object.assign(new Error("Command failed"), {
      stderr:
        "Error: expiration time exceeds the maximum expiration time [TraceId: abc]",
    });
    mockExecFile
      .mockImplementationOnce(execFileCallbackShape({ error: capError }))
      .mockImplementationOnce((...args: unknown[]) => {
        targetCreated = true;
        const cb = args[args.length - 1] as (
          err: Error | null,
          value?: { stdout: string; stderr: string },
        ) => void;
        cb(null, { stdout: '{"name":"projects/test-project/branches/feature-x"}', stderr: "" });
      });

    const result = await createBranch({
      instance: "test-project",
      branch: "feature-x",
      parentBranch: "staging",
      ttl: "2592000s", // 30d, will be clamped to 604800s (7d)
    });

    // Two create-branch attempts; second one used the clamped TTL.
    expect(mockExecFile).toHaveBeenCalledTimes(2);
    const secondCallArgs = mockExecFile.mock.calls[1][1] as string[];
    const specIdx = secondCallArgs.indexOf("--json");
    expect(specIdx).toBeGreaterThan(-1);
    const retrySpec = JSON.parse(secondCallArgs[specIdx + 1]) as { spec: { ttl?: string } };
    expect(retrySpec.spec.ttl).toBe("604800s");

    // Stderr documents the recovery to the user.
    expect(stderrChunks.join("")).toMatch(
      /workspace TTL cap rejected '2592000s'.*retrying with retention-clamped '604800s'/,
    );

    // The retry succeeded; result is the wait-for-ready output.
    expect(result.nameLeaf).toBe("feature-x");
    // Retention is cached for the rest of the session.
    expect(getCachedProjectRetention("test-project")).toBe("604800s");
  });

  it("retries with hardcoded 7d fallback when get-project returns no retention duration", async () => {
    // Previously this threw without retrying. Now: when retention is
    // undiscoverable, fall back to 604800s (the value the typed error
    // message recommends) so creates against workspaces with restrictive
    // caps + bare project metadata still succeed.
    let targetCreated = false;
    mockGetBranchByName.mockImplementation((branchName: string) => {
      if (branchName === "staging") return Promise.resolve(fakeBranch("staging", "production"));
      if (branchName === "feature-x") {
        return Promise.resolve(targetCreated ? fakeBranch("feature-x", "staging") : undefined);
      }
      return Promise.resolve(undefined);
    });
    mockGetProjectRetentionDuration.mockResolvedValue(undefined);

    const capError = Object.assign(new Error("Command failed"), {
      stderr: "Error: expiration time exceeds the maximum expiration time",
    });
    mockExecFile
      .mockImplementationOnce(execFileCallbackShape({ error: capError }))
      .mockImplementationOnce((...args: unknown[]) => {
        targetCreated = true;
        const cb = args[args.length - 1] as (
          err: Error | null,
          value?: { stdout: string; stderr: string },
        ) => void;
        cb(null, {
          stdout: '{"name":"projects/test-project/branches/feature-x"}',
          stderr: "",
        });
      });

    const result = await createBranch({
      instance: "test-project",
      branch: "feature-x",
      parentBranch: "staging",
      ttl: "2592000s",
    });

    // Retry happened with the hardcoded 604800s fallback.
    expect(mockExecFile).toHaveBeenCalledTimes(2);
    const secondCallArgs = mockExecFile.mock.calls[1][1] as string[];
    const specIdx = secondCallArgs.indexOf("--json");
    const retrySpec = JSON.parse(secondCallArgs[specIdx + 1]) as { spec: { ttl?: string } };
    expect(retrySpec.spec.ttl).toBe("604800s");

    // Stderr documents that we used the hardcoded fallback (not retention).
    expect(stderrChunks.join("")).toMatch(
      /workspace TTL cap rejected '2592000s'.*hardcoded fallback '604800s'.*history_retention_duration not discoverable/,
    );

    expect(result.nameLeaf).toBe("feature-x");
  });

  it("throws LakebaseBranchTtlTooLongError when the fallback retry also hits the cap", async () => {
    mockGetBranchByName.mockImplementation((branchName: string) => {
      if (branchName === "staging") return Promise.resolve(fakeBranch("staging", "production"));
      return Promise.resolve(undefined);
    });
    mockGetProjectRetentionDuration.mockResolvedValue(undefined);

    const capError = Object.assign(new Error("Command failed"), {
      stderr: "Error: expiration time exceeds the maximum expiration time",
    });
    // Both create attempts fail with the cap (workspace caps below 7d).
    mockExecFile
      .mockImplementationOnce(execFileCallbackShape({ error: capError }))
      .mockImplementationOnce(execFileCallbackShape({ error: capError }));

    await expect(
      createBranch({
        instance: "test-project",
        branch: "feature-x",
        parentBranch: "staging",
        ttl: "2592000s",
      }),
    ).rejects.toThrow(LakebaseBranchTtlTooLongError);

    // Both the original and fallback attempts ran.
    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });

  it("does not probe get-project when no TTL was set (noExpiry path)", async () => {
    mockGetBranchByName.mockImplementation((branchName: string) => {
      if (branchName === "staging") return Promise.resolve(fakeBranch("staging", "production"));
      if (branchName === "tier-x") return Promise.resolve(fakeBranch("tier-x", "staging"));
      return Promise.resolve(undefined);
    });
    mockExecFile.mockImplementationOnce(
      execFileCallbackShape({ stdout: '{"name":"projects/test-project/branches/tier-x"}' }),
    );

    await createBranch({
      instance: "test-project",
      branch: "tier-x",
      parentBranch: "staging",
      // No ttl, no noExpiry override → default no_expiry: true path.
    });

    expect(mockGetProjectRetentionDuration).not.toHaveBeenCalled();
  });

  it("reuses cached retention duration across creates against the same instance", async () => {
    const created = { "feature-a": false, "feature-b": false };
    mockGetBranchByName.mockImplementation((branchName: string) => {
      if (branchName === "staging") return Promise.resolve(fakeBranch("staging", "production"));
      if (branchName === "feature-a") {
        return Promise.resolve(created["feature-a"] ? fakeBranch("feature-a", "staging") : undefined);
      }
      if (branchName === "feature-b") {
        return Promise.resolve(created["feature-b"] ? fakeBranch("feature-b", "staging") : undefined);
      }
      return Promise.resolve(undefined);
    });
    mockGetProjectRetentionDuration.mockResolvedValue("604800s");

    const capError = Object.assign(new Error("Command failed"), {
      stderr: "Error: expiration time exceeds the maximum expiration time",
    });

    const successOf = (branch: keyof typeof created) =>
      (...args: unknown[]) => {
        created[branch] = true;
        const cb = args[args.length - 1] as (
          err: Error | null,
          value?: { stdout: string; stderr: string },
        ) => void;
        cb(null, {
          stdout: `{"name":"projects/test-project/branches/${branch}"}`,
          stderr: "",
        });
      };

    // First create: hits cap, probes get-project, caches retention, retries.
    mockExecFile
      .mockImplementationOnce(execFileCallbackShape({ error: capError }))
      .mockImplementationOnce(successOf("feature-a"));
    await createBranch({
      instance: "test-project",
      branch: "feature-a",
      parentBranch: "staging",
      ttl: "2592000s",
    });

    // Second create against the same instance: hits cap, should reuse the
    // cached retention (NOT call get-project again), and retry once.
    mockExecFile
      .mockImplementationOnce(execFileCallbackShape({ error: capError }))
      .mockImplementationOnce(successOf("feature-b"));
    await createBranch({
      instance: "test-project",
      branch: "feature-b",
      parentBranch: "staging",
      ttl: "2592000s",
    });

    // get-project was called exactly ONCE across both creates.
    expect(mockGetProjectRetentionDuration).toHaveBeenCalledTimes(1);
  });
});
