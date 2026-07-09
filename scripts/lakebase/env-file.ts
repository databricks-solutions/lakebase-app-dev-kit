// .env emission for a freshly-scaffolded Lakebase-paired project + per-branch
// connection updates.
//
// `writeEnvFile` mirrors ProjectCreationService.writeEnvFile – initial scaffold
// with commented placeholders. `updateEnvConnection` mirrors the algorithm in
// templates/.../post-checkout.sh: strip the four connection lines, append
// fresh ones, preserve everything else.

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Read a single key's value from a .env file (the last assignment wins, matching
 * how a shell `source .env` resolves duplicates). Trims surrounding quotes. Returns
 * undefined when the file or key is absent. Pure read; never throws.
 */
export function readEnvVar(envPath: string, key: string): string | undefined {
  if (!fs.existsSync(envPath)) return undefined;
  let value: string | undefined;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("#") || !trimmed.startsWith(`${key}=`)) continue;
    value = trimmed.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return value && value.length > 0 ? value : undefined;
}

export interface WriteEnvFileArgs {
  projectDir: string;
  databricksHost: string;
  lakebaseProjectId: string;
}

/**
 * Write a .env to {projectDir}/.env with the two fixed config keys and
 * commented connection placeholders. Overwrites any existing .env.
 *
 * @returns the absolute path of the written file.
 */
export function writeEnvFile(args: WriteEnvFileArgs): string {
  const host = args.databricksHost.replace(/\/+$/, "");
  const envContent = [
    "# Lakebase project configuration",
    "# Created by @databricks-solutions/lakebase-app-dev-kit",
    "",
    `DATABRICKS_HOST=${host}`,
    `LAKEBASE_PROJECT_ID=${args.lakebaseProjectId}`,
    "",
    "# Connection METADATA (auto-populated on branch switch). No DB token is",
    "# stored here: the app + migrations mint a short-lived Lakebase credential",
    "# at runtime from this metadata (endpoint projects/<id>/branches/<branch>/",
    "# endpoints/<endpoint>). Set DATABASE_URL explicitly to override (CI/Docker).",
    "# LAKEBASE_BRANCH_ID=",
    "# LAKEBASE_HOST=",
    "# LAKEBASE_ENDPOINT=primary",
    "# DB_USERNAME=",
    "",
  ].join("\n");
  const envPath = path.join(args.projectDir, ".env");
  fs.writeFileSync(envPath, envContent);
  return envPath;
}

export interface UpdateEnvConnectionArgs {
  /** Absolute path to the .env file. */
  envPath: string;
  /** Lakebase instance / project id (projects/<id>/...); needed so the app can
   *  rebuild the endpoint path and mint a token at runtime. */
  projectId: string;
  /** Lakebase branch id this .env now points at (sanitized name). */
  branchId: string;
  /** Lakebase user (email). */
  username: string;
  /** Lakebase endpoint host. */
  endpointHost?: string;
  /** Endpoint name under the branch (default "primary"). */
  endpoint?: string;
  /** Optional comment line prepended to the connection block. */
  comment?: string;
}

// Keys the connection block owns. We STRIP all of these (including the legacy
// DATABASE_URL/DB_PASSWORD token lines) before rewriting, so re-running on an
// old .env purges any baked-in credential , the app mints at runtime instead.
const CONNECTION_KEYS = [
  "DATABASE_URL",
  "DB_PASSWORD",
  "DB_USERNAME",
  "LAKEBASE_PROJECT_ID",
  "LAKEBASE_BRANCH_ID",
  "LAKEBASE_HOST",
  "LAKEBASE_ENDPOINT",
] as const;

/**
 * Update the connection METADATA block in an existing .env, preserving every
 * other line. No DB token is written: the app + migrations mint a short-lived
 * Lakebase credential at runtime from this metadata. Any legacy DATABASE_URL /
 * DB_PASSWORD line is stripped (not rewritten), so switching branches purges a
 * stale baked-in token.
 *
 * If the file doesn't exist it's created with just the metadata block , the
 * caller can subsequently writeEnvFile() to add the project-level keys.
 */
export function updateEnvConnection(args: UpdateEnvConnectionArgs): void {
  const existing = fs.existsSync(args.envPath)
    ? fs.readFileSync(args.envPath, "utf-8")
    : "";

  const preserved = existing
    .split("\n")
    .filter((line) => {
      const trimmed = line.trimStart();
      return !CONNECTION_KEYS.some((k) => trimmed.startsWith(`${k}=`));
    })
    .join("\n")
    .replace(/\n+$/, "");

  const lines: string[] = [];
  if (args.comment !== undefined) {
    lines.push(args.comment);
  }
  lines.push(`LAKEBASE_PROJECT_ID=${args.projectId}`);
  if (args.endpointHost !== undefined) {
    lines.push(`LAKEBASE_HOST=${args.endpointHost}`);
  }
  lines.push(`LAKEBASE_BRANCH_ID=${args.branchId}`);
  lines.push(`LAKEBASE_ENDPOINT=${args.endpoint ?? "primary"}`);
  lines.push(`DB_USERNAME=${args.username}`);
  lines.push("");
  const block = lines.join("\n");

  const content = preserved ? `${preserved}\n${block}` : block;
  // Ensure parent dir exists for the no-existing-file case
  fs.mkdirSync(path.dirname(args.envPath), { recursive: true });
  fs.writeFileSync(args.envPath, content);
}
