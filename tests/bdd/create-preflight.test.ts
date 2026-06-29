// Hermetic coverage for the create-project preflight + cleanup helpers
// (W5 auth precondition, W3 warm+verify, W9 rollback). Each is unit-testable
// without running the full createProject orchestration or touching a workspace.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  warmAndVerifyKit,
  kitWarmWarning,
  databricksAuthPrereqMessage,
  withLakebaseRollback,
} from "../../scripts/lakebase/create-preflight.js";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  }
});

function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-preflight-"));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, "scripts"));
  return dir;
}

// A stub `scripts/lk` whose `--warm` and bin runs exit with a chosen status,
// emitting a marker on stderr so the helper's reason capture is observable.
function writeStubLk(projectDir: string, warmExit: number, verifyExit = 0): void {
  const lk = path.join(projectDir, "scripts", "lk");
  fs.writeFileSync(
    lk,
    [
      "#!/usr/bin/env bash",
      'if [ "$1" = "--warm" ]; then',
      `  echo "stub warm stderr" >&2`,
      `  exit ${warmExit}`,
      "fi",
      `echo "stub verify stderr" >&2`,
      `exit ${verifyExit}`,
      "",
    ].join("\n"),
  );
  fs.chmodSync(lk, 0o755);
}

describe("W3: warmAndVerifyKit", () => {
  it("ok when warm exits 0 and a CLI resolves", () => {
    const dir = mkProject();
    writeStubLk(dir, 0, 0);
    expect(warmAndVerifyKit(dir)).toEqual({ ok: true });
  });

  it("fails with a reason when warm exits nonzero", () => {
    const dir = mkProject();
    writeStubLk(dir, 1);
    const res = warmAndVerifyKit(dir);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/stub warm stderr|exited/);
  });

  it("fails when warm succeeds but the CLI does not resolve", () => {
    const dir = mkProject();
    writeStubLk(dir, 0, 3);
    const res = warmAndVerifyKit(dir);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/did not resolve/);
  });

  it("fails clearly when the lk shim is missing entirely", () => {
    const dir = mkProject();
    const res = warmAndVerifyKit(dir);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/scripts\/lk shim missing/);
  });

  it("kitWarmWarning is specific + actionable", () => {
    const msg = kitWarmWarning("/p", "network down");
    expect(msg).toMatch(/network down/);
    expect(msg).toMatch(/\.\/scripts\/lk --warm/);
  });
});

describe("W5: databricksAuthPrereqMessage", () => {
  it("names the auth-login command and the host", () => {
    const msg = databricksAuthPrereqMessage("https://x.cloud.databricks.com/", "token expired");
    expect(msg).toMatch(/databricks auth login --host https:\/\/x\.cloud\.databricks\.com/);
    expect(msg).toMatch(/token expired/);
  });
});

describe("W9: withLakebaseRollback", () => {
  it("returns the value and does NOT delete when fn succeeds", async () => {
    let deleted = false;
    const out = await withLakebaseRollback(
      { projectId: "p1", deleteProject: async () => { deleted = true; } },
      async () => 42,
    );
    expect(out).toBe(42);
    expect(deleted).toBe(false);
  });

  it("deletes the project and rethrows with rollback context when fn throws", async () => {
    const calls: Array<{ projectId: string }> = [];
    await expect(
      withLakebaseRollback(
        { projectId: "p2", deleteProject: async (a) => { calls.push(a); } },
        async () => { throw new Error("scaffold blew up"); },
      ),
    ).rejects.toThrow(/scaffold blew up.*rolled back the Lakebase project "p2"/s);
    expect(calls).toEqual([{ projectId: "p2", host: undefined }]);
  });

  it("treats a not-found delete as already rolled back", async () => {
    await expect(
      withLakebaseRollback(
        { projectId: "p3", deleteProject: async () => { throw new Error("project not found"); } },
        async () => { throw new Error("commit failed"); },
      ),
    ).rejects.toThrow(/rolled back the Lakebase project "p3"/);
  });

  it("warns to purge when rollback delete keeps failing", async () => {
    await expect(
      withLakebaseRollback(
        { projectId: "p4", deleteProject: async () => { throw new Error("500 server error"); } },
        async () => { throw new Error("scaffold failed"); },
      ),
    ).rejects.toThrow(/could not roll back.*delete-project p4/s);
  });
});
