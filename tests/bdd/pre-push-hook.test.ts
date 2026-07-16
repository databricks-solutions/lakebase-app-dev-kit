// The scaffolded pre-push hook provisions the CI credential before every push
// by delegating to create-token-and-sync-secrets.sh (FEIP-8020: mint a DURABLE
// 90-day PAT, not the ~1h OAuth session token, so a CI rerun / downstream migrate
// firing long after the push still authenticates). It must NEVER block the push:
// a mint/sync failure only affects the downstream CI secret sync (W8), so offline
// work, docs, or a fix to the auth itself must still push.
//
// Both tests install the REAL scaffolded hook at .git/hooks/pre-push and provide
// a FAKE scripts/create-token-and-sync-secrets.sh, so they exercise the hook's
// delegation + non-blocking contract without needing jq / gh / databricks.

import { describe, it, expect, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const HOOK_SRC = path.resolve(
  __dirname, "..", "..", "templates", "project", "common", "scripts", "pre-push.sh",
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
  return execFileSync("git", args, { cwd, encoding: "utf-8", env: env ?? process.env });
}

/** A working repo + bare remote with the real pre-push hook installed and a fake
 *  scripts/create-token-and-sync-secrets.sh (body supplied per test). Returns the
 *  workdir + remote paths. */
function scaffold(syncScriptBody: string): { workdir: string; remote: string } {
  const root = mkTmp();
  const workdir = path.join(root, "work");
  const remote = path.join(root, "remote.git");
  fs.mkdirSync(workdir);
  git(["init", "--bare", "-b", "main", remote], root);
  git(["init", "-b", "main", workdir], root);
  git(["config", "user.email", "test@example.com"], workdir);
  git(["config", "user.name", "Test User"], workdir);
  git(["remote", "add", "origin", remote], workdir);

  // Install the REAL hook + pin core.hooksPath so a host-global hooks dir can't
  // shadow it.
  const hooksDir = path.join(workdir, ".git", "hooks");
  const hookDest = path.join(hooksDir, "pre-push");
  fs.copyFileSync(HOOK_SRC, hookDest);
  fs.chmodSync(hookDest, 0o755);
  git(["config", "--local", "core.hooksPath", hooksDir], workdir);

  // The fake credential-sync script the hook delegates to.
  const scriptsDir = path.join(workdir, "scripts");
  fs.mkdirSync(scriptsDir);
  const syncScript = path.join(scriptsDir, "create-token-and-sync-secrets.sh");
  fs.writeFileSync(syncScript, syncScriptBody);
  fs.chmodSync(syncScript, 0o755);

  fs.writeFileSync(
    path.join(workdir, ".env"),
    "DATABRICKS_HOST=https://example.cloud.databricks.com\nLAKEBASE_PROJECT_ID=proj-x\n",
  );
  fs.writeFileSync(path.join(workdir, "README.md"), "# test\n");
  git(["add", "-A"], workdir);
  git(["commit", "-m", "initial"], workdir);
  return { workdir, remote };
}

describe("pre-push hook: durable CI credential provisioning (FEIP-8020) + non-blocking (W8)", () => {
  it("delegates the CI secret sync to create-token-and-sync-secrets.sh", () => {
    const { workdir, remote } = scaffold(
      // Fake sync: record that it ran (into a marker), then succeed.
      `#!/usr/bin/env bash\necho "ran" > "$(git rev-parse --show-toplevel)/.sync-ran"\nexit 0\n`,
    );
    const res = spawnSync("git", ["push", "origin", "main"], { cwd: workdir, encoding: "utf-8" });
    expect(res.status).toBe(0);
    // The hook invoked the durable-credential script.
    expect(fs.existsSync(path.join(workdir, ".sync-ran"))).toBe(true);
    expect(git(["log", "--oneline", "main"], remote)).toMatch(/initial/);
  });

  it("warns, does NOT block the push, when the credential sync fails", () => {
    const { workdir, remote } = scaffold(
      // Fake sync fails (e.g. PAT mint failed / no gh).
      `#!/usr/bin/env bash\necho "mint failed" >&2\nexit 1\n`,
    );
    const res = spawnSync("git", ["push", "origin", "main"], { cwd: workdir, encoding: "utf-8" });
    // Push still succeeds despite the failed sync.
    expect(res.status).toBe(0);
    expect(res.stderr).toMatch(/WARNING/);
    expect(res.stderr).not.toMatch(/ERROR/);
    expect(git(["log", "--oneline", "main"], remote)).toMatch(/initial/);
  });
});
