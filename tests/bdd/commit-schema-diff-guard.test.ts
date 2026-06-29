// W2: the commit-time schema-diff enrichment must never block a commit.
//
// Two guards, both exercised against the REAL scaffolded scripts:
//   1. A COLD kit cache must NOT trigger an `npm install` on commit (the eval's
//      ~70s stall). LK_NO_INSTALL makes the `lk` shim skip the install; the
//      commit still succeeds, just without the diff.
//   2. A slow/unreachable diff must be bounded by a hard timeout, not hang the
//      commit.

import { describe, it, expect, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const COMMON = path.resolve(
  __dirname, "..", "..", "templates", "project", "common", "scripts",
);
const PREPARE_HOOK = path.join(COMMON, "prepare-commit-msg.sh");
const PREPARE_DIFF = path.join(COMMON, "prepare-schema-diff.sh");
const LK = path.join(COMMON, "lk");

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  }
});

function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-w2-"));
  tmpDirs.push(dir);
  return dir;
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" });
}

// A scaffolded project skeleton: git repo + .env + scripts/{lk,prepare-schema-diff.sh}.
function scaffold(root: string): { workdir: string; scripts: string } {
  const workdir = path.join(root, "work");
  fs.mkdirSync(workdir);
  git(["init", "-b", "main", workdir], root);
  git(["config", "user.email", "t@e.com"], workdir);
  git(["config", "user.name", "T"], workdir);

  const scripts = path.join(workdir, "scripts");
  fs.mkdirSync(scripts);
  for (const [src, name] of [[LK, "lk"], [PREPARE_DIFF, "prepare-schema-diff.sh"]] as const) {
    const dest = path.join(scripts, name);
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
  }
  fs.writeFileSync(path.join(workdir, ".env"), "LAKEBASE_PROJECT_ID=test-instance\n");
  fs.mkdirSync(path.join(workdir, ".lakebase"));
  fs.writeFileSync(path.join(workdir, ".lakebase", "kit-ref"), "main\n");
  return { workdir, scripts };
}

describe("W2: commit-time schema diff never blocks the commit", () => {
  it("a cold kit cache does NOT npm-install on commit; commit still succeeds", () => {
    const root = mkTmp();
    const { workdir } = scaffold(root);

    // Install the real prepare-commit-msg hook, pinned local hooksPath so a
    // host-global core.hooksPath cannot shadow it.
    const hooksDir = path.join(workdir, ".git", "hooks");
    const hookDest = path.join(hooksDir, "prepare-commit-msg");
    fs.copyFileSync(PREPARE_HOOK, hookDest);
    fs.chmodSync(hookDest, 0o755);
    git(["config", "--local", "core.hooksPath", hooksDir], workdir);

    // A fake `npm` that, if ever invoked, drops a marker AND sleeps long enough
    // to be the eval's stall. With LK_NO_INSTALL the shim must never call it.
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    const marker = path.join(root, "npm-was-called");
    fs.writeFileSync(
      path.join(bin, "npm"),
      `#!/usr/bin/env bash\ntouch ${JSON.stringify(marker)}\nsleep 30\n`,
    );
    fs.chmodSync(path.join(bin, "npm"), 0o755);

    fs.writeFileSync(path.join(workdir, "file.txt"), "hello\n");
    git(["add", "file.txt"], workdir);

    const start = Date.now();
    const res = spawnSync("git", ["commit", "-m", "add file"], {
      cwd: workdir,
      encoding: "utf-8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    const elapsedMs = Date.now() - start;

    expect(res.status).toBe(0);                       // commit succeeded
    expect(fs.existsSync(marker)).toBe(false);        // npm install was NOT invoked
    expect(elapsedMs).toBeLessThan(15_000);           // nowhere near the 70s stall
    // The commit landed.
    expect(git(["log", "--oneline"], workdir)).toMatch(/add file/);
  });

  it("a hanging diff is bounded by the hard timeout, commit content still written", () => {
    const root = mkTmp();
    const { workdir } = scaffold(root);

    // A fake kit whose schema-diff bin hangs forever; lk runs it via
    // LAKEBASE_KIT_DIR (dev-override path), prepare-schema-diff wraps it in the
    // hard timeout.
    const fakeKit = path.join(root, "fakekit");
    fs.mkdirSync(fakeKit);
    fs.writeFileSync(
      path.join(fakeKit, "package.json"),
      JSON.stringify({ name: "fake", bin: { "lakebase-schema-diff": "sleep.js" } }),
    );
    fs.writeFileSync(path.join(fakeKit, "sleep.js"), "setInterval(() => {}, 1000);\n");

    const start = Date.now();
    const res = spawnSync("bash", ["scripts/prepare-schema-diff.sh", "feature-x"], {
      cwd: workdir,
      encoding: "utf-8",
      env: {
        ...process.env,
        LAKEBASE_KIT_DIR: fakeKit,
        LAKEBASE_SCHEMA_DIFF_TIMEOUT: "2",
      },
    });
    const elapsedMs = Date.now() - start;

    expect(res.status).toBe(0);                       // script succeeded (best-effort)
    expect(elapsedMs).toBeLessThan(10_000);           // bounded by the 2s timeout + grace
    const md = fs.readFileSync(path.join(workdir, ".tmp", "schema-diff.md"), "utf-8");
    expect(md).toMatch(/could not be computed/);      // diff skipped, not hung
  });
});
