// W8: the scaffolded pre-push hook must WARN (not block) when the Databricks
// OAuth token cannot be refreshed. A stale/missing token only affects the
// downstream CI secret sync; it must never stop the developer from pushing.
//
// This reproduces the eval symptom ("push blocked by stale DB auth") against
// the real scaffolded hook installed at .git/hooks/pre-push, with a fake
// `databricks` on PATH whose `auth token` yields nothing, and asserts the push
// to a bare remote SUCCEEDS with the warning on stderr.

import { describe, it, expect, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const HOOK_SRC = path.resolve(
  __dirname,
  "..",
  "..",
  "templates",
  "project",
  "common",
  "scripts",
  "pre-push.sh",
);

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  }
});

function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-prepush-"));
  tmpDirs.push(dir);
  return dir;
}

function git(args: string[], cwd: string, env?: NodeJS.ProcessEnv): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    env: env ?? process.env,
  });
}

describe("W8: pre-push hook warns, does not block, on token-refresh failure", () => {
  it("git push succeeds (exit 0) with a warning when the token can't refresh", () => {
    const root = mkTmp();
    const workdir = path.join(root, "work");
    const remote = path.join(root, "remote.git");
    const bin = path.join(root, "bin");
    fs.mkdirSync(workdir);
    fs.mkdirSync(bin);

    // Bare remote + working repo on branch main.
    git(["init", "--bare", "-b", "main", remote], root);
    git(["init", "-b", "main", workdir], root);
    git(["config", "user.email", "test@example.com"], workdir);
    git(["config", "user.name", "Test User"], workdir);
    git(["remote", "add", "origin", remote], workdir);

    // Install the REAL scaffolded hook, and pin core.hooksPath to this repo's
    // hooks dir so a host-global core.hooksPath (e.g. a workstation's
    // ~/.databricks/githooks secret scanner) can't shadow the hook under test.
    const hooksDir = path.join(workdir, ".git", "hooks");
    const hookDest = path.join(hooksDir, "pre-push");
    fs.copyFileSync(HOOK_SRC, hookDest);
    fs.chmodSync(hookDest, 0o755);
    git(["config", "--local", "core.hooksPath", hooksDir], workdir);

    // A fake `databricks` whose `auth token` produces no access token, so the
    // hook's refresh fails and must fall through to the warn-not-block branch.
    const fakeDatabricks = path.join(bin, "databricks");
    fs.writeFileSync(fakeDatabricks, "#!/usr/bin/env bash\necho '{}'\nexit 0\n");
    fs.chmodSync(fakeDatabricks, 0o755);

    // DATABRICKS_HOST set so the hook enters the refresh branch at all.
    fs.writeFileSync(path.join(workdir, ".env"), "DATABRICKS_HOST=https://example.cloud.databricks.com\n");

    // Commit something to push.
    fs.writeFileSync(path.join(workdir, "README.md"), "# test\n");
    git(["add", "README.md"], workdir);
    git(["commit", "-m", "initial"], workdir);

    const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}` };

    const res = spawnSync("git", ["push", "origin", "main"], {
      cwd: workdir,
      encoding: "utf-8",
      env,
    });

    // The push must succeed despite the failed token refresh.
    expect(res.status).toBe(0);

    // The hook must have emitted the warning (not a blocking error) on stderr.
    expect(res.stderr).toMatch(/WARNING/);
    expect(res.stderr).not.toMatch(/ERROR/);

    // And the remote must actually have received the commit.
    const remoteLog = git(["log", "--oneline", "main"], remote);
    expect(remoteLog).toMatch(/initial/);
  });
});
