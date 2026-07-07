// The forever guard against the whack-a-mole that produced repeated mid-run
// "refresh token is invalid --profile DEFAULT" crashes: the kit had MANY ad-hoc
// `databricks` spawns (six `dbcli` copies + branch-endpoint + create-preflight +
// doctor + uc-resources + secret-auth + deploy-* + databricks-host + ci-secrets),
// and each one that did not thread a profile fell back to DEFAULT. Manual grepping
// kept missing more (multi-line spawns, differently-formatted exec strings).
//
// This test is the exhaustive, ENFORCED audit: it scans every source file and
// FAILS if it finds a `databricks` subprocess spawned OUTSIDE the one wrapper
// (scripts/lakebase/databricks-cli.ts), unless the spawn is explicitly tagged
// `databricks-cli-exempt` with a documented reason. New code cannot reintroduce a
// bare spawn without either routing it through the wrapper or justifying an
// exemption in review.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "scripts");
const WRAPPER_REL = path.join("lakebase", "databricks-cli.ts");

/** The two forms of spawning the `databricks` CLI:
 *  - execFile / execFileSync / execFileP / spawn / spawnSync with a "databricks"
 *    command literal (the `\s*` spans a multi-line call);
 *  - a bare exec() shell string beginning `databricks`.
 *  These match real spawns, NOT prose (comments / error-message templates), which
 *  never sit immediately after a spawn-fn opening paren. */
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

/** A spawn is allowed only if `databricks-cli-exempt` appears within the ~500
 *  chars preceding it (the tag comment sits directly above the spawn call; the
 *  window covers a multi-line comment + the `const child = spawn(` line). */
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
