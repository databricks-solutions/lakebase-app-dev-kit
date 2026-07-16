// FEIP-8038: a design subagent that resolves a MALFORMED absolute project root
// writes its artifacts to a sibling directory whose name is the parent workspace
// dir and the project dir joined with a HYPHEN instead of a slash , e.g.
// ~/code/app-dev-kit-demo/stockflow-interactive becomes
// ~/code/app-dev-kit-demo-stockflow-interactive. The out-of-root guard then finds
// nothing under the real root and bails, and the "re-run" recovery loops forever.
//
// This deterministic backstop relocates the stray artifact tree from that ONE
// known malformed sibling back into the real project root, so the run self-heals.
// It is bounded to that exact sibling pattern (no filesystem scan) and touches
// only the artifact roots (.sftdd / .tdd), never anything else in the sibling.

import { existsSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";

/** The one malformed sibling a mis-resolving subagent writes to:
 *  `${dirname(projectDir)}-${basename(projectDir)}` (parent + project, hyphen-joined). */
export function malformedSiblingRoot(projectDir: string): string {
  const p = projectDir.replace(/\/+$/, "");
  return `${dirname(p)}-${basename(p)}`;
}

/** Recursively list file paths under `dir`, relative to `dir`. */
function listFilesRel(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string, rel: string): void => {
    for (const entry of readdirSync(abs)) {
      const childAbs = join(abs, entry);
      const childRel = rel ? join(rel, entry) : entry;
      if (statSync(childAbs).isDirectory()) walk(childAbs, childRel);
      else out.push(childRel);
    }
  };
  walk(dir, "");
  return out;
}

export interface StrayRelocation {
  relocated: boolean;
  /** The malformed sibling the stray tree was found at (present only when relocated). */
  from?: string;
  /** Repo-relative artifact paths moved into the real root. */
  moved: string[];
}

/**
 * If a stray `.sftdd` / `.tdd` artifact tree exists at the malformed sibling of
 * `projectDir`, merge it into the real project root (the stray files are the
 * agent's actual output; they win over any partial in the real root) and remove
 * the stray tree. Returns what moved. A no-op (relocated:false) when the sibling
 * or its artifact tree is absent. Only the artifact roots move , the rest of the
 * sibling is left untouched, and an empty sibling is cleaned up.
 */
export function relocateStrayDesignArtifacts(projectDir: string): StrayRelocation {
  const sibling = malformedSiblingRoot(projectDir);
  if (!existsSync(sibling)) return { relocated: false, moved: [] };

  const moved: string[] = [];
  for (const artRoot of [".sftdd", ".tdd"]) {
    const strayRoot = join(sibling, artRoot);
    if (!existsSync(strayRoot)) continue;
    for (const rel of listFilesRel(strayRoot)) moved.push(join(artRoot, rel));
    const realRoot = join(projectDir, artRoot);
    mkdirSync(realRoot, { recursive: true });
    // Merge stray -> real, overwriting: the stray files are the agent's real
    // output (the real root is missing them, which is why the guard fired).
    cpSync(strayRoot, realRoot, { recursive: true, force: true });
    rmSync(strayRoot, { recursive: true, force: true });
  }

  // Remove the malformed sibling if it is now empty (it should never have been a
  // real project; leave it alone if it still holds other files).
  try {
    if (readdirSync(sibling).length === 0) rmSync(sibling, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }

  return moved.length > 0 ? { relocated: true, from: sibling, moved } : { relocated: false, moved: [] };
}
