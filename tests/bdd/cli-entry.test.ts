// Regression test for the isCliEntry helper (phase C++).
//
// Backstop for the TDD-workflow smoke finding: every SCM CLI shipped a
// naive `endsWith("<file>.cli.js")` guard that npx (which invokes via
// the `.bin/<name>` symlink) silently broke. isCliEntry resolves
// symlinks on both sides so the comparison survives.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { isCliEntry } from "../../scripts/util/cli-entry.js";

let tmpDir: string;
let savedArgv: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-entry-"));
  savedArgv = [...process.argv];
});

afterEach(() => {
  process.argv = savedArgv;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("isCliEntry", () => {
  it("returns true when process.argv[1] is the same file as importMetaUrl", () => {
    const target = path.join(tmpDir, "bin.js");
    fs.writeFileSync(target, "// stub\n");
    process.argv = [process.argv[0], target];
    const importMetaUrl = pathToFileURL(target).href;
    expect(isCliEntry(importMetaUrl)).toBe(true);
  });

  it("returns true when process.argv[1] is a SYMLINK to the same file (npx .bin path)", () => {
    const target = path.join(tmpDir, "scm-state.cli.js");
    fs.writeFileSync(target, "// stub\n");
    const symlinkDir = path.join(tmpDir, ".bin");
    fs.mkdirSync(symlinkDir);
    const symlinkPath = path.join(symlinkDir, "lakebase-scm-state");
    fs.symlinkSync(target, symlinkPath);
    process.argv = [process.argv[0], symlinkPath];
    const importMetaUrl = pathToFileURL(target).href;
    expect(isCliEntry(importMetaUrl)).toBe(true);
  });

  it("returns false when process.argv[1] points to a DIFFERENT file", () => {
    const target = path.join(tmpDir, "bin.js");
    const other = path.join(tmpDir, "other.js");
    fs.writeFileSync(target, "// stub\n");
    fs.writeFileSync(other, "// stub\n");
    process.argv = [process.argv[0], other];
    const importMetaUrl = pathToFileURL(target).href;
    expect(isCliEntry(importMetaUrl)).toBe(false);
  });

  it("returns false when process.argv[1] is empty (test runner context)", () => {
    process.argv = [process.argv[0], ""];
    const target = path.join(tmpDir, "bin.js");
    fs.writeFileSync(target, "// stub\n");
    expect(isCliEntry(pathToFileURL(target).href)).toBe(false);
  });

  it("returns false when process.argv[1] is a non-existent path", () => {
    process.argv = [process.argv[0], path.join(tmpDir, "does-not-exist.js")];
    const target = path.join(tmpDir, "bin.js");
    fs.writeFileSync(target, "// stub\n");
    expect(isCliEntry(pathToFileURL(target).href)).toBe(false);
  });
});
