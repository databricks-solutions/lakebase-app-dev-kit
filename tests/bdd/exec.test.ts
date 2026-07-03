import { describe, it, expect } from "vitest";
import { exec } from "../../scripts/util/exec.js";

describe("exec", () => {
  it("returns trimmed stdout for a successful command", async () => {
    const out = await exec("echo hello");
    expect(out).toBe("hello");
  });

  it("rejects with a descriptive error when the command exits non-zero", async () => {
    await expect(exec("false")).rejects.toThrow(/false/);
  });

  it("respects cwd", async () => {
    const out = await exec("pwd", { cwd: "/" });
    expect(out).toBe("/");
  });

  it("respects env", async () => {
    const out = await exec("echo $LAKEBASE_EXEC_TEST_VAR", {
      env: { LAKEBASE_EXEC_TEST_VAR: "xyzzy" },
    });
    expect(out).toBe("xyzzy");
  });

  it("feeds `input` to the child on stdin", async () => {
    // `cat` echoes back exactly what it reads from stdin, proving the value
    // reached the child without appearing anywhere on the command line.
    const out = await exec("cat", { input: "secret-on-stdin" });
    expect(out).toBe("secret-on-stdin");
  });

  it("closes stdin so a stdin-reading command terminates", async () => {
    // Without end()ing stdin, `cat` would block until timeout. A prompt
    // return proves the stream was closed.
    const out = await exec("cat", { input: "" });
    expect(out).toBe("");
  });
});
