// Hermetic test for the alembic runner's binary resolution. The live
// runAlembic path (which actually invokes alembic against a real DB) is
// covered by the lakebase-scm-extension's python-devloop integration
// suite. Here we only lock the project-local-venv detection logic so a
// future refactor can't regress back to bare `spawn("alembic", ...)`.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveAlembicBin, listAlembicHeads } from "../../scripts/lakebase/schema-migrate-runners/alembic.js";

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-alembic-bin-"));
  tmpDirs.push(dir);
  return dir;
}

function touch(p: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "");
  fs.chmodSync(p, 0o755);
}

describe("resolveAlembicBin", () => {
  it("prefers <projectDir>/.venv/bin/alembic when present", () => {
    const dir = mkTmp();
    const venvBin = path.join(dir, ".venv", "bin", "alembic");
    touch(venvBin);
    expect(resolveAlembicBin(dir)).toBe(venvBin);
  });

  it("falls back to <projectDir>/venv/bin/alembic when .venv is absent", () => {
    const dir = mkTmp();
    const venvBin = path.join(dir, "venv", "bin", "alembic");
    touch(venvBin);
    expect(resolveAlembicBin(dir)).toBe(venvBin);
  });

  it("prefers .venv over venv when both exist", () => {
    const dir = mkTmp();
    const dotVenv = path.join(dir, ".venv", "bin", "alembic");
    const plainVenv = path.join(dir, "venv", "bin", "alembic");
    touch(dotVenv);
    touch(plainVenv);
    expect(resolveAlembicBin(dir)).toBe(dotVenv);
  });

  it("returns bare 'alembic' when no project venv exists", () => {
    const dir = mkTmp();
    expect(resolveAlembicBin(dir)).toBe("alembic");
  });

  it("returns bare 'alembic' for a non-existent projectDir", () => {
    // Resolution must not throw on a missing dir; fall through to PATH.
    const fake = path.join(os.tmpdir(), `lbscm-alembic-missing-${Date.now()}`);
    expect(resolveAlembicBin(fake)).toBe("alembic");
  });
});

describe("spawnAlembic env parity", () => {
  it("puts the project root on PYTHONPATH for EVERY subcommand (so app-importing migrations load under `history`/`heads`)", async () => {
    // A fake alembic that records the PYTHONPATH it was given, then prints a
    // valid `heads` line. Without the PYTHONPATH fix, a migration importing app
    // code fails ModuleNotFoundError under commands that don't run env.py.
    const dir = mkTmp();
    const bin = path.join(dir, ".venv", "bin", "alembic");
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, `#!/usr/bin/env bash\nprintf '%s' "$PYTHONPATH" > "${path.join(dir, "seen-pythonpath.txt")}"\necho 'abc123 (head)'\n`);
    fs.chmodSync(bin, 0o755);

    const heads = await listAlembicHeads(dir);
    expect(heads).toEqual(["abc123"]); // ran through spawnAlembic

    const seen = fs.readFileSync(path.join(dir, "seen-pythonpath.txt"), "utf8");
    expect(seen.split(path.delimiter)).toContain(dir); // project root is importable
  });
});
