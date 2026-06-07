// FEIP-7566: a freshly-created project commits a baseline/placeholder
// migration into every long-living branch's files, but nothing APPLIES it to
// the production database. createProject therefore has to stamp the baseline
// onto the production branch's DB at creation time, BEFORE cutting staging, so
// the tier forks (copy-on-write) inherit it and a later feature migration that
// chains off the baseline applies cleanly instead of mismatching.
//
// applyBaselineMigration is the small service that does that one apply. It is
// injectable so this test is hermetic (no Lakebase). The live FEIP-7422 smoke
// is the end-to-end proof.

import { describe, it, expect, vi } from "vitest";
import { applyBaselineMigration } from "../../scripts/lakebase/baseline-migrate.js";

const baseArgs = {
  instance: "bug-tracker",
  branch: "production",
  projectDir: "/tmp/proj",
  language: "python" as const,
};

describe("applyBaselineMigration", () => {
  it("applies the baseline against the production branch with the project language", async () => {
    const apply = vi.fn().mockResolvedValue({
      applied: [{ version: "001", description: "init placeholder" }],
      alreadyAtLatest: false,
      tool: "alembic",
    });

    const out = await applyBaselineMigration(baseArgs, { apply });

    // It targets the production branch's DB, scoped to the project, with the
    // language passed explicitly (so adapter resolution never has to detect).
    expect(apply).toHaveBeenCalledWith({
      instance: "bug-tracker",
      branch: "production",
      projectDir: "/tmp/proj",
      language: "python",
    });
    expect(out.status).toBe("applied");
    expect(out.applied.map((m) => m.version)).toEqual(["001"]);
    expect(out.tool).toBe("alembic");
  });

  it("reports noop when the branch is already at the latest revision", async () => {
    const apply = vi.fn().mockResolvedValue({
      applied: [],
      alreadyAtLatest: true,
      tool: "alembic",
    });

    const out = await applyBaselineMigration(baseArgs, { apply });

    expect(out.status).toBe("noop");
    expect(out.applied).toEqual([]);
  });

  it("captures an apply failure as an error outcome instead of throwing", async () => {
    const apply = vi.fn().mockRejectedValue(new Error("connection refused"));

    // Project creation must not be aborted by a baseline-apply hiccup; the
    // service swallows the throw and reports it so the caller can warn loudly.
    const out = await applyBaselineMigration(baseArgs, { apply });

    expect(out.status).toBe("error");
    expect(out.message).toMatch(/connection refused/);
    expect(out.applied).toEqual([]);
  });
});
