// Resolve which Databricks CLI profile to pin for a given workspace host,
// and heal a project's .env so its auth survives multi-workspace setups.
//
// Why this exists: a project's .env carries DATABRICKS_HOST but, by
// default, no DATABRICKS_CONFIG_PROFILE. When a developer has multiple
// profiles in ~/.databrickscfg and their DEFAULT profile points at a
// DIFFERENT host, the CLI cannot map the bare DATABRICKS_HOST env var to
// the cached OAuth token, so `databricks current-user me` (the preflight
// every hook + refresh-token script runs after sourcing .env) fails even
// though a valid named profile for that exact host exists. Pinning the
// matching profile in .env is the documented fix.
//
// The inverse primitive (profile -> host) already lives in
// databricks-host.ts; this is the host -> profile direction, driven by
// `databricks auth profiles -o json`.

import * as fs from "node:fs";
import { exec } from "../util/exec.js";
import { KIT_TIMEOUTS } from "./kit-config.js";

/** One entry from `databricks auth profiles -o json`. */
export interface DatabricksProfile {
  name: string;
  host?: string;
  valid?: boolean;
}

/** Normalize a workspace host for comparison: trim, strip trailing slashes, lowercase. */
export function normalizeHost(host: string): string {
  return host.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Pure selector. Given the JSON emitted by `databricks auth profiles -o
 * json` and a target workspace host, return the name of the unique VALID
 * profile whose host matches.
 *
 * Returns undefined when there is no match, or when the match is ambiguous
 * (more than one distinct valid profile for the same host): we never pin a
 * guess. Tolerates a non-JSON preamble (the CLI sometimes prefixes warning
 * lines) by trimming to the first `{`, mirroring parseHostFromAuthDescribe.
 */
export function selectProfileForHost(profilesJson: string, host: string): string | undefined {
  const target = normalizeHost(host);
  if (!target) return undefined;

  const start = profilesJson.indexOf("{");
  if (start < 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(profilesJson.slice(start));
  } catch {
    return undefined;
  }

  const profiles = (parsed as { profiles?: unknown }).profiles;
  if (!Array.isArray(profiles)) return undefined;

  const names = profiles
    .filter((p): p is DatabricksProfile => {
      if (!p || typeof p !== "object") return false;
      const rec = p as Record<string, unknown>;
      return (
        typeof rec.name === "string" &&
        typeof rec.host === "string" &&
        rec.valid === true &&
        normalizeHost(rec.host) === target
      );
    })
    .map((p) => p.name);

  const distinct = Array.from(new Set(names));
  return distinct.length === 1 ? distinct[0] : undefined;
}

/**
 * Resolve the unique valid CLI profile for a workspace host by shelling
 * out to `databricks auth profiles -o json`. Returns undefined when the
 * CLI is missing/errors, or when there is no unique valid match (caller
 * then leaves the .env's bare host untouched: status quo, never worse).
 */
export async function resolveProfileForHost(
  host: string,
  timeoutMs: number = KIT_TIMEOUTS.cliDefault,
): Promise<string | undefined> {
  if (!normalizeHost(host)) return undefined;
  let out: string;
  try {
    out = await exec("databricks auth profiles -o json", { timeout: timeoutMs });
  } catch {
    return undefined;
  }
  return selectProfileForHost(out, host);
}

export interface EnsureProfilePinnedArgs {
  /** Absolute path to the project's .env. */
  envPath: string;
  /**
   * Test seam: override the host -> profile resolver. Defaults to the
   * live resolveProfileForHost (which shells out to the CLI).
   */
  resolve?: (host: string) => Promise<string | undefined>;
}

export interface EnsureProfilePinnedResult {
  /** Profile name newly written into .env, when a pin was added. */
  pinned?: string;
  /** Why no pin was written (for logging / doctor output). */
  reason?: "already-pinned" | "no-env" | "no-host" | "no-match";
}

/**
 * Idempotently ensure .env pins DATABRICKS_CONFIG_PROFILE. No-op when the
 * file is missing, the profile is already pinned, there is no
 * DATABRICKS_HOST to resolve against, or no unique valid profile matches.
 * When a unique match is found, the pin is inserted directly after the
 * DATABRICKS_HOST line so the two auth keys stay together.
 */
export async function ensureProfilePinned(
  args: EnsureProfilePinnedArgs,
): Promise<EnsureProfilePinnedResult> {
  const { envPath } = args;
  if (!fs.existsSync(envPath)) return { reason: "no-env" };

  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  const startsWithKey = (line: string, key: string) => line.trimStart().startsWith(`${key}=`);

  if (lines.some((l) => startsWithKey(l, "DATABRICKS_CONFIG_PROFILE"))) {
    return { reason: "already-pinned" };
  }

  const hostIdx = lines.findIndex((l) => startsWithKey(l, "DATABRICKS_HOST"));
  if (hostIdx < 0) return { reason: "no-host" };
  const hostLine = lines[hostIdx];
  const host = hostLine.slice(hostLine.indexOf("=") + 1).trim();
  if (!host) return { reason: "no-host" };

  const resolve = args.resolve ?? ((h: string) => resolveProfileForHost(h));
  const profile = await resolve(host);
  if (!profile) return { reason: "no-match" };

  lines.splice(hostIdx + 1, 0, `DATABRICKS_CONFIG_PROFILE=${profile}`);
  fs.writeFileSync(envPath, lines.join("\n"));
  return { pinned: profile };
}
