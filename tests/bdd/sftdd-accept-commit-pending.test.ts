import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { gitInit } from "../../scripts/git/init.js";
import { exec } from "../../scripts/util/exec.js";
import { commitExperimentCode } from "../../scripts/sftdd/cycle-record.js";

// Regression guard for the accept-merge dirty-tree abort: a supersession/repair
// turn can edit CODE on the experiment branch outside any green/refactor commit,
// leaving an uncommitted change. mergePaired then `git checkout <feature>` and
// git ABORTS ("local changes would be overwritten"). The accept path now calls
// commitExperimentCode first, which commits pending CODE (so the checkout
// succeeds) while leaving the churny .sftdd/.tdd/.lakebase runtime state
// UNcommitted (so it cannot diverge from the feature branch).

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});

function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-accept-"));
  tmpDirs.push(dir);
  return dir;
}

async function configIdentity(cwd: string): Promise<void> {
  await exec("git config user.email test@example.com", { cwd });
  await exec("git config user.name 'Test User'", { cwd });
}

const MIGRATION = "alembic/versions/20260626_drop_inventory_code.py";

async function writeMigration(dir: string, body: string): Promise<void> {
  const full = path.join(dir, MIGRATION);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, "utf8");
}

describe("commitExperimentCode (accept-merge clean-tree precondition)", () => {
  it("commits pending experiment CODE so checkout no longer aborts, but leaves .sftdd runtime uncommitted", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);

    // Base commit on main, then a divergent feature branch (the merge target).
    await writeMigration(dir, "def downgrade():\n    pass  # base\n");
    await exec("git add -A && git commit -m base", { cwd: dir });
    await exec("git checkout -b feature", { cwd: dir });
    await writeMigration(dir, "def downgrade():\n    pass  # feature-version\n");
    await exec("git add -A && git commit -m feature-work", { cwd: dir });

    // Back on the experiment line (main here): a repair turn edits the migration
    // but never commits it, and runtime state churns (untracked .sftdd).
    await exec("git checkout main", { cwd: dir });
    await writeMigration(
      dir,
      "def downgrade():\n    pass  # base\n    op.alter_column('stock','inventory_code',nullable=False)\n",
    );
    fs.mkdirSync(path.join(dir, ".sftdd"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".sftdd/workflow-state.json"), '{"phase":"build"}\n', "utf8");

    // Precondition: with the dirty CODE file, the accept checkout ABORTS.
    await expect(exec("git checkout feature", { cwd: dir })).rejects.toThrow();
    await exec("git checkout main", { cwd: dir }).catch(() => undefined);

    // The fix: commit pending experiment code.
    const committed = await commitExperimentCode(dir, "accept: commit pending experiment work");
    expect(committed).toBe(true);

    // The migration (CODE) is now committed; the .sftdd runtime state is NOT.
    const status = await exec("git status --porcelain", { cwd: dir });
    expect(status).not.toMatch(/alembic\/versions/);
    // The churny runtime state stays uncommitted (git collapses the untracked
    // dir to ".sftdd/" in --porcelain).
    expect(status).toMatch(/\.sftdd\//);

    // And the accept checkout now succeeds (no uncommitted code to overwrite).
    await expect(exec("git checkout feature", { cwd: dir })).resolves.toBeDefined();
  });

  it("is a no-op (returns false) on an already-clean code tree", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    await writeMigration(dir, "def downgrade():\n    pass\n");
    await exec("git add -A && git commit -m base", { cwd: dir });

    const committed = await commitExperimentCode(dir, "accept: nothing pending");
    expect(committed).toBe(false);
  });
});
