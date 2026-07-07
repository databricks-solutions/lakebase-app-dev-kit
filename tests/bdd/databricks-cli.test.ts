// databricks-cli wrapper: profile resolution + --profile threading + auth-error classification.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildInvocation,
  classifyDatabricksError,
  DatabricksCliError,
  DatabricksAuthError,
  _resetProfileCache,
} from "../../scripts/lakebase/databricks-cli.js";

let emptyDir: string; // a cwd with no .env, so profile resolution is deterministic
beforeEach(() => {
  _resetProfileCache();
  emptyDir = mkdtempSync(join(tmpdir(), "dbcli-nocfg-"));
});
afterEach(() => rmSync(emptyDir, { recursive: true, force: true }));

describe("buildInvocation: profile resolved one way + threaded explicitly", () => {
  it("threads --profile from an explicit opts.profile (highest precedence)", () => {
    const { argv, profile } = buildInvocation(["postgres", "list-branches", "projects/x", "-o", "json"], {
      profile: "myprof",
      env: { DATABRICKS_CONFIG_PROFILE: "envprof" }, // explicit still wins
    });
    expect(profile).toBe("myprof");
    expect(argv).toEqual(["postgres", "list-branches", "projects/x", "-o", "json", "--profile", "myprof"]);
  });

  it("falls back to env DATABRICKS_CONFIG_PROFILE when no explicit profile", () => {
    const { argv, profile } = buildInvocation(["postgres", "get-branch", "b"], {
      env: { DATABRICKS_CONFIG_PROFILE: "fevm-serverless-stable-ecparr" },
    });
    expect(profile).toBe("fevm-serverless-stable-ecparr");
    expect(argv.slice(-2)).toEqual(["--profile", "fevm-serverless-stable-ecparr"]);
  });

  it("sets DATABRICKS_HOST (trailing slashes trimmed) in the child env", () => {
    const { env } = buildInvocation(["auth", "describe"], {
      host: "https://x.cloud.databricks.com//",
      env: { DATABRICKS_CONFIG_PROFILE: "p" },
    });
    expect(env.DATABRICKS_HOST).toBe("https://x.cloud.databricks.com");
  });

  it("does NOT thread a profile when none is resolvable (no explicit, no env, no .env, no host)", () => {
    const { argv, profile } = buildInvocation(["postgres", "list-branches", "projects/x"], { env: {}, cwd: emptyDir });
    expect(profile).toBeUndefined();
    expect(argv).not.toContain("--profile"); // degrades to the CLI default, unchanged
  });

  it("resolves the profile from the project's .env (the pinned single source) when env is unset", () => {
    writeFileSync(
      join(emptyDir, ".env"),
      "DATABRICKS_HOST=https://x.cloud.databricks.com\nDATABRICKS_CONFIG_PROFILE=fevm-serverless-stable-ecparr\n",
    );
    const { argv, profile } = buildInvocation(["postgres", "list-branches", "projects/x", "-o", "json"], {
      env: {},
      cwd: emptyDir,
    });
    expect(profile).toBe("fevm-serverless-stable-ecparr");
    expect(argv.slice(-2)).toEqual(["--profile", "fevm-serverless-stable-ecparr"]);
  });

  it("never double-adds --profile when the caller already passed one", () => {
    const { argv } = buildInvocation(["auth", "describe", "--profile", "explicit"], {
      env: { DATABRICKS_CONFIG_PROFILE: "envprof" },
    });
    expect(argv.filter((a) => a === "--profile")).toHaveLength(1);
  });
});

describe("classifyDatabricksError: auth failures surface one actionable error", () => {
  const argv = ["postgres", "list-branches", "projects/x", "-o", "json", "--profile", "myprof"];

  it("maps the invalid-refresh-token failure to DatabricksAuthError naming the profile + login command", () => {
    const err = Object.assign(new Error("Command failed"), {
      stderr: "Error: a new access token could not be retrieved because the refresh token is invalid.",
    });
    const mapped = classifyDatabricksError(err, argv, "myprof");
    expect(mapped).toBeInstanceOf(DatabricksAuthError);
    expect(mapped).toBeInstanceOf(DatabricksCliError); // subclass, so old catches still match
    expect(mapped.profile).toBe("myprof");
    expect(mapped.message).toContain("databricks auth login --profile myprof");
  });

  it("maps a non-auth failure to a plain DatabricksCliError preserving the historical message shape", () => {
    const err = Object.assign(new Error("exit 1"), { stderr: "BadRequest: no such branch" });
    const mapped = classifyDatabricksError(err, argv, "myprof");
    expect(mapped).toBeInstanceOf(DatabricksCliError);
    expect(mapped).not.toBeInstanceOf(DatabricksAuthError);
    // Shape branch-create's TTL fallback matches on: "databricks <args> failed: <msg>\nstderr: <stderr>"
    expect(mapped.message).toMatch(/^databricks .+ failed: exit 1\nstderr: BadRequest: no such branch$/);
  });

  it("detects auth failure from the error message alone (no stderr)", () => {
    const err = new Error("401 Unauthorized");
    expect(classifyDatabricksError(err, argv, undefined)).toBeInstanceOf(DatabricksAuthError);
  });

  it("folds stdout into the message when the failure wrote to stdout, not stderr", () => {
    const err = Object.assign(new Error("Command failed"), { stderr: "", stdout: "Error: quota exceeded", code: 1 });
    const mapped = classifyDatabricksError(err, argv, "myprof");
    expect(mapped.message).toContain("stdout: Error: quota exceeded");
    expect(mapped.stderr).toBe("Error: quota exceeded"); // detail preserved for callers matching on it
  });

  it("surfaces the exit code when a failure is silent on both streams (no black box)", () => {
    const err = Object.assign(new Error("Command failed"), { stderr: "", stdout: "", code: 1 });
    const mapped = classifyDatabricksError(err, argv, "myprof");
    expect(mapped.message).toContain("(no stderr/stdout; exit 1)");
  });
});
