// Generate databricks.yml for a Lakebase-paired Databricks App deployment.
//
// databricks.yml is the bundle config read by `databricks bundle deploy`.
// It declares the app + its resources at the bundle level so the platform
// (a) provisions the app on the target workspace, and (b) auto-grants the
// service principal the declared permission on each resource. The kit's
// substrate produces the devhub-canonical shape per platform-guide.md's
// "Service Principal Permissions" section.
//
// For a Lakebase target the bundle declares one `database` resource with
// `instance_name` (the Lakebase project) + `database_name` (the postgres
// database, typically `databricks_postgres`) and permission
// `CAN_CONNECT_AND_CREATE`. NOTE the field names differ from the AppKit
// `appkit.plugins.json` shape (which uses `branch:` / `database:` resource
// paths): the bundle deployer expects the Terraform-schema names. The
// BRANCH is NOT declared at the bundle level; it is referenced at runtime
// via app.yaml's env block (LAKEBASE_BRANCH_ID hardcoded value).
//
// The bundle config does NOT carry the app.yaml's runtime env block.
// Env injections happen via app.yaml's `valueFrom: postgres` references
// (see deploy-app-yaml.ts) which look up the bundle-declared resource
// by name.

import { DeployTarget } from "./deploy-targets.js";
import { DEFAULT_DATABASE } from "./constants.js";

export interface GenerateBundleYamlOptions {
  /** Pre-existing databricks.yml contents. Reserved for future
   *  parse-and-merge behavior (slice 3 may extend bundles produced by
   *  other tooling). Today the substrate generates a fresh file. */
  existing?: string;
  /** Bundle-level name. Defaults to the app_name. The bundle name shows
   *  up in `databricks bundle deploy` output + identifies the bundle in
   *  the workspace. */
  bundleName?: string;
  /** Target name in databricks.yml's `targets:` map. Default `"default"`
   *  matches the `bundle deploy` convention. */
  bundleTargetName?: string;
}

/**
 * Generate databricks.yml for a Lakebase deployment target.
 *
 * Output shape (Lakebase-only target):
 * ```yaml
 * bundle:
 *   name: <bundle_name>
 *
 * resources:
 *   apps:
 *     app:
 *       name: <app_name>
 *       source_code_path: ./
 *       resources:
 *         - name: postgres
 *           database:
 *             instance_name: <lakebase_project>
 *             database_name: databricks_postgres
 *             permission: CAN_CONNECT_AND_CREATE
 *
 * targets:
 *   default:
 *     default: true
 * ```
 *
 * `instance_name` is the Lakebase project (Lakebase API terminology:
 * "instance" = "project"). `database_name` defaults to
 * `DEFAULT_DATABASE` ("databricks_postgres"); Lakebase provisions one
 * database with that name per branch. The bundle's `targets:` block
 * stays minimal; per-environment overrides land in later slices.
 */
export function generateBundleYaml(
  target: DeployTarget,
  appName: string,
  options: GenerateBundleYamlOptions = {}
): string {
  const bundleName = options.bundleName ?? appName;
  const targetName = options.bundleTargetName ?? "default";

  const lines: string[] = [];
  lines.push("bundle:");
  lines.push(`  name: ${quoteIfNeeded(bundleName)}`);
  lines.push("");
  lines.push("resources:");
  lines.push("  apps:");
  lines.push("    app:");
  lines.push(`      name: ${quoteIfNeeded(appName)}`);
  lines.push(`      source_code_path: ./`);
  lines.push(`      resources:`);
  lines.push(`        - name: postgres`);
  lines.push(`          database:`);
  lines.push(`            instance_name: ${quoteIfNeeded(target.lakebase_project)}`);
  lines.push(`            database_name: ${quoteIfNeeded(DEFAULT_DATABASE)}`);
  lines.push(`            permission: CAN_CONNECT_AND_CREATE`);
  lines.push("");
  lines.push("targets:");
  lines.push(`  ${targetName}:`);
  lines.push(`    default: true`);
  return lines.join("\n") + "\n";
}

function quoteIfNeeded(s: string): string {
  if (/[\s:#\[\]{},&*!|>'"%@`]/.test(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}
