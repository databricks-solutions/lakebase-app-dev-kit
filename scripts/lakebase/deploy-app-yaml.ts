// Generate app.yaml for a Lakebase-paired Databricks App deployment.
//
// app.yaml is the runtime manifest read by the Databricks Apps platform
// when the container starts. The substrate produces the devhub-canonical
// shape (per platform-guide.md): a `command:` block plus an `env:` block
// where Lakebase platform-injected vars reference the declared `postgres`
// resource via `valueFrom: postgres`. The resource ITSELF (with branch /
// database / permission) lives in databricks.yml (see deploy-bundle-yaml.ts).
//
// The kit's `lakebase_project` + `lakebase_branch` pair maps to the
// canonical `lakebase.postgres` resource per `databricks apps manifest
// --version latest`. The auto-injected env vars (PGHOST, PGDATABASE,
// PGUSER, PGPORT, PGSSLMODE, LAKEBASE_ENDPOINT) reference that resource;
// the kit also emits two kit-internal hardcoded env vars (LAKEBASE_PROJECT_ID
// / LAKEBASE_BRANCH_ID) so app code can reference the bare identifiers
// without re-parsing the full resource paths.
//
// Why generate (not edit in place): the file is small + has a fixed
// shape. Regenerating is simpler than diffing; the command block is the
// only piece a contributor would customize, so we preserve it from any
// existing file.

import { DeployTarget } from "./deploy-targets.js";

export interface GenerateAppYamlOptions {
  /** Pre-existing app.yaml contents. When supplied, the `command:` block
   *  is parsed out and preserved; the env block is regenerated from the
   *  target. */
  existing?: string;
  /** Override the default command list. Used when there is no existing
   *  file and the caller wants a non-default entrypoint. Default:
   *  `["npm", "run", "start"]`. */
  defaultCommand?: string[];
}

const DEFAULT_COMMAND = ["npm", "run", "start"];

const POSTGRES_VALUE_FROM_ENVS = [
  "PGHOST",
  "PGDATABASE",
  "PGUSER",
  "PGPORT",
  "PGSSLMODE",
  "LAKEBASE_ENDPOINT",
] as const;

interface EnvEntry {
  name: string;
  valueFrom?: string;
  value?: string;
}

/**
 * Generate or rewrite app.yaml for a Lakebase deployment target.
 *
 * Output shape (Lakebase-only target):
 * ```yaml
 * command:
 *   - npm
 *   - run
 *   - start
 *
 * env:
 *   - name: PGHOST
 *     valueFrom: postgres
 *   - name: PGDATABASE
 *     valueFrom: postgres
 *   - name: PGUSER
 *     valueFrom: postgres
 *   - name: PGPORT
 *     valueFrom: postgres
 *   - name: PGSSLMODE
 *     valueFrom: postgres
 *   - name: LAKEBASE_ENDPOINT
 *     valueFrom: postgres
 *   - name: LAKEBASE_PROJECT_ID
 *     value: "<project>"
 *   - name: LAKEBASE_BRANCH_ID
 *     value: "<branch>"
 * ```
 *
 * Optional UC / secret env vars are appended when the target declares
 * them. Optional vars are NEVER emitted when unset (the platform refuses
 * empty values).
 */
export function generateAppYaml(
  target: DeployTarget,
  options: GenerateAppYamlOptions = {}
): string {
  const command = parseCommand(options.existing) ?? options.defaultCommand ?? DEFAULT_COMMAND;
  const env = buildEnvEntries(target);
  return formatAppYaml(command, env);
}

function buildEnvEntries(target: DeployTarget): EnvEntry[] {
  const entries: EnvEntry[] = [];

  for (const name of POSTGRES_VALUE_FROM_ENVS) {
    entries.push({ name, valueFrom: "postgres" });
  }

  entries.push({ name: "LAKEBASE_PROJECT_ID", value: target.lakebase_project });
  entries.push({ name: "LAKEBASE_BRANCH_ID", value: target.lakebase_branch });

  if (target.uc_catalog) entries.push({ name: "UC_CATALOG", value: target.uc_catalog });
  if (target.uc_schema) entries.push({ name: "UC_SCHEMA", value: target.uc_schema });
  if (target.uc_volume) entries.push({ name: "UC_VOLUME", value: target.uc_volume });
  if (target.lakebase_secret_scope) {
    entries.push({ name: "LAKEBASE_SECRET_SCOPE", value: target.lakebase_secret_scope });
  }
  if (target.lakebase_secret_key) {
    entries.push({ name: "LAKEBASE_SECRET_KEY", value: target.lakebase_secret_key });
  }
  if (target.ai_model) entries.push({ name: "AI_MODEL", value: target.ai_model });

  return entries;
}

function parseCommand(existing?: string): string[] | undefined {
  if (!existing) return undefined;
  const blockMatch = existing.match(/^command:\s*\n((?:[ \t]+-[ \t]+.+\n?)+)/m);
  if (blockMatch) {
    const parts = blockMatch[1]
      .split("\n")
      .map((line) => line.match(/^[ \t]+-[ \t]+(.+?)[ \t]*$/)?.[1])
      .filter((s): s is string => typeof s === "string")
      .map(unquote);
    if (parts.length > 0) return parts;
  }
  const flowMatch = existing.match(/^command:[ \t]*\[([^\]]+)\][ \t]*$/m);
  if (flowMatch) {
    return flowMatch[1].split(",").map((s) => unquote(s.trim()));
  }
  return undefined;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function formatAppYaml(command: string[], env: EnvEntry[]): string {
  const lines: string[] = [];
  lines.push("command:");
  for (const part of command) {
    lines.push(`  - ${quoteIfNeeded(part)}`);
  }
  lines.push("");
  lines.push("env:");
  for (const e of env) {
    lines.push(`  - name: ${e.name}`);
    if (e.valueFrom !== undefined) {
      lines.push(`    valueFrom: ${e.valueFrom}`);
    } else if (e.value !== undefined) {
      lines.push(`    value: "${escapeDoubleQuoted(e.value)}"`);
    }
  }
  return lines.join("\n") + "\n";
}

function quoteIfNeeded(s: string): string {
  if (/[\s:#\[\]{},&*!|>'"%@`]/.test(s)) {
    return `"${escapeDoubleQuoted(s)}"`;
  }
  return s;
}

function escapeDoubleQuoted(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
