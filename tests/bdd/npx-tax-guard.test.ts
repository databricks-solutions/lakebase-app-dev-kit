// Guard against the npx tax creeping back in. Kit CLIs invoked from a scaffolded
// project must go through the fast `./scripts/lk` resolver (node dist, ~0.09s),
// NOT `npx --package=github#ref <bin>` (~3.5s, re-resolves the ref every call).
// Two intentional exceptions keep npx: the kit's own create path (commands/tdd.md,
// runs before a project/shim exists) and the project CI workflows (pinned to an
// immutable published version tag, which npx caches; lk would break that pin).

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), "utf8");

const COMMAND_TEMPLATES = [
  "templates/project/common/.claude/commands/plan.md",
  "templates/project/common/.claude/commands/design.md",
  "templates/project/common/.claude/commands/build.md",
  "templates/project/common/.claude/commands/deploy.md",
  "templates/project/common/.claude/commands/spike.md",
  "templates/project/common/.claude/commands/sprint.md",
  "templates/project/common/.claude/commands/design.pre-hook.md",
];

describe("npx-tax guard: scaffolded command templates use ./scripts/lk", () => {
  for (const rel of COMMAND_TEMPLATES) {
    it(`${path.basename(rel)} invokes kit CLIs via ./scripts/lk, not npx --package`, () => {
      const body = read(rel);
      expect(body, "should route kit CLIs through the lk resolver").toMatch(/\.\/scripts\/lk\b/);
      expect(body, "no npx --package kit-CLI calls").not.toMatch(/npx\s+--yes\s+--package/);
      expect(body, "no leftover KIT_PKG plumbing").not.toMatch(/KIT_PKG/);
    });
  }
});

describe("npx-tax guard: the canonical logging doc + smoke use lk", () => {
  it("agent-logging.md shows the logger invoked via ./scripts/lk", () => {
    const body = read("skills/lakebase-tdd-workflows/references/agent-logging.md");
    expect(body).toMatch(/\.\/scripts\/lk lakebase-tdd-log/);
    // No bare command-line `lakebase-tdd-log` invocation (start of a bash line).
    expect(body).not.toMatch(/^\s*lakebase-tdd-log /m);
  });

  it("the smoke drives per-CLI calls through scripts/lk (create-project stays npx)", () => {
    const smoke = read("examples/feip-7422-smoke/orchestrator/run-smoke.sh");
    expect(smoke).toMatch(/scripts\/lk/);
    // The per-CLI quoted-KIT_NPX form is fully converted; only the split-line
    // create-project bootstrap may still use npx.
    expect(smoke).not.toMatch(/npx --yes --package="\$\{KIT_NPX\}"/);
    expect(smoke, "create-project bootstrap intentionally stays npx").toMatch(/lakebase-create-project/);
  });
});
