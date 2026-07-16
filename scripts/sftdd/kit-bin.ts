// Resolve + run a kit CLI bin by name. Shared by the deterministic driver (which
// runs every kit CLI as a subprocess) and by any CLI that must route an operation
// through ANOTHER kit CLI (the single door that owns that operation's substrate)
// rather than calling the substrate in-process, e.g. `lakebase-sftdd-pipeline
// accept` delegating the experiment git-merge to `lakebase-sftdd-experiment merge`.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// This module is BUNDLED into each importing bin (a non-entry lib), so at runtime
// __dirname is the importer's dir: <kitRoot>/dist/scripts/sftdd. The kit root
// (which holds package.json + its bin map) is three directories up.
const KIT_ROOT = path.resolve(__dirname, "..", "..", "..");
let kitBinMap: Record<string, string> | null = null;

/** The dist JS for a kit bin (via the kit's package.json `bin` map), or null for
 *  a name that is not a kit bin (an external tool resolved on PATH). Resolving to
 *  the mapped file means the bin runs regardless of PATH / global install. */
export function resolveKitBinJs(bin: string): string | null {
  if (kitBinMap === null) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "package.json"), "utf8")) as {
        bin?: Record<string, string>;
      };
      kitBinMap = pkg.bin ?? {};
    } catch {
      kitBinMap = {};
    }
  }
  const rel = kitBinMap[bin];
  return rel ? path.join(KIT_ROOT, rel) : null;
}

/** The kit's own version (package.json `version`), or "unknown" if unreadable.
 *  Used to stamp advisory surfaces (e.g. next.json's authoritative_playbook_version)
 *  so a consumer can tell which kit produced the snapshot. */
export function kitVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Run a kit bin as a synchronous subprocess (inheriting stdio), returning its
 *  exit code. A kit bin resolves to its dist JS run under `node`; a non-kit name
 *  falls back to the bare command on PATH. Throws only when the process cannot be
 *  spawned at all (res.error), so a non-zero exit is returned, not thrown. */
export function runKitBinSync(bin: string, args: string[], cwd: string): number {
  const js = resolveKitBinJs(bin);
  const res = js
    ? spawnSync("node", [js, ...args], { cwd, stdio: "inherit" })
    : spawnSync(bin, args, { cwd, stdio: "inherit" });
  if (res.error) throw res.error;
  return res.status ?? 1;
}
