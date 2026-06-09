// Guard: the deterministic driver resolves the kit child-CLIs it emits through
// the kit's OWN package.json `bin` map (drive.cli's resolveKitBinJs), NOT a
// hand-maintained list. So every kit bin the effects layer can emit as a `cli`
// command MUST be declared in package.json `bin` , otherwise the driver falls
// back to a bare `spawn(<bin>)` which is not on PATH under lk and dies with
// ENOENT (this is exactly what happened when lakebase-tdd-log was emitted by the
// feature drive but missing from the old hardcoded map).
//
// This test reads the *_BIN constants the effects layer declares and asserts
// each is a package.json bin key, so a newly-emitted bin can't drift out of
// sync before a live run catches it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** The kit bin names the effects layer emits (the `const X_BIN = "lakebase-..."`
 *  declarations in orchestrator-effects.ts). */
function emittedKitBins(): string[] {
  const src = readFileSync(new URL("../../scripts/tdd/orchestrator-effects.ts", import.meta.url), "utf8");
  const bins = new Set<string>();
  for (const m of src.matchAll(/_BIN\s*=\s*"(lakebase-[a-z0-9-]+)"/g)) bins.add(m[1]);
  return [...bins];
}

function packageBinKeys(): Set<string> {
  const pkg = JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8")) as { bin?: Record<string, string> };
  return new Set(Object.keys(pkg.bin ?? {}));
}

describe("driver kit-bin resolution is backed by package.json bin (no hardcoded map)", () => {
  it("finds the emitted kit bins (sanity)", () => {
    expect(emittedKitBins().length).toBeGreaterThanOrEqual(4);
  });

  it("every kit bin the effects layer emits is declared in package.json bin", () => {
    const declared = packageBinKeys();
    const missing = emittedKitBins().filter((b) => !declared.has(b));
    expect(missing, `these kit bins are emitted by the driver but missing from package.json bin (would ENOENT under lk)`).toEqual([]);
  });

  it("drive.cli no longer carries a hardcoded bin->js map (resolves via package.json)", () => {
    const src = readFileSync(new URL("../../scripts/tdd/drive.cli.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/KIT_CLI_JS/);
    expect(src).toMatch(/resolveKitBinJs/);
  });
});
