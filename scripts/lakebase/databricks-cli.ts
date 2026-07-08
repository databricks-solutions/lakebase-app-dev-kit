// The single entry point for running the `databricks` CLI. All callers use
// runDatabricks (async) or runDatabricksSync (sync); both share one invocation
// builder + error mapper.
//
//   - Profile: resolved as explicit opts.profile -> env DATABRICKS_CONFIG_PROFILE
//     -> project .env at cwd -> host-match via `databricks auth profiles`
//     (memoized per host), and threaded as `--profile <p>` on every call.
//   - Host: DATABRICKS_HOST set when given.
//   - Auth failure: mapped to DatabricksAuthError naming the profile + the
//     `databricks auth login` command to run.

import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { KIT_TIMEOUTS } from "./kit-config.js";
import { resolveProfileForHostSync } from "./databricks-profile.js";
import { readEnvVar } from "./env-file.js";

const execFileP = promisify(execFile);

export interface DatabricksCliOptions {
  /** Workspace host. Sets DATABRICKS_HOST and (absent an explicit/env profile)
   *  drives the host->profile match. */
  host?: string;
  /** Explicit profile (highest precedence). Overrides env + host-match. */
  profile?: string;
  /** Subprocess timeout (ms). Defaults to KIT_TIMEOUTS.cliDefault. */
  timeout?: number;
  /** Base environment. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Project dir whose `.env` supplies DATABRICKS_CONFIG_PROFILE. Defaults to process.cwd(). */
  cwd?: string;
}

/** A `databricks` CLI call failed. Message: `databricks <args> failed: <msg>\nstderr: <stderr>`. */
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

/** A `databricks` call failed on missing/expired auth. Message names the profile
 *  and the `databricks auth login` command. Subclass of DatabricksCliError. */
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

/** Memoized host -> profile (undefined cached too, to avoid re-shelling). */
const profileByHost = new Map<string, string | undefined>();
/** Memoized <cwd> -> DATABRICKS_CONFIG_PROFILE from that project's .env. */
const profileByEnvFile = new Map<string, string | undefined>();

/** Clear the per-process profile memos (tests). */
export function _resetProfileCache(): void {
  profileByHost.clear();
  profileByEnvFile.clear();
}

/** Does this CLI output signal an auth/token failure a human must re-login to fix? */
function isAuthFailure(text: string): boolean {
  return /refresh token is invalid|auth login|could not be retrieved because|not authenticated|no valid.*(credential|token)|invalid.*(access token|credential)|\b401\b|unauthorized/i.test(
    text,
  );
}

/** Resolve the profile: explicit opts.profile -> env DATABRICKS_CONFIG_PROFILE
 *  -> `<cwd>/.env` DATABRICKS_CONFIG_PROFILE -> host-match. File + host reads memoized. */
function resolveProfile(opts: DatabricksCliOptions): string | undefined {
  const base = opts.env ?? process.env;
  if (opts.profile) return opts.profile;
  const envProfile = base.DATABRICKS_CONFIG_PROFILE?.trim();
  if (envProfile) return envProfile;

  const cwd = opts.cwd ?? process.cwd();
  let fromEnvFile: string | undefined;
  if (profileByEnvFile.has(cwd)) {
    fromEnvFile = profileByEnvFile.get(cwd);
  } else {
    fromEnvFile = readEnvVar(join(cwd, ".env"), "DATABRICKS_CONFIG_PROFILE");
    profileByEnvFile.set(cwd, fromEnvFile);
  }
  if (fromEnvFile) return fromEnvFile;

  const host = opts.host?.trim();
  if (!host) return undefined;
  if (profileByHost.has(host)) return profileByHost.get(host);
  const resolved = resolveProfileForHostSync(host, opts.timeout);
  profileByHost.set(host, resolved);
  return resolved;
}

/** Build the argv (with `--profile` threaded), child env, and resolved profile. */
export function buildInvocation(args: string[], opts: DatabricksCliOptions): {
  argv: string[];
  env: NodeJS.ProcessEnv;
  profile: string | undefined;
} {
  const base = opts.env ?? process.env;
  const trimmedHost = opts.host?.replace(/\/+$/, "");
  const env: NodeJS.ProcessEnv = trimmedHost ? { ...base, DATABRICKS_HOST: trimmedHost } : base;
  const profile = resolveProfile(opts);
  const argv = profile && !args.includes("--profile") ? [...args, "--profile", profile] : args;
  return { argv, env, profile };
}

/** Map a spawn failure to a typed error (DatabricksAuthError on auth failure). */
export function classifyDatabricksError(err: unknown, argv: string[], profile: string | undefined): DatabricksCliError {
  const e = err as NodeJS.ErrnoException & { stderr?: string | Buffer; stdout?: string | Buffer; code?: string | number };
  const asText = (v: string | Buffer | undefined): string =>
    typeof v === "string" ? v : Buffer.isBuffer(v) ? v.toString("utf8") : "";
  const stderr = asText(e.stderr).trim();
  const stdout = asText(e.stdout).trim();
  const haystack = `${e.message ?? ""}\n${stderr}\n${stdout}`;
  if (isAuthFailure(haystack)) {
    return new DatabricksAuthError(profile, stderr || stdout || (e.message ?? ""));
  }
  // Some CLI failures write to stdout, not stderr; a few exit non-zero with both
  // streams empty. Fold in whatever we have plus the exit code so a silent
  // failure is still legible rather than a bare "Command failed". A TIMEOUT kill
  // is the worst offender: execFile SIGTERMs the process, so stderr/stdout are
  // empty and the exit code is `null` , name it explicitly (the opaque
  // "exit null" that masked a too-short create-project budget) so the fix
  // (raise the matching LAKEBASE_KIT_TIMEOUT_* env var) is obvious.
  const killed = (e as { killed?: boolean }).killed === true;
  const signal = (e as { signal?: string | null }).signal ?? undefined;
  const detail = stderr
    ? `\nstderr: ${stderr}`
    : stdout
      ? `\nstdout: ${stdout}`
      : killed || signal
        ? `\n(no output; the CLI was killed${signal ? ` by ${signal}` : ""}, likely a TIMEOUT; raise the budget via the matching LAKEBASE_KIT_TIMEOUT_* env var)`
        : e.code !== undefined
          ? `\n(no stderr/stdout; exit ${e.code})`
          : "";
  return new DatabricksCliError(
    `databricks ${argv.join(" ")} failed: ${e.message}${detail}`,
    profile,
    stderr || stdout,
  );
}

/** Run the `databricks` CLI (async), returning stdout. */
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

/** Run the `databricks` CLI (sync), returning stdout. */
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
