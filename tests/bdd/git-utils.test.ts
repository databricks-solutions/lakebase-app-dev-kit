import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { gitInit } from "../../scripts/git/init.js";
import { commitAndPush, WorkflowScopeError } from "../../scripts/git/commit-push.js";
import { commitAll } from "../../scripts/git/commits.js";
import { exec } from "../../scripts/util/exec.js";

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-git-"));
  tmpDirs.push(dir);
  return dir;
}

async function configIdentity(cwd: string): Promise<void> {
  await exec("git config user.email test@example.com", { cwd });
  await exec("git config user.name 'Test User'", { cwd });
}

describe("gitInit", () => {
  it("creates a .git directory on main", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    expect(fs.existsSync(path.join(dir, ".git"))).toBe(true);
    const branch = await exec("git symbolic-ref --short HEAD || true", { cwd: dir });
    expect(branch).toBe("main");
  });
});

// The standalone `commit` export from commit-push.ts was removed in
// FEIP-7324 in favor of the more general primitives in scripts/git/commits.ts.
// commitAll covers the "stage everything + commit" behavior these tests
// previously exercised via the old commit-push.commit shim.
describe("commitAll (project-scaffold stage-and-commit equivalent)", () => {
  it("stages everything and creates a commit with the given message", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    fs.writeFileSync(path.join(dir, "README.md"), "# Test\n");
    await commitAll({ cwd: dir, message: "Initial test commit" });
    const log = await exec("git log -1 --pretty=%s", { cwd: dir });
    expect(log).toBe("Initial test commit");
  });

  it("handles commit messages with special shell characters", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    fs.writeFileSync(path.join(dir, "x"), "");
    const msg = `Initial scaffold (Java/Spring Boot + Lakebase): "test"`;
    await commitAll({ cwd: dir, message: msg });
    const log = await exec("git log -1 --pretty=%s", { cwd: dir });
    expect(log).toBe(msg);
  });
});

describe("commitAndPush with push:false", () => {
  it("commits without pushing when push:false", async () => {
    const dir = mkTmp();
    await gitInit(dir);
    await configIdentity(dir);
    fs.writeFileSync(path.join(dir, "f.txt"), "");
    await commitAndPush({ projectDir: dir, message: "no-push", push: false });
    const log = await exec("git log -1 --pretty=%s", { cwd: dir });
    expect(log).toBe("no-push");
  });
});

describe("WorkflowScopeError", () => {
  it("includes the project directory in the actionable hint", () => {
    const err = new WorkflowScopeError("/tmp/my-proj");
    expect(err.name).toBe("WorkflowScopeError");
    expect(err.message).toMatch(/cd \/tmp\/my-proj && git push -u origin main/);
    expect(err.message).toMatch(/workflow.*scope/);
  });
});
