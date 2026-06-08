// GUARD: the TDD orchestration layer + the MCP tool surface may touch branches
// ONLY through the PAIRED substrate (createPairedBranch / deletePairedBranch /
// checkoutPaired / mergePaired in scripts/lakebase/paired-branch.ts, or the
// per-tier *Paired wrappers / the SCM workflow helpers that build on them).
//
// They must NOT reach for:
//   - the low-level Lakebase-only creators/deleters (branch-create.createBranch,
//     branch-delete.deleteBranch) , those make a Lakebase branch with no git
//     pair (the FEIP-7422 bug: a Lakebase branch was cut with no git branch);
//   - the DELETED unpaired convention creators (createFeatureBranch /
//     createTestBranch / createUatBranch / createPerfBranch);
//   - raw git helpers (scripts/git/*) , git is a substrate concern, the paired
//     primitives own checkout/merge so .env follows the branch.
//
// Every branch a TDD agent cuts gets a Lakebase branch AND a git branch AND an
// .env sync, because the only path it can call does all three. This test fails
// loudly if anyone re-introduces an unpaired path.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

/** Recursively collect .ts source files (excluding *.test.ts) under a dir. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...sourceFiles(p));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

// Forbidden import specifiers (the unpaired branch-lifecycle + raw git modules).
// Matches with or without a `.js` extension and at any relative depth.
const FORBIDDEN_IMPORT = /from\s+["'][^"']*\/(?:lakebase\/branch-create|lakebase\/branch-delete|git\/[a-z-]+)(?:\.js)?["']/;
// Forbidden symbols (the deleted unpaired convention creators), even if someone
// re-adds and re-exports them elsewhere.
const FORBIDDEN_SYMBOL = /\b(createFeatureBranch|createTestBranch|createUatBranch|createPerfBranch)\b/;

// The TDD orchestration layer. The user's rule: "the TDD kit relies on the SCM
// kit, period" , so nothing under scripts/tdd may reach a raw Lakebase/git
// module; it goes through the paired substrate. (The low-level
// lakebase_branch_create / _delete MCP tools are a separate, deliberate
// substrate surface and are out of scope for this guard.)
const GUARDED_DIRS = [join(ROOT, "scripts", "tdd")];

describe("substrate-only: TDD orchestration never imports an unpaired branch path", () => {
  for (const dir of GUARDED_DIRS) {
    for (const file of sourceFiles(dir)) {
      const rel = file.slice(ROOT.length + 1);
      it(`${rel} imports no unpaired Lakebase/git module`, () => {
        const src = readFileSync(file, "utf8");
        const offending = src
          .split("\n")
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => FORBIDDEN_IMPORT.test(line));
        expect(
          offending,
          `${rel} imports an unpaired branch-create/branch-delete/raw-git module. Use the paired substrate (createPairedBranch / deletePairedBranch / checkoutPaired / mergePaired).\n` +
            offending.map((o) => `  L${o.n}: ${o.line.trim()}`).join("\n"),
        ).toEqual([]);
      });

      it(`${rel} references no deleted unpaired tier creator`, () => {
        const src = readFileSync(file, "utf8");
        // Allow the words inside a comment line; flag only real code references
        // (import or call). A line that is purely a comment (// ...) is fine.
        const offending = src
          .split("\n")
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => FORBIDDEN_SYMBOL.test(line) && !line.trim().startsWith("//") && !line.trim().startsWith("*"));
        expect(
          offending,
          `${rel} references a DELETED unpaired creator (createFeature/Test/Uat/PerfBranch). Use the *Paired wrappers.\n` +
            offending.map((o) => `  L${o.n}: ${o.line.trim()}`).join("\n"),
        ).toEqual([]);
      });
    }
  }
});
