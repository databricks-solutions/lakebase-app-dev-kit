// G7: concurrent-write atomicity via a file lock.
//
// Covers ADR-0004 test plan scenario S8 (two-process concurrent approveGate
// on different gates) via in-process simulation of the wx-flag lock contract.
// Also asserts the retry-budget exhaustion path + the lockfile-PID forensics.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { GatesLockBusyError, withGatesLock } from "../../scripts/sftdd/gates-lock";
import { approveGate } from "../../scripts/sftdd/approve-gate";
import { withdrawGate } from "../../scripts/sftdd/withdraw-gate";
import { readGates } from "../../scripts/sftdd/gates";

let tdd: string;
const FEATURE_ID = "F1-checkout";
const APPROVER = "kevin.hartman@databricks.com";
const FIXED_NOW = () => new Date("2026-05-31T20:00:00Z");

function makeFeatureDir(): string {
  const dir = join(tdd, "features", FEATURE_ID);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function lockPath(): string {
  return join(tdd, "features", FEATURE_ID, ".gates.lock");
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-gates-lock-"));
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("withGatesLock: acquire + release semantics", () => {
  it("creates the .gates.lock file while fn is running, removes it on exit", () => {
    makeFeatureDir();
    let observedDuringFn = false;
    withGatesLock(
      FEATURE_ID,
      () => {
        observedDuringFn = existsSync(lockPath());
        return null;
      },
      { sftddDir: tdd }
    );
    expect(observedDuringFn).toBe(true);
    expect(existsSync(lockPath())).toBe(false);
  });

  it("returns the fn's return value", () => {
    makeFeatureDir();
    const result = withGatesLock(
      FEATURE_ID,
      () => 42,
      { sftddDir: tdd }
    );
    expect(result).toBe(42);
  });

  it("writes the holding process's PID into the lockfile", () => {
    makeFeatureDir();
    let pidOnDisk: string | null = null;
    withGatesLock(
      FEATURE_ID,
      () => {
        pidOnDisk = readFileSync(lockPath(), "utf8");
        return null;
      },
      { sftddDir: tdd }
    );
    expect(pidOnDisk).toBe(String(process.pid));
  });

  it("releases the lock even when fn throws", () => {
    makeFeatureDir();
    expect(() =>
      withGatesLock(
        FEATURE_ID,
        () => {
          throw new Error("inner failure");
        },
        { sftddDir: tdd }
      )
    ).toThrow(/inner failure/);
    expect(existsSync(lockPath())).toBe(false);
  });
});

describe("withGatesLock: lock-busy retry + exhaustion", () => {
  it("retries on EEXIST and succeeds when the lock is released mid-wait", () => {
    makeFeatureDir();
    // Pre-create the lock to simulate a holder.
    writeFileSync(lockPath(), "999999");
    let releasedOnAttempt = 2;
    let attempts = 0;
    const sleep = (_ms: number): void => {
      attempts += 1;
      if (attempts === releasedOnAttempt) rmSync(lockPath());
    };
    const result = withGatesLock(
      FEATURE_ID,
      () => "acquired",
      { sftddDir: tdd, sleep, maxRetries: 5, initialBackoffMs: 1 }
    );
    expect(result).toBe("acquired");
    expect(attempts).toBeGreaterThanOrEqual(releasedOnAttempt);
  });

  it("throws GatesLockBusyError after maxRetries with the holding PID in the message", () => {
    makeFeatureDir();
    writeFileSync(lockPath(), "12345");
    const sleep = (_ms: number): void => {
      // No-op; lock stays held.
    };
    let thrown: unknown = null;
    try {
      withGatesLock(FEATURE_ID, () => null, {
        sftddDir: tdd,
        maxRetries: 2,
        initialBackoffMs: 1,
        sleep,
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(GatesLockBusyError);
    expect((thrown as GatesLockBusyError).heldByPid).toBe(12345);
    expect((thrown as GatesLockBusyError).retries).toBe(2);
    expect((thrown as Error).message).toMatch(/12345/);
  });

  it("reports heldByPid as null when the lockfile is empty or unreadable", () => {
    makeFeatureDir();
    writeFileSync(lockPath(), "not a number");
    const sleep = (_ms: number): void => {};
    let thrown: GatesLockBusyError | null = null;
    try {
      withGatesLock(FEATURE_ID, () => null, {
        sftddDir: tdd,
        maxRetries: 1,
        initialBackoffMs: 1,
        sleep,
      });
    } catch (err) {
      thrown = err as GatesLockBusyError;
    }
    expect(thrown).not.toBeNull();
    expect(thrown!.heldByPid).toBeNull();
  });
});

describe("withGatesLock: approveGate + withdrawGate retrofit", () => {
  it("approveGate releases the lock after a successful approval", () => {
    makeFeatureDir();
    approveGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "feature-spec.md": "x", "feature-spec.json": "{}" },
      sftddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });
    expect(existsSync(lockPath())).toBe(false);
  });

  it("approveGate releases the lock even when re-approval throws", () => {
    makeFeatureDir();
    approveGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "feature-spec.md": "x", "feature-spec.json": "{}" },
      sftddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });
    expect(() =>
      approveGate({
        featureId: FEATURE_ID,
        gate: "spec",
        approver: APPROVER,
        hitlApproved: true,
        artifactInputs: { "feature-spec.md": "y", "feature-spec.json": "{}" },
        sftddDir: tdd,
        now: FIXED_NOW,
        writeSelectionLog: false,
      })
    ).toThrow(/not open/);
    expect(existsSync(lockPath())).toBe(false);
  });

  it("withdrawGate releases the lock after a successful withdrawal", () => {
    makeFeatureDir();
    approveGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "feature-spec.md": "x", "feature-spec.json": "{}" },
      sftddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });
    withdrawGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      reason: "rescope",
      sftddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });
    expect(existsSync(lockPath())).toBe(false);
  });
});

describe("withGatesLock: S8 concurrent-call mutual exclusion", () => {
  it("a second caller blocks until the first releases (in-process simulation)", () => {
    makeFeatureDir();
    let secondCallerStartedDuringFirst = false;
    let firstReleased = false;
    // Pre-acquire by writing the lock manually; simulate a competing
    // holder that releases on the second sleep tick.
    writeFileSync(lockPath(), "999999");
    let sleeps = 0;
    const sleep = (_ms: number): void => {
      sleeps += 1;
      if (sleeps === 2) {
        rmSync(lockPath());
        firstReleased = true;
      }
    };
    const result = withGatesLock(
      FEATURE_ID,
      () => {
        secondCallerStartedDuringFirst = !firstReleased;
        return "second-acquired";
      },
      { sftddDir: tdd, maxRetries: 5, initialBackoffMs: 1, sleep }
    );
    expect(result).toBe("second-acquired");
    // Inner fn must NOT have started while the lockfile still existed.
    expect(secondCallerStartedDuringFirst).toBe(false);
  });

  it("end-to-end: spec + plan can both land when serialized through the lock", () => {
    makeFeatureDir();
    // Approve both gates back-to-back through the lock. Each call acquires
    // + releases independently; we verify state contains both approvals.
    approveGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "feature-spec.md": "x", "feature-spec.json": "{}" },
      sftddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });
    approveGate({
      featureId: FEATURE_ID,
      gate: "plan",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "plan.json": "{}" },
      sftddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });
    const back = readGates(FEATURE_ID, { sftddDir: tdd });
    expect(back.gates.spec.status).toBe("approved");
    expect(back.gates.plan.status).toBe("approved");
  });
});
