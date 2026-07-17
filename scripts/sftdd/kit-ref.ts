// The kit-ref RUN PIN (Finding 28).
//
// `.lakebase/kit-ref` is git-tracked, so the drive's branch operations (claim
// checkout, experiment cut/re-fork, all of which fork from `origin/<parent>`)
// silently restore a branch-committed kit-ref out from under an operator's
// working-tree bump, running the WRONG kit version mid-run with no signal (an
// entire story built on the stale kit in the field).
//
// The fix is a checkout-proof, WORKSPACE-local pin: `.lakebase/kit-ref.local` is
// gitignored, so git never reverts it on a checkout/reset, and the `lk` shim reads
// it with precedence over the committed `.lakebase/kit-ref` (just below the env
// var). The drive resolves the launch ref ONCE and writes it here, so every
// subsequent `lk` call for the whole run , the orchestrator, each subagent's Bash
// tool (which do NOT reliably inherit env vars, which is why the pin is a FILE not
// an env export), and manual operator commands , runs the launch ref regardless of
// what a checkout does to the committed file. The committed `.lakebase/kit-ref`
// stays untouched (CI reads it to resolve its own KIT_REF).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export const KIT_REF_FILE = "kit-ref";
export const KIT_REF_LOCAL_FILE = "kit-ref.local";

function lakebaseFile(projectDir: string, name: string): string {
  return join(projectDir, ".lakebase", name);
}

function readTrimmed(file: string): string | undefined {
  if (!existsSync(file)) return undefined;
  try {
    const v = readFileSync(file, "utf8").trim();
    return v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

/** The committed, git-tracked ref (`.lakebase/kit-ref`), or undefined. CI reads this. */
export function committedKitRef(projectDir: string): string | undefined {
  return readTrimmed(lakebaseFile(projectDir, KIT_REF_FILE));
}

/** The gitignored workspace pin (`.lakebase/kit-ref.local`), or undefined. */
export function localKitRef(projectDir: string): string | undefined {
  return readTrimmed(lakebaseFile(projectDir, KIT_REF_LOCAL_FILE));
}

/**
 * The kit ref the run should pin to, in the SAME precedence the `lk` shim applies
 * (minus `LAKEBASE_KIT_DIR`, a dir override, not a ref): env `LAKEBASE_KIT_REF` ->
 * `.lakebase/kit-ref.local` -> `.lakebase/kit-ref`. Returns undefined when
 * `LAKEBASE_KIT_DIR` is set (dir override; a ref pin is moot) or when nothing is
 * pinned (the shim defaults to "main", which the drive leaves unpinned).
 */
export function resolveLaunchKitRef(
  projectDir: string,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  if (env.LAKEBASE_KIT_DIR) return undefined;
  const fromEnv = env.LAKEBASE_KIT_REF?.trim();
  if (fromEnv) return fromEnv;
  return localKitRef(projectDir) ?? committedKitRef(projectDir);
}

export interface PinResult {
  /** True iff `.lakebase/kit-ref.local` was written (created or changed). */
  pinned: boolean;
  /** The ref now pinned. */
  ref: string;
  /** The prior `.local` value, when it differed. */
  previous?: string;
}

/** Write the run's launch ref to the gitignored `.lakebase/kit-ref.local` so it
 *  survives branch checkouts. No-op (pinned=false) when `.local` already matches. */
export function pinRunKitRef(projectDir: string, ref: string): PinResult {
  const file = lakebaseFile(projectDir, KIT_REF_LOCAL_FILE);
  const previous = readTrimmed(file);
  if (previous === ref) return { pinned: false, ref };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, ref + "\n", "utf8");
  return { pinned: true, ref, ...(previous ? { previous } : {}) };
}

/** A drift warning when the COMMITTED kit-ref differs from the run's launch ref (a
 *  checkout restored a branch-committed ref out from under the run), or undefined
 *  when they agree or no committed ref exists. */
export function kitRefDriftWarning(projectDir: string, launchRef: string): string | undefined {
  const committed = committedKitRef(projectDir);
  if (!committed || committed === launchRef) return undefined;
  return (
    `kit-ref drift: the committed .lakebase/kit-ref is '${committed}' but this run is pinned to ` +
    `'${launchRef}' (.lakebase/kit-ref.local). A branch checkout restored the committed ref; the run keeps the ` +
    `pinned ref. If '${committed}' is intended, update .lakebase/kit-ref.local or unset the pin.`
  );
}
