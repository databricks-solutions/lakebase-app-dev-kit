// Generate databricks.yml for a Lakebase-paired Databricks App deployment.
//
// databricks.yml is the bundle config read by `databricks bundle deploy`.
// It declares the app + its resources at the bundle level so the platform
// (a) provisions the app on the target workspace, and (b) auto-grants the
// service principal the declared permission on each resource. The kit's
// substrate produces the devhub-canonical shape per platform-guide.md's
// "Service Principal Permissions" section.
//
// For a Lakebase target the bundle declares one `database` resource of
// type `postgres` with permission `CAN_CONNECT_AND_CREATE`. Additional
// resources (UC volumes, serving endpoints, etc.) are added in later
// slices as the kit's target shape grows.
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
 *             branch: projects/<lakebase_project>/branches/<lakebase_branch>
 *             permission: CAN_CONNECT_AND_CREATE
 *
 * targets:
 *   default:
 *     default: true
 * ```
 *
 * The `branch` field uses the canonical Lakebase resource path
 * (`projects/<project>/branches/<branch>`) so the platform can resolve
 * it without further parsing. The bundle's `targets:` block stays
 * minimal; per-environment overrides land in later slices.
 */
export function generateBundleYaml(
  target: DeployTarget,
  appName: string,
  options: GenerateBundleYamlOptions = {}
): string {
  const bundleName = options.bundleName ?? appName;
  const targetName = options.bundleTargetName ?? "default";
  const branchPath = `projects/${target.lakebase_project}/branches/${target.lakebase_branch}`;
  const databasePath = `${branchPath}/databases/${DEFAULT_DATABASE}`;

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
  lines.push(`            branch: ${branchPath}`);
  lines.push(`            database: ${databasePath}`);
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
