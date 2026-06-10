// In-place refresh for a scaffolded project's `.claude/commands/`
// against the kit's current templates. Sibling to `updateWorkflows`;
// consumes the same drift vocabulary `detectCommandDrift` reports.
//
// The "fixer" half of the update story. `detectCommandDrift`
// surfaces the gap; `updateCommands` closes it by writing the current
// kit templates with `${KIT_VERSION_AT_SCAFFOLD}` substituted to the
// running kit version. Hook files (`<name>.{pre,post}-hook.md`) are
// NEVER touched; they are project-owned by design.

import * as fs from "node:fs";
import * as path from "node:path";

export type CommandUpdateOutcome = "added" | "updated" | "unchanged" | "preserved";

export interface CommandFileUpdate {
  /** File name (e.g. "design.md"). */
  name: string;
  outcome: CommandUpdateOutcome;
}

export interface UpdateCommandsArgs {
  /** Project directory containing `.claude/commands/`. */
  projectDir: string;
  /**
   * Kit directory containing
   * `templates/project/common/.claude/commands/`. Default: walk up
   * from this module looking for the templates marker.
   */
  kitDir?: string;
  /**
   * When true, report what WOULD change but don't write to disk.
   * Default: false. Pairs with the CLI's `--dry-run` flag.
   */
  dryRun?: boolean;
  /**
   * When false, the writer refuses to overwrite a project command
   * file whose body has drifted (i.e. status === "drifted"). The
   * file is reported with outcome "preserved" and left untouched.
   * Default: true. Pairs with the CLI's `--force` flag and the
   * interactive-per-file confirm flow above this primitive.
   */
  force?: boolean;
}

export interface UpdateCommandsResult {
  files: CommandFileUpdate[];
  /** True iff anything actually changed on disk (or would, in dryRun). */
  changed: boolean;
}

const COMMAND_HOOK_FILE_PATTERN = /\.(pre|post)-hook\.md$/;

function findKitCommandsDir(start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(
      dir,
      "templates",
      "project",
      "common",
      ".claude",
      "commands"
    );
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project/common/.claude/commands/ relative to ${start}. ` +
      `Pass explicit kitDir.`
  );
}

function readKitVersion(kitCommandsDir: string): string {
  let dir = kitCommandsDir;
  for (let i = 0; i < 5; i++) {
    dir = path.dirname(dir);
  }
  try {
    const raw = fs.readFileSync(path.join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

function applyCommandPlaceholders(content: string, version: string): string {
  return content.replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
}

/**
 * Refresh a scaffolded project's `.claude/commands/{design,build}.md`
 * in place from the kit's current templates.
 *
 * Defaults:
 *   - WRITES the kit's template content with the current kit version
 *     substituted into the `${KIT_VERSION_AT_SCAFFOLD}` placeholder.
 *   - With `force: true` (default), drifted files are overwritten.
 *     With `force: false`, drifted files are left alone and reported
 *     with outcome `preserved` so the CLI's interactive-per-file
 *     confirm flow can decide one at a time.
 *   - LEAVES hook files (`<name>.{pre,post}-hook.md`) completely
 *     untouched. They never appear in the result list either; the
 *     contract is "this primitive only touches kit-owned templates."
 *   - CREATES `.claude/commands/` if missing.
 *
 * Set `dryRun: true` to surface the same per-file outcomes without
 * touching disk.
 */
export function updateCommands(args: UpdateCommandsArgs): UpdateCommandsResult {
  const projectCommandsDir = path.join(args.projectDir, ".claude", "commands");
  const here = path.dirname(new URL(import.meta.url).pathname);
  const kitCommandsDir = args.kitDir
    ? path.join(args.kitDir, "templates", "project", "common", ".claude", "commands")
    : findKitCommandsDir(here);

  const dryRun = args.dryRun === true;
  const force = args.force !== false;

  const templateFiles = fs.existsSync(kitCommandsDir)
    ? fs
        .readdirSync(kitCommandsDir)
        .filter((f) => f.endsWith(".md") && !COMMAND_HOOK_FILE_PATTERN.test(f))
    : [];

  if (!dryRun && templateFiles.length > 0 && !fs.existsSync(projectCommandsDir)) {
    fs.mkdirSync(projectCommandsDir, { recursive: true });
  }

  const version = readKitVersion(kitCommandsDir);
  const files: CommandFileUpdate[] = [];

  for (const name of templateFiles) {
    const projectPath = path.join(projectCommandsDir, name);
    const templatePath = path.join(kitCommandsDir, name);
    const templateRaw = fs.readFileSync(templatePath, "utf-8");
    const desired = applyCommandPlaceholders(templateRaw, version);
    const existed = fs.existsSync(projectPath);
    const current = existed ? fs.readFileSync(projectPath, "utf-8") : "";

    let outcome: CommandUpdateOutcome;
    if (!existed) {
      outcome = "added";
    } else if (current === desired) {
      outcome = "unchanged";
    } else if (!force) {
      outcome = "preserved";
    } else {
      outcome = "updated";
    }

    if (!dryRun && (outcome === "added" || outcome === "updated")) {
      fs.writeFileSync(projectPath, desired);
    }
    files.push({ name, outcome });
  }

  const order: Record<CommandUpdateOutcome, number> = {
    added: 0,
    updated: 1,
    preserved: 2,
    unchanged: 3,
  };
  files.sort((a, b) => order[a.outcome] - order[b.outcome] || a.name.localeCompare(b.name));

  const changed = files.some((f) => f.outcome === "added" || f.outcome === "updated");
  return { files, changed };
}
