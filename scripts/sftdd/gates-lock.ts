// File-lock primitive for concurrent-safe gates.json mutations.
//
// Tracker: (G7 /). Implements the lock approach from
// ADR-0004 open question #2 (file lock via a sibling .gates.lock file).
//
// Why we need this:
//   approveGate / withdrawGate are read-modify-write operations. Without
//   serialization, two concurrent callers can both read the same state,
//   both compute their next state independently, and the second write
//   silently clobbers the first. The lock turns the read-modify-write
//   into a critical section.
//
// Mechanism:
//   fs.openSync(<lockPath>, "wx") fails with EEXIST when the file already
//   exists. We use the lockfile's presence itself as the mutex. On EEXIST,
//   the caller retries with exponential backoff. On a successful acquire,
//   we hold the file descriptor + delete the file on release.
//
//   The wx flag is atomic on POSIX + Windows local filesystems (the kernel
//   guarantees create-or-EEXIST without a TOCTOU window). Network mounts
//   (NFS, SMB) may NOT guarantee this. Acceptable trade-off: substrate
//   workflows run on the developer's local filesystem.
//
//   The on-disk lockfile contains the holding PID for forensics: if the
//   holder crashes without releasing, the next caller sees "lock held by
//   PID N" in the error message and can manually `rm .gates.lock` to
//   recover.
//
// Retry budget:
//   Default 5 retries with 20ms / 40ms / 80ms / 160ms / 320ms backoff
//   (~620ms max wait). Exceeding the budget throws a clear error so the
//   caller knows the workflow is wedged + can prompt the HITL.

import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import type { GatesIoOpts } from "./gates";
import { resolveSftddDir, requireFeatureDir as findFeatureDir } from "./sftdd-paths.js";

export interface WithGatesLockOpts extends GatesIoOpts {
  /** Max retry attempts before giving up. Default 5. */
  maxRetries?: number;
  /** Initial backoff in milliseconds. Doubles each retry. Default 20. */
  initialBackoffMs?: number;
  /** Test seam: deterministic sleep replacement. */
  sleep?: (ms: number) => void;
}

export class GatesLockBusyError extends Error {
  constructor(
    public readonly featureId: string,
    public readonly heldByPid: number | null,
    public readonly retries: number
  ) {
    super(
      `gates.json lock for ${featureId} is held by PID ${
        heldByPid ?? "unknown"
      } after ${retries} retries. ` +
        `If the holder has crashed, remove the lock file manually.`
    );
    this.name = "GatesLockBusyError";
  }
}

/**
 * Acquire the lock for a feature's gates.json, run fn, release the lock.
 * Returns whatever fn returned. Throws GatesLockBusyError if the lock
 * stays held past the retry budget.
 *
 * Re-entrant from the same process is NOT supported: a single process
 * holding the lock cannot acquire it again. (Acceptable for the current
 * usage pattern: approveGate / withdrawGate are leaf operations, not
 * called from inside one another.)
 */
export function withGatesLock<T>(
  featureId: string,
  fn: () => T,
  opts: WithGatesLockOpts = {}
): T {
  const sftddDir = opts.sftddDir ?? resolveSftddDir();
  const maxRetries = opts.maxRetries ?? 5;
  const initialBackoffMs = opts.initialBackoffMs ?? 20;
  const sleep = opts.sleep ?? defaultSleep;

  const lockPath = gatesLockFilePath(sftddDir, featureId);
  let acquired = false;
  let attempts = 0;

  while (!acquired && attempts <= maxRetries) {
    try {
      const fd = openSync(lockPath, "wx");
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      acquired = true;
    } catch (err) {
      if (!isEexist(err)) throw err;
      attempts += 1;
      if (attempts > maxRetries) {
        const heldByPid = readHeldByPid(lockPath);
        throw new GatesLockBusyError(featureId, heldByPid, maxRetries);
      }
      sleep(initialBackoffMs * 2 ** (attempts - 1));
    }
  }

  try {
    return fn();
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      // Best-effort cleanup; if the lockfile is already gone (e.g. another
      // process force-recovered it) we don't want to mask the inner result.
    }
  }
}

function isEexist(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "EEXIST"
  );
}

function readHeldByPid(lockPath: string): number | null {
  try {
    const text = readFileSync(lockPath, "utf8");
    const n = Number(text.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function gatesLockFilePath(sftddDir: string, featureId: string): string {
  const dir = findFeatureDir(sftddDir, featureId);
  // Ensure the feature dir exists for the lockfile placement; gates.ts
  // also enforces this for the gates.json path. We mirror that behavior
  // so the lock can be acquired even on a fresh feature.
  mkdirSync(dir, { recursive: true });
  return join(dir, ".gates.lock");
}

function defaultSleep(ms: number): void {
  // Synchronous sleep via Atomics.wait on a fresh Int32Array. Avoids the
  // performance hit of a spin loop while keeping the API synchronous so
  // existing callers (approveGate / withdrawGate are sync) don't have to
  // become async.
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}
