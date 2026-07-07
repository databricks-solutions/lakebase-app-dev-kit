// Secret-based authentication setup for Databricks Apps that connect
// to Lakebase from workspaces where service principal auth doesn't
// work directly (e.g. non-FEVM workspaces).
//
// The pattern: create a secret scope, mint a long-lived PAT on behalf
// of the deploying user, store the PAT in the scope, and grant the
// app's service principal READ access. The app's code then reads the
// PAT from the secret at runtime and uses it as the Lakebase password.
//
// Lifted from the lakebase-scm-extension's bespoke
// DeployService.ensureLakebaseSecretAuth.

import { runDatabricks } from "./databricks-cli.js";
import { KIT_TIMEOUTS } from "./kit-config.js";

const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

export interface EnsureLakebaseSecretAuthArgs {
  /** Databricks CLI profile (the deploying user's identity). */
  profile: string;
  /** Secret scope name to create / use. Idempotent: existing scopes
   *  are kept. */
  scopeName: string;
  /** Secret key name within the scope. The minted PAT is stored here. */
  keyName: string;
  /** Service principal client id to grant READ on the scope. When
   *  undefined, the scope + secret are created but no ACL is set. */
  servicePrincipalClientId?: string;
  /** Description placed on the minted PAT. Useful for token-list audits. */
  tokenComment?: string;
  /** PAT lifetime in seconds. Default: 90 days. */
  tokenLifetimeSeconds?: number;
  timeoutMs?: number;
}

export interface EnsureLakebaseSecretAuthResult {
  /** Scope name (passed through). */
  scope: string;
  /** Key name (passed through). */
  key: string;
  /** True iff this call created the scope (false if it pre-existed). */
  scopeCreated: boolean;
  /** True iff a new PAT was minted + stored. */
  patStored: boolean;
  /** True iff the SP ACL was granted (false when servicePrincipalClientId
   *  was undefined or the grant failed). */
  aclGranted: boolean;
}

/**
 * Ensure a secret scope + key are configured for Lakebase auth.
 *
 * Order:
 *   1. Create secret scope (idempotent: tolerates SCOPE_ALREADY_EXISTS)
 *   2. Mint a long-lived PAT
 *   3. Store the PAT in `<scope>/<key>`
 *   4. Grant the SP READ on the scope (only when servicePrincipalClientId provided)
 *
 * Each call mints a NEW PAT regardless of whether the secret already
 * holds one; the platform's secret put is destructive (overwrite). For
 * the lakebase-scm-extension's deploy flow, this matches the desired
 * behavior (fresh PAT per deploy, tokens rotate at the configured
 * lifetime).
 *
 * Promise rejects on infrastructure failures (CLI not on PATH, timeout,
 * token mint refusal). The ACL grant is best-effort: failure is
 * reflected in `aclGranted: false` rather than throwing, so callers can
 * surface the warning without failing the deploy.
 */
export async function ensureLakebaseSecretAuth(
  args: EnsureLakebaseSecretAuthArgs
): Promise<EnsureLakebaseSecretAuthResult> {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const tokenLifetimeSeconds = args.tokenLifetimeSeconds ?? NINETY_DAYS_SECONDS;
  const tokenComment = args.tokenComment ?? `Lakebase auth (scope=${args.scopeName})`;
  const { profile, scopeName, keyName, servicePrincipalClientId } = args;

  // 1. Scope
  let scopeCreated = false;
  try {
    await runDatabricks(["secrets", "create-scope", scopeName], { profile, timeout: timeoutMs });
    scopeCreated = true;
  } catch (err) {
    const msg = (err as Error).message;
    if (!isAlreadyExistsError(msg)) throw err;
  }

  // 2. Mint PAT
  const tokenJson = await runDatabricks(
    ["tokens", "create", "--comment", tokenComment, "--lifetime-seconds", String(tokenLifetimeSeconds), "-o", "json"],
    { profile, timeout: timeoutMs },
  );
  const tokenStart = tokenJson.indexOf("{");
  if (tokenStart < 0) {
    throw new Error(`databricks tokens create returned no JSON: ${tokenJson.slice(0, 200)}`);
  }
  const parsed = JSON.parse(tokenJson.slice(tokenStart)) as Record<string, unknown>;
  const pat = parsed.token_value;
  if (typeof pat !== "string" || !pat) {
    throw new Error("databricks tokens create returned no token_value");
  }

  // 3. Store the PAT
  await runDatabricks(["secrets", "put-secret", scopeName, keyName, "--string-value", pat], {
    profile,
    timeout: timeoutMs,
  });

  // 4. ACL (best-effort)
  let aclGranted = false;
  if (servicePrincipalClientId) {
    try {
      await runDatabricks(["secrets", "put-acl", scopeName, servicePrincipalClientId, "READ"], {
        profile,
        timeout: timeoutMs,
      });
      aclGranted = true;
    } catch {
      // Best-effort; surface via result rather than throwing.
    }
  }

  return {
    scope: scopeName,
    key: keyName,
    scopeCreated,
    patStored: true,
    aclGranted,
  };
}

function isAlreadyExistsError(msg: string): boolean {
  return /already exists|SCOPE_ALREADY_EXISTS|RESOURCE_ALREADY_EXISTS/i.test(msg);
}
