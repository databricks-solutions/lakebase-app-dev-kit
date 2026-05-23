// Lakebase branch endpoint discovery.
//
// Reads endpoint metadata (host + state) for a branch. Does NOT mint
// credentials — that stays in get-connection.ts (single seam, CI-enforced).
// Composes with branch-utils.resolveBranchPath so callers can pass uid,
// sanitized name, or full resource path.

import { execFileSync } from "node:child_process";
import { resolveBranchPath } from "./branch-utils.js";
import { mintCredential } from "./get-connection.js";

export interface EndpointInfo {
  host: string;
  state: string;
}

export interface GetEndpointArgs {
  instance: string;
  branch: string;
  /** Default: "primary" */
  endpointName?: string;
}

/**
 * Look up the primary endpoint for a Lakebase branch.
 *
 * Returns undefined when the branch has no endpoints yet, or when the
 * endpoint exists but has no host (still provisioning). For "wait until
 * ready" semantics, poll with a retry loop in the caller.
 */
export async function getEndpoint(args: GetEndpointArgs): Promise<EndpointInfo | undefined> {
  const branchPath = await resolveBranchPath(args.branch, { instance: args.instance });
  if (!branchPath) {
    return undefined;
  }
  let raw: string;
  try {
    raw = execFileSync("databricks", ["postgres", "list-endpoints", branchPath, "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
  } catch {
    return undefined;
  }
  let endpoints: Array<{ status?: { hosts?: { host?: string }; current_state?: string } }>;
  try {
    endpoints = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    return undefined;
  }
  const ep = endpoints[0];
  return {
    host: ep?.status?.hosts?.host ?? "",
    state: ep?.status?.current_state ?? "UNKNOWN",
  };
}

/**
 * Build the canonical endpoint resource path that mintCredential expects.
 * Convenience helper — most callers go through getConnection() which builds
 * this internally.
 */
export function endpointPath(instance: string, branch: string, endpointName = "primary"): string {
  return `projects/${instance}/branches/${branch}/endpoints/${endpointName}`;
}

export interface GetCredentialArgs {
  instance: string;
  branch: string;
  /** Default: "primary" */
  endpointName?: string;
}

/**
 * Mint a short-lived `{ token, email }` for a branch's endpoint. Resolves the
 * branch path (so caller can pass uid / sanitized name / full path), then
 * routes through `mintCredential` in get-connection.ts — the single credential
 * seam. Useful for callers that want raw credentials rather than a DSN/Pool
 * (e.g. constructing a pg.Client with custom timeouts).
 */
export async function getCredential(args: GetCredentialArgs): Promise<{ token: string; email: string }> {
  const branchPath = await resolveBranchPath(args.branch, { instance: args.instance });
  if (!branchPath) {
    throw new Error(`Branch "${args.branch}" not found in instance "${args.instance}"`);
  }
  const endpointName = args.endpointName ?? "primary";
  return mintCredential(`${branchPath}/endpoints/${endpointName}`);
}
