// BDD coverage for the e2e-regex-clean static lint (scripts/sftdd/e2e-regex-clean.ts).
// It catches Playwright matchers built from a Python regex with inline flags
// (re.compile(r"(?i)summary")), which Playwright forwards verbatim to the JS
// engine where inline-flag syntax is invalid, so the assertion can never match.
// Each test builds an isolated temp project tree so the scan runs against real files.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  checkE2eRegexClean,
  findInlineFlagRegexes,
  summarizeE2eRegexViolations,
} from "../../scripts/sftdd/e2e-regex-clean.js";

const tmpDirs: string[] = [];

function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-regex-clean-"));
  tmpDirs.push(dir);
  return dir;
}

function writeE2e(dir: string, name: string, body: string): void {
  const e2e = path.join(dir, "tests", "e2e");
  fs.mkdirSync(e2e, { recursive: true });
  fs.writeFileSync(path.join(e2e, name), body);
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("findInlineFlagRegexes (unit)", () => {
  it("flags an inline (?i) flag in re.compile", () => {
    const hits = findInlineFlagRegexes(
      `expect(error).to_contain_text(re.compile(r"(?i)summary"))`,
      "tests/e2e/test_x.py",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].pattern).toBe("(?i)summary");
    expect(hits[0].line).toBe(1);
  });

  it("flags combined + negative inline flags", () => {
    expect(findInlineFlagRegexes(`re.compile(r"(?is)x")`, "f")).toHaveLength(1);
    expect(findInlineFlagRegexes(`re.compile("(?-i)x")`, "f")).toHaveLength(1);
  });

  it("does NOT flag the kwarg-flag form (the correct fix)", () => {
    expect(
      findInlineFlagRegexes(`re.compile("summary", re.IGNORECASE)`, "f"),
    ).toHaveLength(0);
  });

  it("does NOT flag a scoped inline group (?i:...) which JS supports", () => {
    expect(findInlineFlagRegexes(`re.compile(r"(?i:summary)")`, "f")).toHaveLength(0);
  });

  it("does NOT flag a plain pattern with no flags", () => {
    expect(findInlineFlagRegexes(`re.compile(r".*/bugs/new")`, "f")).toHaveLength(0);
  });

  it("reports the correct line for a match on a later line", () => {
    const src = `line1\nline2\nx = re.compile(r"(?m)foo")\n`;
    const hits = findInlineFlagRegexes(src, "f");
    expect(hits[0].line).toBe(3);
  });
});

describe("checkE2eRegexClean (project scan)", () => {
  it("returns clean for a project with no tests/e2e dir", () => {
    const dir = mkProject();
    expect(checkE2eRegexClean({ projectDir: dir }).clean).toBe(true);
  });

  it("returns clean when E2E tests use the kwarg-flag form", () => {
    const dir = mkProject();
    writeE2e(dir, "test_file_bug.py", `re.compile("summary", re.IGNORECASE)\n`);
    expect(checkE2eRegexClean({ projectDir: dir }).clean).toBe(true);
  });

  it("flags an inline-flag matcher with a project-relative file + line + remediation", () => {
    const dir = mkProject();
    writeE2e(
      dir,
      "test_file_bug.py",
      `import re\nexpect(e).to_contain_text(re.compile(r"(?i)summary"))\n`,
    );
    const res = checkE2eRegexClean({ projectDir: dir });
    expect(res.clean).toBe(false);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].file).toBe("tests/e2e/test_file_bug.py");
    expect(res.violations[0].line).toBe(2);
    expect(res.remediation).toMatch(/re\.IGNORECASE/);
  });

  it("scans nested e2e subdirs and skips __pycache__", () => {
    const dir = mkProject();
    const sub = path.join(dir, "tests", "e2e", "flows");
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, "test_a.py"), `re.compile(r"(?s)x")\n`);
    fs.mkdirSync(path.join(dir, "tests", "e2e", "__pycache__"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "tests", "e2e", "__pycache__", "test_a.py"),
      `re.compile(r"(?i)cached")\n`,
    );
    const res = checkE2eRegexClean({ projectDir: dir });
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].file).toBe(path.join("tests", "e2e", "flows", "test_a.py"));
  });

  it("summarizeE2eRegexViolations renders file:line + pattern", () => {
    const s = summarizeE2eRegexViolations([
      { file: "tests/e2e/test_x.py", line: 9, pattern: "(?i)summary" },
    ]);
    expect(s).toContain("tests/e2e/test_x.py:9");
    expect(s).toContain("(?i)summary");
  });
});
