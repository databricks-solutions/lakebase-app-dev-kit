import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// FEIP-7494 parity guard: scaffolded shells under templates/project/
// must NOT duplicate substrate logic. The shells that need to talk to
// Lakebase delegate to the kit's TS CLI bins (`lakebase-branch`,
// `lakebase-schema-diff`, `lakebase-ci-resolve-branch`, etc.). Any shell
// that shells out to `databricks postgres ...` directly OR constructs
// `projects/<id>/branches/<leaf>` paths inline is a regression of the
// shell-thinning invariant and almost certainly carries the same
// drift-from-substrate bug class as defects #1 / #2 (the 2026-06-04
// inventory).
//
// Companion tests:
//   - tests/bdd/shell-syntax.test.ts: every shell parses under bash -n
//   - tests/bdd/scaffold-output-contract.test.ts: per-shell content
//     contracts (e.g. alembic env.py imports app.models)

const SCRIPTS_ROOT = path.resolve(
  __dirname,
  "..",
  "..",
  "templates",
  "project",
);

// Allowlist: shells that legitimately keep substrate-shaped logic. Each
// entry must have a comment in the shell explaining why parity does
// not apply, so a future reviewer can audit.
//
// post-checkout.sh: FEIP-7458 Phase C orphan-refusal logic. The TS
//   substrate's `checkout-paired` CLI does not yet expose
//   `--no-auto-create`, so the hook keeps its current shape until that
//   flag lands. Tracked as a follow-up in the FEIP-7494 PR.
const PARITY_ALLOWLIST = new Set<string>([
  "common/scripts/post-checkout.sh",
]);

function listShells(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...listShells(full));
    } else if (s.isFile() && entry.endsWith(".sh")) {
      out.push(full);
    }
  }
  return out;
}

const shells = listShells(SCRIPTS_ROOT).sort();

interface ParityCheck {
  pattern: RegExp;
  description: string;
}

const FORBIDDEN: ParityCheck[] = [
  {
    pattern: /\bdatabricks\s+postgres\b/,
    description:
      "shell shells out to 'databricks postgres' directly. Delegate via a kit CLI bin instead.",
  },
  {
    pattern: /\bprojects\/\$\{?[A-Z_]*\}?\/branches\//,
    description:
      "shell constructs a Lakebase 'projects/<id>/branches/<leaf>' path inline. Use the kit's resolveBranchPath via a CLI bin.",
  },
  {
    pattern: /\bgenerate-database-credential\b/,
    description:
      "shell mints a Lakebase credential directly. Use lakebase-branch sync-env or lakebase-get-connection instead.",
  },
];

describe("scaffolded shells: FEIP-7494 substrate parity", () => {
  for (const shell of shells) {
    const rel = path.relative(SCRIPTS_ROOT, shell);
    const isAllowlisted = PARITY_ALLOWLIST.has(rel);
    const label = isAllowlisted ? `${rel} (allowlisted)` : rel;

    it(`${label}`, () => {
      const body = readFileSync(shell, "utf8");
      const violations: string[] = [];
      for (const check of FORBIDDEN) {
        if (check.pattern.test(body)) {
          violations.push(`  - ${check.description}`);
        }
      }
      if (isAllowlisted) {
        // Allowlisted shells are expected to retain substrate-shaped
        // logic. The test still runs to flag if the allowlist becomes
        // stale (zero violations = move out of the allowlist).
        if (violations.length === 0) {
          throw new Error(
            `${rel} is in PARITY_ALLOWLIST but has no violations. Remove it from the allowlist.`,
          );
        }
        return;
      }
      if (violations.length > 0) {
        throw new Error(
          `${rel} violates substrate parity (FEIP-7494):\n${violations.join("\n")}\n` +
            `Fix: replace inline logic with an exec to the corresponding kit CLI bin.\n` +
            `If this shell genuinely cannot delegate (rare), add it to PARITY_ALLOWLIST` +
            ` with a comment explaining why.`,
        );
      }
      expect(violations).toEqual([]);
    });
  }
});
