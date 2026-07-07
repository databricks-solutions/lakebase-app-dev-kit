// Guard: every `databricks` spawn must go through the one wrapper
// (scripts/lakebase/databricks-cli.ts) or carry a `databricks-cli-exempt` tag.
// Scans all source and fails on any untagged bare spawn.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "scripts");
const WRAPPER_REL = path.join("lakebase", "databricks-cli.ts");

// Spawns of the `databricks` CLI: an execFile/spawn family call with a "databricks"
// literal, or a bare exec() shell string. `\s*` spans multi-line calls.
const SPAWN_PATTERNS: RegExp[] = [
  /(?:execFileSync|execFileP|execFile|spawnSync|spawn)\s*\(\s*"databricks"/g,
  /\bexec\(\s*[`"]databricks[\s`"]/g,
];

/** Recursively list .ts files under a dir, skipping tests + node_modules + dist. */
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Allowed if `databricks-cli-exempt` appears within ~500 chars before the spawn. */
function isExempt(content: string, matchIndex: number): boolean {
  return content.slice(Math.max(0, matchIndex - 500), matchIndex).includes("databricks-cli-exempt");
}

describe("one databricks-CLI spawn point: no bare `databricks` spawn outside the wrapper", () => {
  const files = tsFiles(SCRIPTS_DIR);

  it("scans a non-trivial number of source files (sanity)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("every `databricks` spawn is in databricks-cli.ts or tagged `databricks-cli-exempt`", () => {
    const violations: string[] = [];
    for (const file of files) {
      if (file.endsWith(WRAPPER_REL)) continue; // the wrapper is the one allowed spawn point
      const content = fs.readFileSync(file, "utf8");
      for (const re of SPAWN_PATTERNS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          if (!isExempt(content, m.index)) {
            const line = content.slice(0, m.index).split("\n").length;
            violations.push(`${path.relative(SCRIPTS_DIR, file)}:${line}  ->  ${m[0].replace(/\s+/g, " ")}`);
          }
        }
      }
    }
    expect(violations, `Bare databricks spawn(s) must route through databricks-cli.ts (runDatabricks/runDatabricksSync) or carry a documented \`databricks-cli-exempt\` tag:\n${violations.join("\n")}`).toEqual([]);
  });

  it("the wrapper itself DOES spawn databricks (the one allowed place)", () => {
    const wrapper = fs.readFileSync(path.join(SCRIPTS_DIR, WRAPPER_REL), "utf8");
    expect(SPAWN_PATTERNS.some((re) => { re.lastIndex = 0; return re.test(wrapper); })).toBe(true);
  });
});
