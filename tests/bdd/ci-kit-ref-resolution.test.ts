// Finding 24 (handover 2026-07-16 / FEIP-8050): the scaffolded CI workflows baked
// the kit version (package.json.version) into a LITERAL `#v<ver>` pin at every kit
// call site, so bumping `.lakebase/kit-ref` (which the runtime substrate follows
// via scripts/lk) never took effect in CI, every run executed the stale kit.
//
// The fix drives the CI kit ref from the SAME source as the runtime substrate:
// a "Resolve kit ref" step reads `.lakebase/kit-ref` (falling back to the version
// this project was scaffolded from) and exports KIT_REF, and every kit call site
// uses `#"${KIT_REF}"`. A kit-ref bump now takes effect in CI with no YAML edit.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { deployWorkflows } from "../../scripts/lakebase/scaffold.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  }
});

function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-kitref-"));
  tmpDirs.push(dir);
  return dir;
}

function kitVersion(): string {
  return (
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf-8")) as {
      version: string;
    }
  ).version;
}

async function scaffoldWorkflow(name: "pr.yml" | "merge.yml"): Promise<string> {
  const dir = mkTmp();
  await deployWorkflows(dir);
  return fs.readFileSync(path.join(dir, ".github", "workflows", name), "utf-8");
}

describe.each(["pr.yml", "merge.yml"] as const)(
  "CI kit ref follows .lakebase/kit-ref (Finding 24): %s",
  (name) => {
    it("resolves KIT_REF from .lakebase/kit-ref, falling back to the scaffolded version", async () => {
      const yaml = await scaffoldWorkflow(name);
      // A resolve step reads the kit-ref file and exports KIT_REF to the job env.
      expect(yaml).toMatch(/\.lakebase\/kit-ref/);
      expect(yaml).toMatch(/KIT_REF=.*>>\s*"?\$GITHUB_ENV"?/);
      // The fallback is the version this project was scaffolded from (git tag form).
      expect(yaml).toContain(`v${kitVersion()}`);
    });

    it("uses #\"${KIT_REF}\" at every kit call site (no hardcoded #v<ver> pin)", async () => {
      const yaml = await scaffoldWorkflow(name);
      const callSites = [
        ...yaml.matchAll(/github:databricks-solutions\/lakebase-app-dev-kit#(\S+)/g),
      ];
      expect(callSites.length).toBeGreaterThan(0);
      for (const m of callSites) {
        // The ref must be the resolved variable, never a baked literal version.
        expect(m[1]).toMatch(/^"?\$\{?KIT_REF\}?"?$/);
      }
      // No leftover literal-version pin anywhere in the invocation lines.
      expect(yaml).not.toMatch(/lakebase-app-dev-kit#v\d/);
    });
  },
);
