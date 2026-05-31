// Live BDD for the lakebase-doctor CLI (FEIP-7330).
//
// Doctor inspects the LOCAL environment (Databricks CLI, auth, .env,
// git remote, hooks) plus the REMOTE Lakebase project. We exercise it
// against a freshly-provisioned project + a synthetic project dir that
// looks like a real Lakebase-paired checkout (.env with the project id,
// .git/ initialized, no hooks). The doctor should report a mix of
// statuses that we can pattern-assert against.
//
// Gating same as branch-cli-live: LAKEBASE_TEST_E2E=1, DATABRICKS_HOST,
// DATABRICKS_CONFIG_PROFILE.

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  createLakebaseProject,
  deleteLakebaseProject,
} from "../../scripts/lakebase/lakebase-project.js";

const E2E = process.env.LAKEBASE_TEST_E2E === "1";
const DATABRICKS_HOST = process.env.DATABRICKS_HOST ?? "";
const DATABRICKS_PROFILE =
  process.env.DATABRICKS_CONFIG_PROFILE ?? "DEFAULT";

function hasCmd(cmd: string): boolean {
  const res = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return res.status === 0;
}
const DATABRICKS_AVAILABLE = E2E ? hasCmd("databricks") : false;
const RUN_SUITE = E2E && DATABRICKS_HOST && DATABRICKS_AVAILABLE;

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DOCTOR_CLI = path.join(
  REPO_ROOT,
  "dist",
  "scripts",
  "lakebase",
  "doctor.cli.js"
);

interface CliResult {
  stdout: string;
  stderr: string;
  status: number | null;
  parsed?: unknown;
}

function runDoctor(args: string[], cwd?: string): CliResult {
  const proc = spawnSync("node", [DOCTOR_CLI, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      DATABRICKS_HOST,
      DATABRICKS_CONFIG_PROFILE: DATABRICKS_PROFILE,
    },
    cwd: cwd ?? REPO_ROOT,
    timeout: 60_000,
  });
  const result: CliResult = {
    stdout: proc.stdout ?? "",
    stderr: proc.stderr ?? "",
    status: proc.status,
  };
  if (args.includes("--json")) {
    try {
      result.parsed = JSON.parse(result.stdout.trim());
    } catch {
      // tested by exit code only when JSON output not requested
    }
  }
  return result;
}

interface CheckResult {
  name: string;
  status: "ok" | "warn" | "fail" | "skip";
  message: string;
  hint?: string;
}
interface DoctorReport {
  overall: "ok" | "warn" | "fail" | "skip";
  checks: CheckResult[];
}

describe.skipIf(!RUN_SUITE)(
  "lakebase-doctor CLI – live E2E (FEIP-7330)",
  () => {
    let projectId: string;
    let paired: string;     // a "good" project dir (env + git + hooks)
    let unpaired: string;   // a "bad" project dir (no .env)
    const tmpDirs: string[] = [];

    beforeAll(async () => {
      projectId = `lbscm-doctor-7330-${Date.now()}`;
      console.log(
        `  [setup] creating Lakebase project ${projectId} on ${DATABRICKS_HOST}`
      );
      await createLakebaseProject({ projectId, host: DATABRICKS_HOST });

      // Synthetic "paired project" directory
      paired = fs.mkdtempSync(path.join(os.tmpdir(), `lbscm-doctor-paired-`));
      tmpDirs.push(paired);
      fs.writeFileSync(
        path.join(paired, ".env"),
        [
          `DATABRICKS_HOST=${DATABRICKS_HOST}`,
          `LAKEBASE_PROJECT_ID=${projectId}`,
          `LAKEBASE_BRANCH_ID=production`,
          `DATABASE_URL=postgresql://stub@host:5432/db`,
        ].join("\n") + "\n"
      );
      // Make it a git repo with an origin remote so the git-remote check
      // returns ok. No hooks installed (the doctor should warn).
      spawnSync("git", ["init", "-b", "main"], { cwd: paired, stdio: "ignore" });
      spawnSync(
        "git",
        ["remote", "add", "origin", "https://github.com/example/test.git"],
        { cwd: paired, stdio: "ignore" }
      );

      // Synthetic "unpaired" dir (no .env, no git)
      unpaired = fs.mkdtempSync(
        path.join(os.tmpdir(), `lbscm-doctor-unpaired-`)
      );
      tmpDirs.push(unpaired);
    }, 300_000);

    afterAll(async () => {
      for (const d of tmpDirs) {
        try {
          fs.rmSync(d, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
      if (projectId) {
        try {
          await deleteLakebaseProject({ projectId, host: DATABRICKS_HOST });
          console.log(`  [teardown] deleted Lakebase project ${projectId}`);
        } catch (err) {
          console.warn(
            `  [teardown] FAILED to delete ${projectId}: ${(err as Error).message}`
          );
        }
      }
    }, 180_000);

    it("`--help` exits 0 and prints usage", () => {
      const r = runDoctor(["--help"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/lakebase-doctor \(FEIP-7330\)/);
    });

    it("--json against a paired project: overall is OK or WARN, all 8 checks present", () => {
      const r = runDoctor(["--json", "--project-dir", paired]);
      expect(r.parsed).toBeDefined();
      const report = r.parsed as DoctorReport;
      expect(["ok", "warn"]).toContain(report.overall);
      expect(report.checks.length).toBe(8);
      const names = report.checks.map((c) => c.name).sort();
      expect(names).toEqual(
        [
          "databricks-auth",
          "databricks-cli",
          "detected-language",
          "env-file",
          "git-hooks",
          "git-remote",
          "lakebase-project",
          "workspace-identity",
        ].sort()
      );
    });

    it("paired project: critical checks are OK", () => {
      const r = runDoctor(["--json", "--project-dir", paired]);
      const report = r.parsed as DoctorReport;
      const by = (n: string) => report.checks.find((c) => c.name === n)!;
      expect(by("databricks-cli").status).toBe("ok");
      expect(by("databricks-auth").status).toBe("ok");
      expect(by("workspace-identity").status).toBe("ok");
      expect(by("env-file").status).toBe("ok");
      expect(by("lakebase-project").status).toBe("ok");
      expect(by("git-remote").status).toBe("ok");
    });

    it("paired project: hooks check WARNS (no hooks installed on synthetic dir)", () => {
      const r = runDoctor(["--json", "--project-dir", paired]);
      const report = r.parsed as DoctorReport;
      const hooks = report.checks.find((c) => c.name === "git-hooks")!;
      expect(hooks.status).toBe("warn");
      expect(hooks.message).toMatch(/Missing/);
    });

    it("unpaired project: env-file FAILS or WARNS, exit code 1 or 2", () => {
      const r = runDoctor(["--json", "--project-dir", unpaired]);
      expect([1, 2]).toContain(r.status);
      const report = r.parsed as DoctorReport;
      const env = report.checks.find((c) => c.name === "env-file")!;
      expect(["warn", "fail"]).toContain(env.status);
    });

    it("human-readable output (no --json) renders a table + Overall line", () => {
      const r = runDoctor(["--project-dir", paired]);
      expect(r.stdout).toMatch(/\[\s*(OK|WARN|FAIL|SKIP)\s*\]/);
      expect(r.stdout).toMatch(/databricks-cli/);
      expect(r.stdout).toMatch(/Overall: (OK|WARN|FAIL)/);
    });

    it("exit codes: 0 on OK, 1 on WARN, 2 on FAIL", () => {
      const okR = runDoctor(["--json", "--project-dir", paired]);
      const okReport = okR.parsed as DoctorReport;
      if (okReport.overall === "ok") expect(okR.status).toBe(0);
      else if (okReport.overall === "warn") expect(okR.status).toBe(1);
      else if (okReport.overall === "fail") expect(okR.status).toBe(2);

      // Unpaired guaranteed non-OK
      const badR = runDoctor(["--json", "--project-dir", unpaired]);
      expect([1, 2]).toContain(badR.status);
    });
  }
);

describe("lakebase-doctor CLI – build artifact", () => {
  it("bin exists at the package.json#bin path", async () => {
    const fs = await import("node:fs");
    expect(fs.existsSync(DOCTOR_CLI)).toBe(true);
  });
});
