// FEIP-7510: scripts/tdd.sh is the convenient launcher that opens the
// scrum-master orchestrator session. Hermetic: real templates + tmpdir.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { deployScripts } from "../../scripts/lakebase/scaffold";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..");
const REPO_TEMPLATES = path.join(REPO_ROOT, "templates", "project");

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) fs.rmSync(d, { recursive: true, force: true });
  }
});
function mkDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "feip7510-tdd-"));
  tmpDirs.push(d);
  return d;
}

describe("scripts/tdd.sh launcher", () => {
  it("is scaffolded into scripts/ as an executable file", async () => {
    const dir = mkDir();
    const scripts = await deployScripts(dir, { templatesDir: REPO_TEMPLATES });
    expect(scripts).toContain("tdd.sh");
    const stat = fs.statSync(path.join(dir, "scripts", "tdd.sh"));
    expect(stat.mode & 0o111, "tdd.sh must be executable").not.toBe(0);
  });

  it("launches the scrum-master orchestrator and seeds an optional phase", () => {
    const sh = fs.readFileSync(
      path.join(REPO_TEMPLATES, "common", "scripts", "tdd.sh"),
      "utf8"
    );
    // Bare: open the orchestrator interactively.
    expect(sh).toMatch(/exec claude --agent scrum-master$/m);
    // Seeded: first turn is the chosen slash command.
    expect(sh).toMatch(/exec claude --agent scrum-master "\/\$phase \$\*"/);
    // Guards: needs the claude CLI + a scaffolded .claude/agents/.
    expect(sh).toMatch(/command -v claude/);
    expect(sh).toMatch(/\.claude\/agents/);
  });
});
