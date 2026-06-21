// Brownfield TDD adoption: drop the `.tdd/` scaffold into an existing
// repo so the lakebase-sftdd-workflows skill has a place to write.
//
// Greenfield path: `lakebase-create-project` calls `layDownTddScaffold`
// as one step in its 11-step pipeline. The brownfield equivalent needs
// just that one step plus a clean idempotency model so a team can adopt
// TDD on a repo that already exists without `create-project`'s GitHub /
// Lakebase / language-scaffold side effects.
//
// This module owns the orchestrator + helpers; the CLI wrapper lives at
// `adopt-sftdd.cli.ts`. The pre/post-flight knobs (--update / --force /
// --dry-run) all funnel through this function so the BDD harness can
// drive every behavior without spawning a process.

import * as fs from "node:fs";
import { ARTIFACT_ROOT } from "../sftdd/sftdd-paths.js";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface AdoptTddArgs {
  /** Project root that will receive `.tdd/`. Must be a git repo. */
  projectDir: string;
  /**
   * Re-run on a project that already has `.tdd/`. Without it the call
   * refuses (the default-fail surfaces a clear hint instead of silently
   * doing nothing). With it, missing template files are added and the
   * report distinguishes in-sync vs drifted entries; existing files are
   * preserved unless `force` is also true.
   */
  update?: boolean;
  /**
   * Overwrite drifted template files with the canonical kit version.
   * Implies `update`. Project-authored files outside the template tree
   * are never touched.
   */
  force?: boolean;
  /**
   * Report what would change without writing anything. Useful for CI
   * checks and for the human-facing "what does this command do" probe.
   */
  dryRun?: boolean;
  /**
   * Override the kit's `templates/sftdd-bootstrap/.tdd` source. The BDD
   * harness uses this to drive against a fixture; production callers
   * always let the substrate auto-locate.
   */
  bootstrapDir?: string;
}

export interface AdoptTddResult {
  /** Files written this run (or, in dry-run, files that would be written). */
  added: string[];
  /** Files already present with content matching the canonical template. */
  inSync: string[];
  /** Files already present whose content differs from the canonical template. */
  drifted: string[];
  /** Files written this run because `force` overrode their drift. */
  updated: string[];
  /** True iff no files were modified (the call is a clean no-op). */
  noChanges: boolean;
}

/**
 * Drop the `templates/sftdd-bootstrap/.tdd` tree into `projectDir/.tdd`.
 *
 * Default mode: refuses if `.tdd/` already exists. The caller is told
 * to re-run with `update: true` if they want a brownfield refresh.
 *
 * `update` mode walks the template tree and writes any missing file;
 * existing files are inspected and bucketed into `inSync` vs `drifted`.
 *
 * `force` mode (implies `update`) additionally rewrites drifted files
 * with the canonical template content. The `.gitkeep` placeholders
 * never count as drift since they are intentionally empty.
 *
 * `dryRun` mode returns the same report but writes nothing.
 */
export function adoptTdd(args: AdoptTddArgs): AdoptTddResult {
  if (!fs.existsSync(args.projectDir)) {
    throw new Error(`Project directory does not exist: ${args.projectDir}`);
  }
  if (!fs.existsSync(path.join(args.projectDir, ".git"))) {
    throw new Error(
      `Not a git repo root: ${args.projectDir}. Run \`git init\` first, or pass a path that already has \`.git/\`.`
    );
  }
  const dest = path.join(args.projectDir, ARTIFACT_ROOT);
  const update = args.update === true || args.force === true;
  if (fs.existsSync(dest) && !update) {
    throw new Error(
      `${ARTIFACT_ROOT}/ already exists at ${dest}. Re-run with --update to refresh missing files (drift is reported, not overwritten) or --update --force to overwrite drifted ones.`
    );
  }

  const src = args.bootstrapDir ?? findBootstrapDir();
  const entries = walkTemplateTree(src);
  const added: string[] = [];
  const inSync: string[] = [];
  const drifted: string[] = [];
  const updated: string[] = [];

  for (const rel of entries) {
    const fromPath = path.join(src, rel);
    const toPath = path.join(dest, rel);
    if (!fs.existsSync(toPath)) {
      if (!args.dryRun) {
        fs.mkdirSync(path.dirname(toPath), { recursive: true });
        fs.copyFileSync(fromPath, toPath);
      }
      added.push(rel);
      continue;
    }
    const before = fs.readFileSync(fromPath);
    const after = fs.readFileSync(toPath);
    if (before.equals(after)) {
      inSync.push(rel);
      continue;
    }
    if (args.force) {
      if (!args.dryRun) {
        fs.copyFileSync(fromPath, toPath);
      }
      updated.push(rel);
    } else {
      drifted.push(rel);
    }
  }

  return {
    added,
    inSync,
    drifted,
    updated,
    noChanges: added.length === 0 && updated.length === 0,
  };
}

/**
 * Walk the bootstrap tree and return paths relative to its root,
 * sorted for deterministic output. `.gitkeep` files are kept because
 * they preserve empty subdirectory structure in git.
 */
function walkTemplateTree(root: string): string[] {
  if (!fs.existsSync(root)) {
    throw new Error(`sftdd-bootstrap template tree missing: ${root}`);
  }
  const out: string[] = [];
  const stack: string[] = [""];
  while (stack.length) {
    const rel = stack.pop()!;
    const abs = path.join(root, rel);
    for (const entry of fs.readdirSync(abs)) {
      const childRel = rel ? path.join(rel, entry) : entry;
      const childAbs = path.join(abs, entry);
      const stat = fs.statSync(childAbs);
      if (stat.isDirectory()) {
        stack.push(childRel);
      } else {
        out.push(childRel);
      }
    }
  }
  return out.sort();
}

let cachedBootstrapDir: string | undefined;
function findBootstrapDir(): string {
  if (cachedBootstrapDir) return cachedBootstrapDir;
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "templates", "sftdd-bootstrap", ARTIFACT_ROOT);
    if (fs.existsSync(candidate)) {
      cachedBootstrapDir = candidate;
      return cachedBootstrapDir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/sftdd-bootstrap/.tdd relative to ${here}. ` +
      `Pass explicit { bootstrapDir } to override.`
  );
}
