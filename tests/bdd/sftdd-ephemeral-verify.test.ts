// Ephemeral verify DB: the build's verify forks a disposable child branch off
// the experiment branch, runs migrate + test against IT, and deletes it after,
// so the suite's migration up/down fixtures never corrupt the shared branch
// across runs (the F6/S3 contract-phase thrash). Hermetic: all Lakebase ops are
// injected.

import { describe, it, expect } from "vitest";
import {
  withEphemeralVerifyBranch,
  ephemeralVerifyBranchName,
} from "../../scripts/sftdd/ephemeral-verify";

describe("ephemeralVerifyBranchName", () => {
  it("produces a unique, sanitized child name under the experiment branch", () => {
    expect(ephemeralVerifyBranchName("experiment-s3-split-drop-old-exp1", "1234567")).toBe(
      "experiment-s3-split-drop-old-exp1-vrfy-1234567",
    );
  });
  it("sanitizes illegal characters", () => {
    expect(ephemeralVerifyBranchName("exp/weird name", "a.b")).toBe("exp-weird-name-vrfy-a-b");
  });
});

describe("withEphemeralVerifyBranch", () => {
  it("forks a child, hands its DSN to run, and deletes it , in order", async () => {
    const calls: string[] = [];
    const result = await withEphemeralVerifyBranch(
      {
        instance: "proj-1",
        parentBranch: "experiment-s3-exp1",
        childName: "experiment-s3-exp1-vrfy-9",
        create: async (a) => {
          calls.push(`create ${a.branch} <- ${a.parentBranch} ttl=${a.ttl}`);
        },
        waitReady: async (a) => {
          calls.push(`wait ${a.branch}`);
        },
        resolveDsn: async (a) => {
          calls.push(`dsn ${a.branch}`);
          return "postgresql://child/db";
        },
        remove: async (a) => {
          calls.push(`delete ${a.branch}`);
        },
      },
      (childDsn) => {
        calls.push(`run ${childDsn}`);
        return childDsn === "postgresql://child/db";
      },
    );
    expect(result).toBe(true);
    expect(calls).toEqual([
      "create experiment-s3-exp1-vrfy-9 <- experiment-s3-exp1 ttl=3600s",
      "wait experiment-s3-exp1-vrfy-9",
      "dsn experiment-s3-exp1-vrfy-9",
      "run postgresql://child/db",
      "delete experiment-s3-exp1-vrfy-9",
    ]);
  });

  it("ALWAYS deletes the child even when run throws (and re-throws)", async () => {
    let deleted = false;
    await expect(
      withEphemeralVerifyBranch(
        {
          instance: "proj-1",
          parentBranch: "exp",
          childName: "exp-vrfy-1",
          create: async () => {},
          waitReady: async () => {},
          resolveDsn: async () => "postgresql://child/db",
          remove: async () => {
            deleted = true;
          },
        },
        () => {
          throw new Error("verify blew up");
        },
      ),
    ).rejects.toThrow("verify blew up");
    expect(deleted).toBe(true); // teardown ran despite the failure
  });

  it("never fails the verify because teardown failed (delete error swallowed)", async () => {
    const result = await withEphemeralVerifyBranch(
      {
        instance: "proj-1",
        parentBranch: "exp",
        childName: "exp-vrfy-2",
        create: async () => {},
        waitReady: async () => {},
        resolveDsn: async () => "postgresql://child/db",
        remove: async () => {
          throw new Error("delete failed (TTL will reap)");
        },
      },
      () => true,
    );
    expect(result).toBe(true); // run's result stands; the TTL is the backstop
  });
});
