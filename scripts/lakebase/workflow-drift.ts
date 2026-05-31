// Drift detector: scaffolded project's .github/workflows/*.yml vs the
// kit's current templates (FEIP-7140).
//
// Scaffolded projects ship copies of pr.yml, merge.yml, cleanup-orphans.yml
// at scaffold time. The kit's templates evolve (new lint steps, schema-
// diff gates, bug fixes) but existing projects never auto-pick those
// changes up. This primitive surfaces the drift so a maintainer can
// decide whether to refresh (via FEIP-7139 updateWorkflows when that
// lands) or pin intentionally.
//
// The "kit version pinned by the project" surfaces via npm's installed
// view: if the project depends on @databricks-solutions/lakebase-app-dev-kit,
// the templates at node_modules/.../templates/project/common/.github/workflows/
// are the canonical reference for the pinned version. The drift detector
// doesn't fetch from npm or github; it diffs against whatever is currently
// on disk in the kit (resolved either via the bundled templates path or an
// explicit kitDir override).

import * as fs from "node:fs";
import * as path from "node:path";

export type WorkflowStatus = "unchanged" | "drifted" | "missing" | "extra";

export interface WorkflowFileStatus {
  /** File name (e.g. "pr.yml"). */
  name: string;
  status: WorkflowStatus;
  /**
   * Unified diff when status is "drifted". Empty string otherwise.
   * Diff is project-vs-template (project's lines marked -, template's +).
   */
  diff?: string;
}

export interface WorkflowDriftReport {
  /** Aggregate: ok if every file is unchanged, otherwise drift. */
  overall: "ok" | "drift";
  /** Per-file status entries. Includes missing + extra files for completeness. */
  files: WorkflowFileStatus[];
}

export interface DetectWorkflowDriftArgs {
  /** Project directory containing .github/workflows/. */
  projectDir: string;
  /**
   * Kit directory containing templates/project/common/.github/workflows/.
   * Default: walks up from this module looking for the templates marker
   * (same logic as scaffold.findTemplatesDir).
   */
  kitDir?: string;
}

function findKitTemplatesDir(start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(
      dir,
      "templates",
      "project",
      "common",
      ".github",
      "workflows"
    );
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project/common/.github/workflows/ relative to ${start}. ` +
      `Pass explicit kitDir.`
  );
}

function unifiedDiff(name: string, projectContent: string, templateContent: string): string {
  if (projectContent === templateContent) return "";
  const a = projectContent.split("\n");
  const b = templateContent.split("\n");
  // Minimal line-by-line diff suitable for human review. For full unified
  // diff use `diff -u` externally; this primitive favors no native deps.
  const out: string[] = [`--- project/${name}`, `+++ template/${name}`];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === bv) continue;
    if (av !== undefined) out.push(`-${i + 1}: ${av}`);
    if (bv !== undefined) out.push(`+${i + 1}: ${bv}`);
  }
  return out.join("\n");
}

/**
 * Compare a project's .github/workflows/*.yml against the kit's
 * templates. Returns a per-file report flagging missing, extra, and
 * drifted files.
 *
 * Use cases:
 *   - lakebase-doctor surfaces drift as a WARN check
 *   - CI: nightly job that PRs an updateWorkflows when drift detected
 *   - One-off: maintainer runs lakebase-doctor --json before a release
 *
 * Returns overall: "ok" iff every workflow file is unchanged AND no
 * missing files exist. Extra files (project has a workflow the kit
 * doesn't template) are reported as "extra" status but DON'T count
 * against "ok" - projects legitimately add their own workflows.
 */
export function detectWorkflowDrift(
  args: DetectWorkflowDriftArgs
): WorkflowDriftReport {
  const projectWorkflowsDir = path.join(
    args.projectDir,
    ".github",
    "workflows"
  );
  const here = path.dirname(new URL(import.meta.url).pathname);
  const kitWorkflowsDir = args.kitDir
    ? path.join(
        args.kitDir,
        "templates",
        "project",
        "common",
        ".github",
        "workflows"
      )
    : findKitTemplatesDir(here);

  const templateFiles = fs.existsSync(kitWorkflowsDir)
    ? fs.readdirSync(kitWorkflowsDir).filter((f) => f.endsWith(".yml"))
    : [];
  const projectFiles = fs.existsSync(projectWorkflowsDir)
    ? fs.readdirSync(projectWorkflowsDir).filter((f) => f.endsWith(".yml"))
    : [];

  const seen = new Set<string>();
  const files: WorkflowFileStatus[] = [];

  for (const name of templateFiles) {
    seen.add(name);
    const projectPath = path.join(projectWorkflowsDir, name);
    const templatePath = path.join(kitWorkflowsDir, name);
    if (!fs.existsSync(projectPath)) {
      files.push({ name, status: "missing" });
      continue;
    }
    const projectContent = fs.readFileSync(projectPath, "utf8");
    const templateContent = fs.readFileSync(templatePath, "utf8");
    if (projectContent === templateContent) {
      files.push({ name, status: "unchanged" });
    } else {
      files.push({
        name,
        status: "drifted",
        diff: unifiedDiff(name, projectContent, templateContent),
      });
    }
  }

  for (const name of projectFiles) {
    if (seen.has(name)) continue;
    files.push({ name, status: "extra" });
  }

  // Sort for stable output: drifted first, then missing, then extra, then unchanged.
  const order: Record<WorkflowStatus, number> = {
    drifted: 0,
    missing: 1,
    extra: 2,
    unchanged: 3,
  };
  files.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));

  const hasDrift = files.some((f) => f.status === "drifted" || f.status === "missing");
  return {
    overall: hasDrift ? "drift" : "ok",
    files,
  };
}
