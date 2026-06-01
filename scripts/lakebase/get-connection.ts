// Single credential-minting seam for Lakebase-paired workflows.
//
// Two outputs over one OAuth substrate:
//
//   --output dsn  → postgresql:// URL string for Flyway / Alembic / psql
//                   (short-lived window, language-agnostic, operator principal)
//   --output pool → @databricks/lakebase pg.Pool with refresh-on-connect
//                   for JS callers (long-lived; OBO via AppKit when caller
//                   supplies a workspace client)
//
// No other file in this codebase should shell out to
// `databricks postgres generate-database-credential` – a CI grep guard
// (.github/workflows/grep-guard.yml) fails the build if it appears outside
// this module.

import { execFileSync } from "node:child_process";
import { createLakebasePool } from "@databricks/lakebase";
import { Client, type Pool } from "pg";
import { resolveBranchId } from "./branch-utils.js";
import { DEFAULT_DATABASE, DEFAULT_ENDPOINT, POSTGRES_PORT } from "./constants.js";
import { KIT_TIMEOUTS } from "./kit-config.js";
// AppKit / @databricks/lakebase re-exports a WorkspaceClient type that
// matches what createLakebasePool expects. We accept `unknown` at the API
// boundary so this module doesn't have to take a hard SDK dep just to type
// an opaque pass-through.

export interface GetConnectionArgs {
  /**
   * Lakebase project id (e.g. "proj-abc123"). Maps to
   * `projects/<instance>` in the Databricks resource hierarchy.
   */
  instance: string;
  /**
   * Branch identifier within the project. Accepts:
   *   - branch_id (e.g. "demo-feature"; also any PSA tier name:
   *     "production", "staging", "uat", "perf")
   *   - branch_uid (e.g. "br-broad-sky-d2k5gewt")
   *   - full resource path ("projects/x/branches/demo-feature")
   *
   * Normalized to branch_id internally before any CLI path is built.
   */
  branch: string;
  /**
   * Endpoint identifier on the branch. Defaults to "primary" – the only
   * value the extension uses today (see lakebaseService.getCredential).
   */
  endpointName?: string;
  /**
   * Database name to connect to. Defaults to env PGDATABASE, then
   * "databricks_postgres".
   */
  database?: string;
  /**
   * For --output pool, an optional WorkspaceClient (from
   * @databricks/sdk-experimental). Pass when you want On-Behalf-Of behavior
   * via AppKit; omit to let @databricks/lakebase resolve from environment.
   */
  workspaceClient?: unknown;
}

export interface DsnArgs extends GetConnectionArgs {
  output: "dsn";
}

export interface PoolArgs extends GetConnectionArgs {
  output: "pool";
}

export type ConnectionArgs = DsnArgs | PoolArgs;

export interface DsnResult {
  url: string;
  host: string;
  port: number;
  database: string;
  user: string;
  endpointPath: string;
}

export function getConnection(args: DsnArgs): Promise<DsnResult>;
export function getConnection(args: PoolArgs): Promise<Pool>;
export async function getConnection(args: ConnectionArgs): Promise<DsnResult | Pool> {
  const endpointName = args.endpointName ?? DEFAULT_ENDPOINT;
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  // Normalize once at the entry point. Every downstream CLI path uses
  // branchId; callers can hand us uid / branch_id / full path.
  const branchId = await resolveBranchId({ instance: args.instance, branch: args.branch });
  const endpointPath = `projects/${args.instance}/branches/${branchId}/endpoints/${endpointName}`;

  if (args.output === "dsn") {
    const host = await resolveEndpointHost(args.instance, branchId);
    const { token, email } = await mintCredential(endpointPath);
    const url = buildPostgresUrl({ host, port: POSTGRES_PORT, database, user: email, password: token });
    return { url, host, port: POSTGRES_PORT, database, user: email, endpointPath };
  }

  // output === "pool"
  const host = await resolveEndpointHost(args.instance, branchId);
  const email = await resolveCurrentUser();
  return createLakebasePool({
    endpoint: endpointPath,
    host,
    database,
    user: email,
    // workspaceClient is passed through verbatim. createLakebasePool falls
    // back to environment / ServiceContext when omitted.
    ...(args.workspaceClient !== undefined
      ? { workspaceClient: args.workspaceClient as never }
      : {}),
  });
}

/**
 * Resolve the primary endpoint host for a branch.
 *
 * @param branch  branch_id, branch_uid, or full resource path. Normalized
 *                internally before the CLI subresource URL is built.
 */
export async function resolveEndpointHost(instance: string, branch: string): Promise<string> {
  const branchId = await resolveBranchId({ instance, branch });
  const branchPath = `projects/${instance}/branches/${branchId}`;
  const raw = dbcli(["postgres", "list-endpoints", branchPath, "-o", "json"]);
  const endpoints = JSON.parse(raw) as Array<{ status?: { hosts?: { host?: string } } }>;
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    throw new Error(`No endpoints found for branch ${branchPath}`);
  }
  const host = endpoints[0]?.status?.hosts?.host;
  if (!host) {
    throw new Error(`Endpoint exists for ${branchPath} but has no host yet – wait for it to become ACTIVE`);
  }
  return host;
}

/**
 * Mint a short-lived Lakebase credential against a branch endpoint.
 *
 * This is the ONLY function that should call
 * `databricks postgres generate-database-credential` anywhere in the codebase.
 * A CI grep guard enforces that – every other workflow op (schema queries,
 * direct pg.Pool construction, DSN building) must go through this helper.
 *
 * @param endpointPath Full Lakebase endpoint resource path
 *   (e.g. `projects/my-app/branches/feature-x/endpoints/primary`)
 */
export async function mintCredential(endpointPath: string): Promise<{ token: string; email: string }> {
  // ── single point of credential minting in the entire codebase ──
  const raw = dbcli(["postgres", "generate-database-credential", endpointPath, "-o", "json"]);
  const token = (JSON.parse(raw)?.token ?? "") as string;
  if (!token) {
    throw new Error(`generate-database-credential returned no token for ${endpointPath}`);
  }
  const email = await resolveCurrentUser();
  return { token, email };
}

export async function resolveCurrentUser(): Promise<string> {
  const raw = dbcli(["current-user", "me", "-o", "json"]);
  const parsed = JSON.parse(raw) as {
    userName?: string;
    emails?: Array<{ value?: string }>;
  };
  const email = parsed.userName ?? parsed.emails?.[0]?.value;
  if (!email) {
    throw new Error("Could not resolve current user from `databricks current-user me`");
  }
  return email;
}

function buildPostgresUrl(parts: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}): string {
  const u = new URL(`postgresql://${parts.host}:${parts.port}/${encodeURIComponent(parts.database)}`);
  u.username = encodeURIComponent(parts.user);
  u.password = encodeURIComponent(parts.password);
  u.searchParams.set("sslmode", "require");
  return u.toString();
}

function dbcli(args: string[]): string {
  try {
    return execFileSync("databricks", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: KIT_TIMEOUTS.cliDefault,
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string | Buffer };
    const stderr =
      typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new Error(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `\nstderr: ${stderr.trim()}` : ""}`
    );
  }
}

/**
 * Wait until a freshly-provisioned Lakebase branch will accept a
 * Postgres connection with credentials minted via `getConnection`.
 *
 * Use this after `createLakebaseProject` / `createBranch` and before
 * handing a DSN to a non-retrying Postgres client (notably the `pg`
 * Node driver, which surfaces transient "External authorization
 * failed" errors as terminal during the IAM-role-propagation window).
 * JDBC-based drivers (Flyway, Liquibase) generally retry internally so
 * they don't hit this problem; the `pg`-based path (Knex, custom
 * Node.js consumers, `getConnection({output: "pool"})`) does.
 *
 * Strategy: mint a fresh credential, open a probe `pg.Client`,
 * `SELECT 1`, close. If the connect or query fails with an
 * auth-failure error, wait + mint again + retry. The credential is
 * short-lived so a new mint per attempt is required (the OLD token
 * may have outlived the retry window).
 *
 * Times out after `timeoutMs` (default 60s) with the last error.
 */
export interface WaitForBranchAuthReadyArgs extends GetConnectionArgs {
  /** Total budget. Defaults to 60_000 ms. */
  timeoutMs?: number;
  /** Initial backoff between probes. Defaults to 2_000 ms. */
  initialBackoffMs?: number;
}

export async function waitForBranchAuthReady(
  args: WaitForBranchAuthReadyArgs
): Promise<void> {
  const timeoutMs = args.timeoutMs ?? 60_000;
  const initialBackoffMs = args.initialBackoffMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  let backoffMs = initialBackoffMs;
  let lastErr: unknown;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    let client: Client | undefined;
    try {
      const dsn = await getConnection({
        instance: args.instance,
        branch: args.branch,
        endpointName: args.endpointName,
        database: args.database,
        output: "dsn",
      });
      client = new Client({ connectionString: dsn.url });
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch (err) {
      lastErr = err;
      if (client) {
        try {
          await client.end();
        } catch {
          // best-effort
        }
      }
      if (!isTransientAuthFailure(err)) {
        // Not an auth race: surface immediately so the caller doesn't
        // burn the entire budget waiting on a real config error.
        throw err;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const wait = Math.min(backoffMs, remaining);
      await new Promise((r) => setTimeout(r, wait));
      // Exponential up to 8s ceiling; keeps the worst case to a small
      // number of probes inside the 60s budget.
      backoffMs = Math.min(backoffMs * 2, 8_000);
    }
  }
  throw new Error(
    `waitForBranchAuthReady: timed out after ${timeoutMs}ms (${attempt} attempts) ` +
      `against projects/${args.instance}/branches/${args.branch}. ` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
  );
}

/**
 * Recognize the auth-failure error shapes that justify a retry. We
 * match conservatively on substring rather than exact code because
 * Postgres surfaces this as a SQLSTATE 28000 / 28P01 family with
 * different message text across server versions.
 */
function isTransientAuthFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /external authorization failed/i.test(msg) ||
    /password authentication failed/i.test(msg) ||
    /authentication failed/i.test(msg)
  );
}
