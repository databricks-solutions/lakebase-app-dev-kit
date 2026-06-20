// The `lk` resolver shim (scaffolded into every project's scripts/) kills the
// npx tax: instead of `npx --package=github#ref <bin>` (~3.5s, re-resolves the
// ref every call), it resolves the kit ONCE per ref into a shared cache and
// `node`-execs the bin (~0.09s). These hermetic tests drive its contract via a
// fake kit dir + a pre-seeded cache, so they never hit the network/npm.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..", "..");
const LK = join(REPO_ROOT, "templates", "project", "common", "scripts", "lk");

const PKG = "@databricks-solutions/lakebase-app-dev-kit";

let work: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "lk-"));
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

/** Lay out a fake kit install (package.json bin map + a dist stub that echoes
 *  its argv as JSON) so we can assert resolution + exec without a real kit. */
function fakeKitDir(dir: string): string {
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: PKG, bin: { "lakebase-sftdd-log": "dist/echo.js" } }),
  );
  writeFileSync(join(dir, "dist", "echo.js"), "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
  return dir;
}

function runLk(args: string[], env: Record<string, string>, cwd = work) {
  return spawnSync("bash", [LK, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("lk resolver shim", () => {
  it("execs the bin's dist JS and forwards args (LAKEBASE_KIT_DIR override)", () => {
    const kit = fakeKitDir(join(work, "kit"));
    const r = runLk(["lakebase-sftdd-log", "--read", "--feature", "F1"], { LAKEBASE_KIT_DIR: kit });
    expect(r.status, r.stderr).toBe(0);
    // The stub echoes its received args, proving node ran the mapped dist file
    // with everything after the bin name forwarded.
    expect(JSON.parse(r.stdout)).toEqual(["--read", "--feature", "F1"]);
  });

  it("resolves the kit from the shared per-ref cache without installing (LAKEBASE_KIT_REF)", () => {
    const cache = join(work, "cache");
    const kit = fakeKitDir(join(cache, "lakebase-app-dev-kit", "myref", "node_modules", PKG));
    void kit;
    const r = runLk(["lakebase-sftdd-log", "--x"], { XDG_CACHE_HOME: cache, LAKEBASE_KIT_REF: "myref" });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(["--x"]);
  });

  it("reads the pinned ref from .lakebase/kit-ref when no env is set", () => {
    const cache = join(work, "cache");
    fakeKitDir(join(cache, "lakebase-app-dev-kit", "fileref", "node_modules", PKG));
    const proj = join(work, "proj");
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(join(proj, ".lakebase", "kit-ref"), "fileref\n");
    const r = runLk(["lakebase-sftdd-log"], { XDG_CACHE_HOME: cache, LAKEBASE_KIT_REF: "" }, proj);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it("exits non-zero for an unknown bin", () => {
    const kit = fakeKitDir(join(work, "kit"));
    const r = runLk(["lakebase-not-a-bin"], { LAKEBASE_KIT_DIR: kit });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/unknown/i);
  });

  it("--warm resolves the kit without running a bin (cache pre-populate)", () => {
    const kit = fakeKitDir(join(work, "kit"));
    const r = runLk(["--warm"], { LAKEBASE_KIT_DIR: kit });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe(""); // no bin ran
  });

  it("errors with a usage message when no bin is given", () => {
    const kit = fakeKitDir(join(work, "kit"));
    const r = runLk([], { LAKEBASE_KIT_DIR: kit });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/usage/i);
  });
});
