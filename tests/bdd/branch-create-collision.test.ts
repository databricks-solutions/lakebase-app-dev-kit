// Hermetic coverage for createBranch's collision-vs-idempotency contract.
//
// Live behavior is exercised by branch-create-delete.test.ts (which needs
// LAKEBASE_TEST_INSTANCE/PARENT and a real workspace). These cases run on
// every commit because they mock the substrate's CLI/lookup helpers – no
// Lakebase or git account needed.
//
// What we're guarding:
//   1. If the target name exists AND its source matches the requested
//      parent → return the existing branch (true idempotency on retry).
//   2. If the target name exists AND its source does NOT match → throw
//      LakebaseBranchError with a message naming both branches. Silently
//      handing back a branch with the wrong lineage is the failure mode
//      this test exists to prevent.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LakebaseBranchError, type LakebaseBranchInfo } from "../../scripts/lakebase/branch-utils.js";
import { DatabricksCliError } from "../../scripts/lakebase/databricks-cli.js";

const mockGetBranchByName = vi.fn();
const mockGetDefaultBranch = vi.fn();
const mockRunDatabricks = vi.fn();

vi.mock("../../scripts/lakebase/branch-utils.js", async () => {
  const actual = await vi.importActual<typeof import("../../scripts/lakebase/branch-utils.js")>(
    "../../scripts/lakebase/branch-utils.js",
  );
  return {
    ...actual,
    getBranchByName: (...args: any[]) => mockGetBranchByName(...args),
    getDefaultBranch: (...args: any[]) => mockGetDefaultBranch(...args),
    projectPath: () => "projects/test-project",
  };
});

// The create call itself goes through the one databricks-CLI wrapper. Mock only
// runDatabricks so the recheck-after-error path can simulate "the client errored
// but the branch landed server-side".
vi.mock("../../scripts/lakebase/databricks-cli.js", async () => {
  const actual = await vi.importActual<typeof import("../../scripts/lakebase/databricks-cli.js")>(
    "../../scripts/lakebase/databricks-cli.js",
  );
  return { ...actual, runDatabricks: (...args: any[]) => mockRunDatabricks(...args) };
});

// Import after the mocks are registered.
const { createBranch } = await import("../../scripts/lakebase/branch-create.js");

function fakeBranch(leaf: string, sourceLeaf: string | undefined): LakebaseBranchInfo {
  return {
    name: `projects/test-project/branches/${leaf}`,
    uid: `br-${leaf}`,
    state: "READY",
    isDefault: false,
    sourceBranchName: sourceLeaf
      ? `projects/test-project/branches/${sourceLeaf}`
      : undefined,
  } as LakebaseBranchInfo;
}

// Per-name lookup table. createBranch now calls getBranchByName twice
// per invocation: once for the parentBranch existence check (added with
// the parentBranch fallback, see branch-create-fallback.test.ts) and
// once for the target name idempotency check. Tests below register
// expected return values for each name explicitly so the two calls
// don't collide on a single mockResolvedValue.
function setupBranchMock(branches: Record<string, LakebaseBranchInfo | undefined>) {
  mockGetBranchByName.mockImplementation((name: string) =>
    Promise.resolve(branches[name])
  );
}

describe("createBranch – collision-vs-idempotency contract", () => {
  beforeEach(() => {
    mockGetBranchByName.mockReset();
    mockGetDefaultBranch.mockReset();
    mockRunDatabricks.mockReset();
  });

  it("returns the existing branch when its source matches the requested parent (idempotent retry)", async () => {
    const existing = fakeBranch("feature-foo", "production");
    setupBranchMock({
      production: fakeBranch("production", undefined), // parent exists
      "feature-foo": existing,                          // target also exists
    });

    const result = await createBranch({
      instance: "ignored",
      branch: "feature-foo",
      parentBranch: "production",
    });

    expect(result).toBe(existing);
    // Lookup runs twice: once to resolve/validate the parent, once to check
    // for an existing target. Both are mocked; the real CLI is never
    // invoked, which is the whole point of the hermetic test.
  });

  it("throws when the existing branch was forked from a different source", async () => {
    // Existing branch was forked from staging…
    const existing = fakeBranch("feature-foo", "staging");
    setupBranchMock({
      production: fakeBranch("production", undefined), // requested parent exists
      "feature-foo": existing,                          // target exists with mismatched lineage
    });

    // …but the caller is now asking to fork from production.
    await expect(
      createBranch({
        instance: "ignored",
        branch: "feature-foo",
        parentBranch: "production",
      }),
    ).rejects.toThrow(LakebaseBranchError);

    // Message names both the actual and requested sources so the operator
    // can see which choice the existing branch belongs to.
    await expect(
      createBranch({
        instance: "ignored",
        branch: "feature-foo",
        parentBranch: "production",
      }),
    ).rejects.toThrow(/forked from "staging".*requested "production"/);
  });

  it("returns existing when only the existing's sourceBranchName is unknown (can't compare ⇒ accept)", async () => {
    // Older branches created before the substrate started recording
    // spec.source_branch may report sourceBranchName as undefined.
    // Treat as "indeterminate, fall through to idempotent return"
    // rather than throwing – refusing the retry would surprise users
    // upgrading from older substrate revs.
    const existing = fakeBranch("feature-foo", undefined);
    setupBranchMock({
      production: fakeBranch("production", undefined),
      "feature-foo": existing,
    });

    const result = await createBranch({
      instance: "ignored",
      branch: "feature-foo",
      parentBranch: "production",
    });

    expect(result).toBe(existing);
  });

  it("adopts the branch when create errors on the client but landed server-side (silent-flake resilience)", async () => {
    // The target does not exist at the pre-check, so create proceeds. The
    // create call errors (empty output, as the live silent exit-1 did) but the
    // branch actually landed, so the post-error recheck must find it and the
    // call must succeed rather than surfacing the raw CLI error.
    const landed = fakeBranch("feature-foo", "production");
    let created = false;
    mockGetBranchByName.mockImplementation((name: string) => {
      if (name === "production") return Promise.resolve(fakeBranch("production", undefined));
      if (name === "feature-foo") return Promise.resolve(created ? landed : undefined);
      return Promise.resolve(undefined);
    });
    mockRunDatabricks.mockImplementation(() => {
      created = true; // the server created the branch despite the client-side failure
      return Promise.reject(new DatabricksCliError("databricks postgres create-branch failed: exit 1", "prof", ""));
    });

    const result = await createBranch({ instance: "ignored", branch: "feature-foo", parentBranch: "production" });
    expect(result).toBe(landed);
  });

  it("rethrows the create error when nothing landed (a genuine failure, not a flake)", async () => {
    // Same silent error, but the branch never got created: the recheck finds
    // nothing, so the original error propagates instead of being swallowed.
    mockGetBranchByName.mockImplementation((name: string) =>
      Promise.resolve(name === "production" ? fakeBranch("production", undefined) : undefined),
    );
    mockRunDatabricks.mockRejectedValue(
      new DatabricksCliError("databricks postgres create-branch failed: exit 1", "prof", ""),
    );

    await expect(
      createBranch({ instance: "ignored", branch: "feature-foo", parentBranch: "production" }),
    ).rejects.toThrow(DatabricksCliError);
  });
});
