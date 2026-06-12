// Project-level architecture conventions: the FIRST service-backed feature's
// layer layout becomes the project canon (deterministically projected from its
// architecture.json), persisted under .tdd/architecture/conventions.json, and
// HARD-conformed by every later feature so F2 cannot remap app/services ->
// app/logic and diverge from the code it inherited from F1.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  readConventions,
  conventionsReady,
  deriveConventions,
  establishConventionsIfAbsent,
  assertArchitectureConforms,
  type ArchitectureConventions,
} from "../../scripts/tdd/architecture-conventions.js";

let tdd: string;
const NOW = () => new Date("2026-06-12T00:00:00.000Z");

const LAYERED_ARCH = JSON.stringify({
  service_backed: true,
  layers: [
    { role: "boundary", module: "app/routes/", renders_via: "jinja2" },
    { role: "service", module: "app/services/" },
    { role: "repository", module: "app/repositories/" },
  ],
});

function writeArch(featureId: string, content: string): void {
  const dir = join(tdd, "features", featureId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "architecture.json"), content);
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-arch-conv-"));
});
afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("deriveConventions: project the canonical layout from architecture.json", () => {
  it("projects service_backed + role->module (trailing slash normalized) + renders_via", () => {
    const c = deriveConventions(LAYERED_ARCH, "F1-file-bug", NOW)!;
    expect(c.established_by).toBe("F1-file-bug");
    expect(c.service_backed).toBe(true);
    expect(c.layers).toEqual([
      { role: "boundary", module: "app/routes", renders_via: "jinja2" },
      { role: "service", module: "app/services" },
      { role: "repository", module: "app/repositories" },
    ]);
  });

  it("returns undefined for a non-service-backed feature (nothing to pin)", () => {
    expect(deriveConventions(JSON.stringify({ service_backed: false }), "F1", NOW)).toBeUndefined();
  });

  it("returns undefined for a service-backed feature with no layers", () => {
    expect(deriveConventions(JSON.stringify({ service_backed: true, layers: [] }), "F1", NOW)).toBeUndefined();
  });

  it("returns undefined for invalid JSON", () => {
    expect(deriveConventions("not json", "F1", NOW)).toBeUndefined();
  });
});

describe("establishConventionsIfAbsent: first service-backed feature sets the canon, idempotently", () => {
  it("establishes from the feature's architecture.json when none exist", () => {
    writeArch("F1-file-bug", LAYERED_ARCH);
    expect(conventionsReady(tdd)).toBe(false);
    const r = establishConventionsIfAbsent(tdd, "F1-file-bug", NOW);
    expect(r.established).toBe(true);
    expect(conventionsReady(tdd)).toBe(true);
    expect(readConventions(tdd)?.established_by).toBe("F1-file-bug");
  });

  it("is a no-op once conventions exist (later features inherit, never overwrite)", () => {
    writeArch("F1-file-bug", LAYERED_ARCH);
    establishConventionsIfAbsent(tdd, "F1-file-bug", NOW);
    // F2 has a DIFFERENT layout, but it must not clobber the established canon.
    writeArch("F2-other", JSON.stringify({ service_backed: true, layers: [{ role: "service", module: "app/logic/" }] }));
    const r = establishConventionsIfAbsent(tdd, "F2-other", NOW);
    expect(r.established).toBe(false);
    expect(readConventions(tdd)?.established_by).toBe("F1-file-bug"); // unchanged
  });

  it("is a no-op for a non-service-backed first feature (waits for one that pins a layout)", () => {
    writeArch("F1-trivial", JSON.stringify({ service_backed: false }));
    const r = establishConventionsIfAbsent(tdd, "F1-trivial", NOW);
    expect(r.established).toBe(false);
    expect(conventionsReady(tdd)).toBe(false);
  });
});

describe("assertArchitectureConforms (HARD): later feature must reuse the established layout", () => {
  const conventions: ArchitectureConventions = deriveConventions(LAYERED_ARCH, "F1-file-bug", NOW)!;

  it("passes when the feature realizes every established role at the same module", () => {
    // Same layout + an extra (allowed) layer.
    const arch = JSON.stringify({
      service_backed: true,
      layers: [
        { role: "boundary", module: "app/routes" },
        { role: "service", module: "app/services" },
        { role: "repository", module: "app/repositories" },
        { role: "policy", module: "app/policies" },
      ],
    });
    expect(assertArchitectureConforms(conventions, arch)).toEqual({ ok: true });
  });

  it("FLAGS a remapped module (app/services -> app/logic)", () => {
    const arch = JSON.stringify({
      service_backed: true,
      layers: [
        { role: "boundary", module: "app/routes" },
        { role: "service", module: "app/logic" },
        { role: "repository", module: "app/repositories" },
      ],
    });
    const r = assertArchitectureConforms(conventions, arch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/remaps the service layer.*app\/logic.*app\/services/);
  });

  it("FLAGS a dropped established role", () => {
    const arch = JSON.stringify({
      service_backed: true,
      layers: [
        { role: "boundary", module: "app/routes" },
        { role: "service", module: "app/services" },
      ],
    });
    const r = assertArchitectureConforms(conventions, arch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/does not realize the established repository layer/);
  });

  it("FLAGS a divergent rendering framework", () => {
    const arch = JSON.stringify({
      service_backed: true,
      layers: [
        { role: "boundary", module: "app/routes", renders_via: "react" },
        { role: "service", module: "app/services" },
        { role: "repository", module: "app/repositories" },
      ],
    });
    const r = assertArchitectureConforms(conventions, arch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/renders the boundary layer via "react".*pins "jinja2"/);
  });

  it("EXEMPTS a non-service-backed later feature (inherits no layout obligation)", () => {
    expect(assertArchitectureConforms(conventions, JSON.stringify({ service_backed: false }))).toEqual({ ok: true });
  });
});
