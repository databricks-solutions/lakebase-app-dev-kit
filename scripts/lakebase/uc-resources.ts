// Unity Catalog resource management primitives.
//
// Lifted from the lakebase-scm-extension's bespoke DeployService UC
// methods. Substrate wraps the Databricks Unity Catalog REST APIs
// (`/api/2.1/unity-catalog/{catalogs,schemas,volumes,permissions}`)
// behind a clean, callable surface so consumers don't shell out to
// `databricks api get|post|patch` directly.
//
// Each primitive returns a structured result; the create primitives
// are idempotent (existence check + conditional create), and the
// permission grant matches the platform's standard CHANGES shape.

import { exec, shq } from "../util/exec.js";
import { KIT_TIMEOUTS } from "./kit-config.js";

const DEFAULT_CREATE_COMMENT = "Created by lakebase-app-dev-kit";

export interface CatalogExistsArgs {
  profile: string;
  catalog: string;
  timeoutMs?: number;
}

/**
 * Check whether a Unity Catalog catalog exists. Returns true on 200,
 * false on 404 / RESOURCE_DOES_NOT_EXIST. Throws only on
 * infrastructure failures (CLI not on PATH, timeout).
 */
export async function catalogExists(args: CatalogExistsArgs): Promise<boolean> {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  try {
    await exec(
      `databricks api get /api/2.1/unity-catalog/catalogs/${shq(args.catalog)} --profile ${shq(args.profile)}`,
      { timeout: timeoutMs }
    );
    return true;
  } catch (err) {
    if (isUcMissingError((err as Error).message)) return false;
    throw err;
  }
}

export interface TryCreateCatalogArgs {
  profile: string;
  catalog: string;
  comment?: string;
  timeoutMs?: number;
}

export interface TryCreateCatalogResult {
  /** True iff the create POST returned successfully. False when the
   *  workspace blocks programmatic catalog creation (Default Storage
   *  workspaces, missing permissions, etc.); the caller can fall back
   *  to an interactive flow. */
  created: boolean;
  /** Error message when create failed (for diagnostic surfacing). */
  error?: string;
}

/**
 * Try to create a Unity Catalog catalog. Returns `{ created: false,
 * error }` (not a throw) on any failure path so the caller can decide
 * whether to fall back to interactive creation or escalate.
 */
export async function tryCreateCatalog(args: TryCreateCatalogArgs): Promise<TryCreateCatalogResult> {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const comment = args.comment ?? DEFAULT_CREATE_COMMENT;
  const payload = JSON.stringify({ name: args.catalog, comment });
  try {
    await exec(
      `databricks api post /api/2.1/unity-catalog/catalogs --profile ${shq(args.profile)} --json ${shq(payload)}`,
      { timeout: timeoutMs }
    );
    return { created: true };
  } catch (err) {
    return { created: false, error: (err as Error).message };
  }
}

export interface EnsureSchemaAndVolumeArgs {
  profile: string;
  catalog: string;
  schema: string;
  volume: string;
  /** Comment applied to newly created schema + volume. Ignored when
   *  the resources already exist. */
  comment?: string;
  /** Volume type. Default: `MANAGED`. */
  volumeType?: "MANAGED" | "EXTERNAL";
  timeoutMs?: number;
}

export interface EnsureSchemaAndVolumeResult {
  /** True iff this call created the schema (false if it pre-existed). */
  schemaCreated: boolean;
  /** True iff this call created the volume. */
  volumeCreated: boolean;
}

/**
 * Ensure a Unity Catalog schema + volume exist under the named catalog.
 * Idempotent: existing schema/volume are left untouched. The catalog
 * itself must exist (use `catalogExists` + `tryCreateCatalog` first).
 */
export async function ensureSchemaAndVolume(
  args: EnsureSchemaAndVolumeArgs
): Promise<EnsureSchemaAndVolumeResult> {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const comment = args.comment ?? DEFAULT_CREATE_COMMENT;
  const volumeType = args.volumeType ?? "MANAGED";
  const { profile, catalog, schema, volume } = args;

  // Schema
  let schemaCreated = false;
  let exists = await ucResourceExists(`/api/2.1/unity-catalog/schemas/${catalog}.${schema}`, profile, timeoutMs);
  if (!exists) {
    const payload = JSON.stringify({ name: schema, catalog_name: catalog, comment });
    await exec(
      `databricks api post /api/2.1/unity-catalog/schemas --profile ${shq(profile)} --json ${shq(payload)}`,
      { timeout: timeoutMs }
    );
    schemaCreated = true;
  }

  // Volume
  let volumeCreated = false;
  exists = await ucResourceExists(
    `/api/2.1/unity-catalog/volumes/${catalog}.${schema}.${volume}`,
    profile,
    timeoutMs
  );
  if (!exists) {
    const payload = JSON.stringify({
      catalog_name: catalog,
      schema_name: schema,
      name: volume,
      volume_type: volumeType,
      comment,
    });
    await exec(
      `databricks api post /api/2.1/unity-catalog/volumes --profile ${shq(profile)} --json ${shq(payload)}`,
      { timeout: timeoutMs }
    );
    volumeCreated = true;
  }

  return { schemaCreated, volumeCreated };
}

export type UcCatalogPermission =
  | "USE_CATALOG"
  | "USE_SCHEMA"
  | "READ_VOLUME"
  | "WRITE_VOLUME"
  | "CREATE_SCHEMA"
  | "CREATE_TABLE"
  | "MODIFY"
  | "SELECT"
  | "ALL_PRIVILEGES";

export interface GrantUcCatalogPermissionArgs {
  profile: string;
  catalog: string;
  /** Principal (SP clientId, user email, or group name). */
  servicePrincipalName: string;
  /** Permissions to add. Default: the "deployed-app standard" set:
   *  USE_CATALOG + USE_SCHEMA + READ_VOLUME + WRITE_VOLUME. */
  permissions?: UcCatalogPermission[];
  timeoutMs?: number;
}

export interface GrantUcCatalogPermissionResult {
  granted: boolean;
}

const DEFAULT_APP_PERMS: UcCatalogPermission[] = [
  "USE_CATALOG",
  "USE_SCHEMA",
  "READ_VOLUME",
  "WRITE_VOLUME",
];

/**
 * Grant a principal permissions on a Unity Catalog catalog. Wraps
 * PATCH `/api/2.1/unity-catalog/permissions/catalog/<name>` with the
 * standard `changes: [{ principal, add: [...] }]` shape.
 */
export async function grantUcCatalogPermission(
  args: GrantUcCatalogPermissionArgs
): Promise<GrantUcCatalogPermissionResult> {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const permissions = args.permissions ?? DEFAULT_APP_PERMS;
  const payload = JSON.stringify({
    changes: [
      {
        principal: args.servicePrincipalName,
        add: permissions,
      },
    ],
  });
  await exec(
    `databricks api patch /api/2.1/unity-catalog/permissions/catalog/${shq(args.catalog)} --profile ${shq(args.profile)} --json ${shq(payload)}`,
    { timeout: timeoutMs }
  );
  return { granted: true };
}

/**
 * Build the Catalog Explorer URL for a workspace. Pure helper, no
 * network call. Useful for surfacing clickable links in agent / UI
 * output after a successful deploy.
 */
export function catalogExplorerUrl(workspaceHost: string): string {
  return `${workspaceHost.replace(/\/+$/, "")}/explore/data`;
}

// ─── helpers ────────────────────────────────────────────────────

async function ucResourceExists(apiPath: string, profile: string, timeoutMs: number): Promise<boolean> {
  try {
    await exec(`databricks api get ${apiPath} --profile ${shq(profile)}`, { timeout: timeoutMs });
    return true;
  } catch (err) {
    if (isUcMissingError((err as Error).message)) return false;
    throw err;
  }
}

function isUcMissingError(msg: string): boolean {
  return /RESOURCE_DOES_NOT_EXIST|does not exist|status:? 404\b|NOT_FOUND/i.test(msg);
}
