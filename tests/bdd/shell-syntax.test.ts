import { describe, it, expect } from "vitest";
import { execFileSync, type SpawnSyncReturns } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

// Hermetic shell-syntax check (FEIP-7494 layer A): every scaffolded
// .sh file under templates/project/common/scripts/ must parse cleanly
// under `bash -n`. Catches typos, broken substitutions, unclosed
// heredocs, and copy-paste errors in thin-wrapped shells without
// needing to actually invoke them (no Lakebase / npm install / git
// context required).
//
// Companion to the substrate-side BDD tests (which prove the TS bins
// work) and the scaffold-output-contract tests (which prove the
// shells delegate to those bins).

const SCRIPTS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "templates",
  "project",
  "common",
  "scripts",
);

function listShellsRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...listShellsRecursive(full));
    } else if (s.isFile() && entry.endsWith(".sh")) {
      out.push(full);
    }
  }
  return out;
}

const shells = listShellsRecursive(SCRIPTS_DIR).sort();

describe("scaffolded shells: bash -n syntax", () => {
  it("at least one shell is shipped", () => {
    expect(shells.length).toBeGreaterThan(0);
  });

  for (const shell of shells) {
    const rel = path.relative(SCRIPTS_DIR, shell);
    it(`${rel} parses under bash -n`, () => {
      let err: Error | undefined;
      try {
        execFileSync("bash", ["-n", shell], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (e) {
        err = e as Error;
      }
      if (err) {
        const sse = err as Error & SpawnSyncReturns<string>;
        throw new Error(
          `bash -n failed for ${rel}:\n${sse.stderr ?? err.message}`,
        );
      }
    });
  }
});
