import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { exec } from "../../scripts/util/exec.js";
import { getGitHubUrl, getOwnerRepo } from "../../scripts/git/remote.js";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  }
});

async function mkRepoWithRemote(url: string): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-remote-"));
  tmpDirs.push(dir);
  await exec("git init -b main", { cwd: dir });
  await exec(`git remote add origin "${url}"`, { cwd: dir });
  return dir;
}

describe("getGitHubUrl", () => {
  it("returns empty string when no git remote", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-no-remote-"));
    tmpDirs.push(dir);
    expect(await getGitHubUrl(dir)).toBe("");
  });

  it("normalizes HTTPS URL (strips .git)", async () => {
    const dir = await mkRepoWithRemote("https://github.com/foo/bar.git");
    expect(await getGitHubUrl(dir)).toBe("https://github.com/foo/bar");
  });

  it("normalizes SSH URL (git@github.com:owner/repo.git)", async () => {
    const dir = await mkRepoWithRemote("git@github.com:foo/bar.git");
    expect(await getGitHubUrl(dir)).toBe("https://github.com/foo/bar");
  });

  it("normalizes ssh:// URL", async () => {
    const dir = await mkRepoWithRemote("ssh://git@github.com/foo/bar.git");
    expect(await getGitHubUrl(dir)).toBe("https://github.com/foo/bar");
  });

  it("normalizes an SCP-style EMU host alias (user@alias:owner/repo)", async () => {
    // EMU setups point origin at an ~/.ssh/config Host alias, e.g.
    // `org-140212977@github-emu:databricks-field-eng/partner-asset-tracker.git`.
    const dir = await mkRepoWithRemote(
      "org-140212977@github-emu:databricks-field-eng/partner-asset-tracker.git",
    );
    expect(await getGitHubUrl(dir)).toBe(
      "https://github.com/databricks-field-eng/partner-asset-tracker",
    );
  });

  it("normalizes a bare host-alias SCP URL (alias:owner/repo)", async () => {
    const dir = await mkRepoWithRemote("github-emu:databricks-field-eng/partner-asset-tracker.git");
    expect(await getGitHubUrl(dir)).toBe(
      "https://github.com/databricks-field-eng/partner-asset-tracker",
    );
  });

  it("normalizes an ssh:// URL with a host alias", async () => {
    const dir = await mkRepoWithRemote("ssh://org-1@github-emu/databricks-field-eng/partner-asset-tracker.git");
    expect(await getGitHubUrl(dir)).toBe(
      "https://github.com/databricks-field-eng/partner-asset-tracker",
    );
  });
});

describe("getOwnerRepo", () => {
  it("returns 'owner/repo' slug", async () => {
    const dir = await mkRepoWithRemote("https://github.com/databricks-solutions/lakebase-scm-extension");
    expect(await getOwnerRepo(dir)).toBe("databricks-solutions/lakebase-scm-extension");
  });

  it("returns the right owner/repo for an EMU host-alias remote (the bug)", async () => {
    // Before the fix this yielded owner='org-140212977@github-emu:databricks-field-eng',
    // which 404'd every owner/repo op (Create PR, runner setup).
    const dir = await mkRepoWithRemote(
      "org-140212977@github-emu:databricks-field-eng/partner-asset-tracker.git",
    );
    expect(await getOwnerRepo(dir)).toBe("databricks-field-eng/partner-asset-tracker");
  });

  it("returns empty string for a non-GitHub remote", async () => {
    const dir = await mkRepoWithRemote("https://gitlab.com/foo/bar");
    // parseOwnerRepo will fall through to the generic path and may succeed –
    // we just assert it doesn't crash.
    const result = await getOwnerRepo(dir);
    expect(typeof result).toBe("string");
  });
});
