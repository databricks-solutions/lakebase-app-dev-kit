// The ONE way the kit runs the `databricks` CLI.
//
// Every `databricks ...` subprocess in the kit goes through here. There is a
// single implementation of the three things that used to be scattered across six
// ad-hoc `dbcli` copies (branch-create / branch-delete / branch-utils /
// get-connection / lakebase-project / schema-diff), each of which only set
// DATABRICKS_HOST and left the PROFILE to whatever the launching shell happened to
// export. When the shell had no DATABRICKS_CONFIG_PROFILE, the CLI silently fell
// back to the DEFAULT profile, whose cached token points at a different workspace,
// so a mid-run call died with "the refresh token is invalid" against the wrong
// profile. This wrapper removes that entire failure class:
//
//   1. PROFILE, resolved ONE way and threaded EXPLICITLY. Precedence:
//      explicit opts.profile -> env DATABRICKS_CONFIG_PROFILE -> host-match via
//      `databricks auth profiles` (resolveProfileForHostSync + the shared pure
//      selector). The resolved name is passed as `--profile <p>` on EVERY call, so
//      the credential is deterministic regardless of how the process was launched
//      (interactive shell, the drive, a `claude -p` agent). Resolution is memoized
//      per host so `auth profiles` is shelled at most once per host per process.
//   2. HOST, set via DATABRICKS_HOST when given (unchanged behavior).
//   3. AUTH FAILURE, detected ONE way and surfaced as a single actionable
//      DatabricksAuthError naming the exact profile + the `databricks auth login
//      --profile <p>` command, instead of a raw crash from one code path and an
//      opaque wrapped string from another.
//
// Sync + async spawn are both offered (some callers are execFileSync, some
// execFile) but they share the SAME invocation-building + error-mapping core, so
// "one way it works" holds across both.

import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { KIT_TIMEOUTS } from "./kit-config.js";
import { resolveProfileForHostSync } from "./databricks-profile.js";

const execFileP = promisify(execFile);

export interface DatabricksCliOptions {
  /** Workspace host. Sets DATABRICKS_HOST and (absent an explicit/env profile)
   *  drives the host->profile match. */
  host?: string;
  /** Explicit profile (highest precedence). Overrides env + host-match. */
  profile?: string;
  /** Subprocess timeout (ms). Defaults to KIT_TIMEOUTS.cliDefault. */
  timeout?: number;
  /** Base environment (test seam). Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

/** A `databricks` CLI call failed. Message preserves the historical shape
 *  (`databricks <args> failed: <msg>\nstderr: <stderr>`) so callers that match on
 *  it (e.g. the TTL-too-long fallback) keep working. */
export class DatabricksCliError extends Error {
  constructor(
    message: string,
    readonly profile?: string,
    readonly stderr?: string,
  ) {
    super(message);
    this.name = "DatabricksCliError";
  }
}

/** A `databricks` call failed because authentication is missing/expired. Only a
 *  human `databricks auth login` can fix it, so the message names the exact profile
 *  and the re-auth command. Subclass of DatabricksCliError so existing catches
 *  still see a CLI error. */
export class DatabricksAuthError extends DatabricksCliError {
  constructor(profile: string | undefined, detail: string) {
    const login = `databricks auth login${profile ? ` --profile ${profile}` : ""}`;
    super(
      `Databricks authentication failed${profile ? ` for profile "${profile}"` : ""}: the cached token is missing or expired. ` +
        `Re-authenticate, then re-run:\n  ${login}\n${detail}`,
      profile,
      detail,
    );
    this.name = "DatabricksAuthError";
  }
}

/** Memoized host -> profile (undefined = resolved-to-nothing, still cached so we
 *  do not re-shell `auth profiles` for a host with no unique match). */
const profileByHost = new Map<string, string | undefined>();

/** Test seam: clear the per-process profile memo. */
export function _resetProfileCache(): void {
  profileByHost.clear();
}

/** Does this CLI output signal an auth/token failure a human must re-login to fix? */
function isAuthFailure(text: string): boolean {
  return /refresh token is invalid|auth login|could not be retrieved because|not authenticated|no valid.*(credential|token)|invalid.*(access token|credential)|\b401\b|unauthorized/i.test(
    text,
  );
}

/** Resolve the profile ONE way (explicit -> env -> host-match, memoized per host). */
function resolveProfile(opts: DatabricksCliOptions): string | undefined {
  const base = opts.env ?? process.env;
  if (opts.profile) return opts.profile;
  const envProfile = base.DATABRICKS_CONFIG_PROFILE?.trim();
  if (envProfile) return envProfile;
  const host = opts.host?.trim();
  if (!host) return undefined;
  if (profileByHost.has(host)) return profileByHost.get(host);
  const resolved = resolveProfileForHostSync(host, opts.timeout);
  profileByHost.set(host, resolved);
  return resolved;
}

/** Build the full argv (with `--profile` threaded), child env, and resolved
 *  profile, shared by the sync + async spawns so both behave identically.
 *  Exported as a test seam (pure when a profile is explicit or in opts.env). */
export function buildInvocation(args: string[], opts: DatabricksCliOptions): {
  argv: string[];
  env: NodeJS.ProcessEnv;
  profile: string | undefined;
} {
  const base = opts.env ?? process.env;
  const trimmedHost = opts.host?.replace(/\/+$/, "");
  const env: NodeJS.ProcessEnv = trimmedHost ? { ...base, DATABRICKS_HOST: trimmedHost } : base;
  const profile = resolveProfile(opts);
  // Explicit --profile wins over the ambient env, so the credential is deterministic.
  // Do not double-add if the caller already passed one.
  const argv = profile && !args.includes("--profile") ? [...args, "--profile", profile] : args;
  return { argv, env, profile };
}

/** Map a spawn failure to a typed error, detecting auth failures uniformly.
 *  Exported as a test seam. */
export function classifyDatabricksError(err: unknown, argv: string[], profile: string | undefined): DatabricksCliError {
  const e = err as NodeJS.ErrnoException & { stderr?: string | Buffer; stdout?: string | Buffer };
  const stderr =
    typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
  const haystack = `${e.message ?? ""}\n${stderr}`;
  if (isAuthFailure(haystack)) {
    return new DatabricksAuthError(profile, stderr.trim() || (e.message ?? ""));
  }
  return new DatabricksCliError(
    `databricks ${argv.join(" ")} failed: ${e.message}${stderr ? `\nstderr: ${stderr.trim()}` : ""}`,
    profile,
    stderr.trim(),
  );
}

/** Run the `databricks` CLI (async). Threads the resolved `--profile`, sets
 *  DATABRICKS_HOST, and maps auth failures to DatabricksAuthError. Returns stdout. */
export async function runDatabricks(args: string[], opts: DatabricksCliOptions = {}): Promise<string> {
  const { argv, env, profile } = buildInvocation(args, opts);
  try {
    const { stdout } = await execFileP("databricks", argv, {
      env,
      timeout: opts.timeout ?? KIT_TIMEOUTS.cliDefault,
    });
    return stdout.toString();
  } catch (err) {
    throw classifyDatabricksError(err, argv, profile);
  }
}

/** Run the `databricks` CLI (sync). Same invocation-building + error-mapping as
 *  runDatabricks; for the execFileSync call sites (get-connection / schema-diff). */
export function runDatabricksSync(args: string[], opts: DatabricksCliOptions = {}): string {
  const { argv, env, profile } = buildInvocation(args, opts);
  try {
    return execFileSync("databricks", argv, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env,
      timeout: opts.timeout ?? KIT_TIMEOUTS.cliDefault,
    });
  } catch (err) {
    throw classifyDatabricksError(err, argv, profile);
  }
}
