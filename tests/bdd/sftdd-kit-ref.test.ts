// Finding 28: the kit-ref RUN PIN. `.lakebase/kit-ref` is git-tracked, so a
// branch checkout (fork-from-origin) reverts an operator's bump mid-run and the
// drive silently runs the wrong kit. The fix pins the run to a gitignored,
// checkout-proof `.lakebase/kit-ref.local` the lk shim reads with precedence.
// Hermetic: pure filesystem, no git, no network.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  committedKitRef,
  localKitRef,
  resolveLaunchKitRef,
  pinRunKitRef,
  kitRefDriftWarning,
} from "../../scripts/sftdd/kit-ref";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kit-ref-"));
  mkdirSync(join(dir, ".lakebase"), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function writeCommitted(ref: string): void {
  writeFileSync(join(dir, ".lakebase", "kit-ref"), ref + "\n");
}
function writeLocal(ref: string): void {
  writeFileSync(join(dir, ".lakebase", "kit-ref.local"), ref + "\n");
}

describe("committedKitRef / localKitRef", () => {
  it("read the trimmed file value, or undefined when absent/empty", () => {
    expect(committedKitRef(dir)).toBeUndefined();
    expect(localKitRef(dir)).toBeUndefined();
    writeCommitted("  v0.3.0-beta.28  ");
    writeLocal("v0.3.0-beta.32");
    expect(committedKitRef(dir)).toBe("v0.3.0-beta.28");
    expect(localKitRef(dir)).toBe("v0.3.0-beta.32");
    writeFileSync(join(dir, ".lakebase", "kit-ref"), "\n  \n");
    expect(committedKitRef(dir)).toBeUndefined();
  });
});

describe("resolveLaunchKitRef precedence (matches the lk shim)", () => {
  it("env LAKEBASE_KIT_REF wins over both files", () => {
    writeCommitted("v0.3.0-beta.28");
    writeLocal("v0.3.0-beta.30");
    expect(resolveLaunchKitRef(dir, { LAKEBASE_KIT_REF: "v0.3.0-beta.32" })).toBe("v0.3.0-beta.32");
  });

  it(".lakebase/kit-ref.local wins over the committed .lakebase/kit-ref", () => {
    writeCommitted("v0.3.0-beta.28");
    writeLocal("v0.3.0-beta.32");
    expect(resolveLaunchKitRef(dir, {})).toBe("v0.3.0-beta.32");
  });

  it("falls back to the committed kit-ref when there is no .local or env", () => {
    writeCommitted("v0.3.0-beta.28");
    expect(resolveLaunchKitRef(dir, {})).toBe("v0.3.0-beta.28");
  });

  it("LAKEBASE_KIT_DIR (a dir override, not a ref) yields no ref to pin", () => {
    writeCommitted("v0.3.0-beta.28");
    expect(resolveLaunchKitRef(dir, { LAKEBASE_KIT_DIR: "/some/kit" })).toBeUndefined();
  });

  it("returns undefined when nothing is pinned (shim would default to main)", () => {
    expect(resolveLaunchKitRef(dir, {})).toBeUndefined();
  });
});

describe("pinRunKitRef writes the checkout-proof .local pin", () => {
  it("creates .lakebase/kit-ref.local with the launch ref", () => {
    const r = pinRunKitRef(dir, "v0.3.0-beta.32");
    expect(r.pinned).toBe(true);
    expect(r.ref).toBe("v0.3.0-beta.32");
    expect(r.previous).toBeUndefined();
    expect(readFileSync(join(dir, ".lakebase", "kit-ref.local"), "utf8").trim()).toBe("v0.3.0-beta.32");
  });

  it("is a no-op when .local already matches", () => {
    writeLocal("v0.3.0-beta.32");
    expect(pinRunKitRef(dir, "v0.3.0-beta.32")).toEqual({ pinned: false, ref: "v0.3.0-beta.32" });
  });

  it("overwrites a differing .local and records the previous value", () => {
    writeLocal("v0.3.0-beta.28");
    const r = pinRunKitRef(dir, "v0.3.0-beta.32");
    expect(r).toEqual({ pinned: true, ref: "v0.3.0-beta.32", previous: "v0.3.0-beta.28" });
  });

  it("creates the .lakebase dir if absent", () => {
    rmSync(join(dir, ".lakebase"), { recursive: true, force: true });
    pinRunKitRef(dir, "v0.3.0-beta.32");
    expect(existsSync(join(dir, ".lakebase", "kit-ref.local"))).toBe(true);
  });
});

describe("kitRefDriftWarning", () => {
  it("warns when the committed ref differs from the pinned run ref (a checkout reverted it)", () => {
    writeCommitted("v0.3.0-beta.28"); // a checkout restored the old committed ref
    const w = kitRefDriftWarning(dir, "v0.3.0-beta.32"); // the run is pinned to .32
    expect(w).toMatch(/kit-ref drift/);
    expect(w).toMatch(/beta\.28/);
    expect(w).toMatch(/beta\.32/);
  });

  it("is silent when the committed ref matches the pinned ref", () => {
    writeCommitted("v0.3.0-beta.32");
    expect(kitRefDriftWarning(dir, "v0.3.0-beta.32")).toBeUndefined();
  });

  it("is silent when there is no committed ref", () => {
    expect(kitRefDriftWarning(dir, "v0.3.0-beta.32")).toBeUndefined();
  });
});
