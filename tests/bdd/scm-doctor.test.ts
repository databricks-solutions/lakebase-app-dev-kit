// Unit tests for scm-doctor (phase C).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

const mockListBranches = vi.fn();
const mockGetBranchByName = vi.fn();
const mockGetCurrentBranch = vi.fn();
const mockExec = vi.fn();
const mockCreateFeaturePaired = vi.fn();
const mockAbandon = vi.fn();

vi.mock("../../scripts/lakebase/branch-utils.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../scripts/lakebase/branch-utils.js")
  >("../../scripts/lakebase/branch-utils.js");
  return {
    ...actual,
    listBranches: (...args: unknown[]) => mockListBranches(...args),
    getBranchByName: (...args: unknown[]) => mockGetBranchByName(...args),
  };
});
vi.mock("../../scripts/git/inspect.js", () => ({
  getCurrentBranch: (...args: unknown[]) => mockGetCurrentBranch(...args),
  getRepoRoot: vi.fn(),
}));
vi.mock("../../scripts/util/exec.js", () => ({
  exec: (...args: unknown[]) => mockExec(...args),
  shq: (s: string) => `'${s}'`,
}));
vi.mock("../../scripts/lakebase/convention-branches.js", () => ({
  createFeaturePairedBranch: (...args: unknown[]) =>
    mockCreateFeaturePaired(...args),
}));
vi.mock("../../scripts/lakebase/scm-abandon-feature.js", () => ({
  abandonFeatureBranch: (...args: unknown[]) => mockAbandon(...args),
}));

const doctor = await import("../../scripts/lakebase/scm-doctor.js");
const state = await import("../../scripts/lakebase/scm-workflow-state.js");

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scm-doctor-"));
  mockListBranches.mockReset();
  mockGetBranchByName.mockReset();
  mockGetCurrentBranch.mockReset();
  mockExec.mockReset();
  mockCreateFeaturePaired.mockReset();
  mockAbandon.mockReset();
  mockAbandon.mockResolvedValue({
    state: { version: 1, state: "scaffold-complete", tier_topology: 2, project_id: "p" },
    lakebaseDeleted: true,
    gitLocalDeleted: true,
    gitRemoteDeleted: false,
    warnings: [],
  });
  mockExec.mockResolvedValue("");
  mockCreateFeaturePaired.mockResolvedValue({
    branch: { name: "p/branches/feature-x", uid: "br-x" },
    gitBranch: "feature/x",
    gitBranchCreated: false,
    envSynced: true,
    warnings: [],
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function lakebase2Tier() {
  return [
    { name: "p/branches/main", uid: "u-main", isDefault: true },
    { name: "p/branches/staging", uid: "u-staging" },
  ];
}

function writeEnv(projectId: string, branchId?: string): void {
  const lines = [`LAKEBASE_PROJECT_ID=${projectId}`];
  if (branchId) lines.push(`LAKEBASE_BRANCH_ID=${branchId}`);
  fs.writeFileSync(path.join(tmpDir, ".env"), `${lines.join("\n")}\n`);
}

describe("runDoctor", () => {
  it("flags missing workflow-state.json + reaches Lakebase cleanly", async () => {
    writeEnv("p");
    mockListBranches.mockResolvedValue(lakebase2Tier());
    mockGetCurrentBranch.mockResolvedValue("staging");
    const report = await doctor.runDoctor({ projectDir: tmpDir });
    expect(report.workflowStatePresent).toBe(false);
    expect(report.findings.some((f) => f.id === "no-state-file")).toBe(true);
    expect(report.worstSeverity).toBe("fail");
  });

  it("flags tier-topology drift (state=2, lakebase suggests 3)", async () => {
    writeEnv("p", "staging");
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "p",
    });
    mockListBranches.mockResolvedValue([
      ...lakebase2Tier(),
      { name: "p/branches/dev", uid: "u-dev" },
    ]);
    mockGetCurrentBranch.mockResolvedValue("dev");
    const report = await doctor.runDoctor({ projectDir: tmpDir });
    expect(
      report.findings.find((f) => f.id === "tier-topology-mismatch"),
    ).toBeDefined();
    expect(report.worstSeverity).toBe("warn");
  });

  it("flags HEAD on a different branch than workflow says (head-branch-drift)", async () => {
    writeEnv("p", "feature-x");
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "feature-claimed",
      tier_topology: 2,
      project_id: "p",
      feature_id: "x",
      branch: "feature/x",
      parent_branch: "staging",
      lakebase_branch_uid: "br-x",
      claimed_at: "2026-05-01T00:00:00Z",
    });
    mockListBranches.mockResolvedValue([
      ...lakebase2Tier(),
      { name: "p/branches/feature-x", uid: "br-x" },
    ]);
    mockGetBranchByName.mockResolvedValue({
      name: "p/branches/feature-x",
      uid: "br-x",
    });
    mockGetCurrentBranch.mockResolvedValue("staging");
    const report = await doctor.runDoctor({ projectDir: tmpDir });
    expect(
      report.findings.find((f) => f.id === "head-branch-drift"),
    ).toBeDefined();
  });

  it("flags lakebase-pair-missing when feature-claimed but no Lakebase branch", async () => {
    writeEnv("p");
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "feature-claimed",
      tier_topology: 2,
      project_id: "p",
      feature_id: "x",
      branch: "feature/x",
      parent_branch: "staging",
      lakebase_branch_uid: "br-x",
      claimed_at: "2026-05-01T00:00:00Z",
    });
    mockListBranches.mockResolvedValue(lakebase2Tier());
    mockGetBranchByName.mockResolvedValue(undefined);
    mockGetCurrentBranch.mockResolvedValue("feature/x");
    const report = await doctor.runDoctor({ projectDir: tmpDir });
    expect(
      report.findings.find((f) => f.id === "lakebase-pair-missing"),
    ).toBeDefined();
    expect(report.worstSeverity).toBe("fail");
  });

  it("flags orphan current branch when no matching Lakebase pair", async () => {
    writeEnv("p");
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "p",
    });
    mockListBranches.mockResolvedValue(lakebase2Tier());
    mockGetCurrentBranch.mockResolvedValue("feature/sneaky");
    const report = await doctor.runDoctor({ projectDir: tmpDir });
    const orphan = report.findings.find(
      (f) => f.id === "orphan-current-branch",
    );
    expect(orphan).toBeDefined();
    expect(orphan?.severity).toBe("fail");
    expect(orphan?.suggestion).toContain("lakebase-scm-recover-orphans");
  });

  it("clean tree, no findings: worstSeverity=ok", async () => {
    writeEnv("p", "staging");
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "p",
    });
    mockListBranches.mockResolvedValue(lakebase2Tier());
    mockGetCurrentBranch.mockResolvedValue("staging");
    const report = await doctor.runDoctor({ projectDir: tmpDir });
    expect(report.findings).toEqual([]);
    expect(report.worstSeverity).toBe("ok");
  });

  it("clean run after fixing head-branch-drift", async () => {
    writeEnv("p", "feature-x");
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "feature-claimed",
      tier_topology: 2,
      project_id: "p",
      feature_id: "x",
      branch: "feature/x",
      parent_branch: "staging",
      lakebase_branch_uid: "br-x",
      claimed_at: "2026-05-01T00:00:00Z",
    });
    mockListBranches.mockResolvedValue([
      ...lakebase2Tier(),
      { name: "p/branches/feature-x", uid: "br-x" },
    ]);
    mockGetBranchByName.mockResolvedValue({
      name: "p/branches/feature-x",
      uid: "br-x",
    });
    // Before fix: HEAD on staging (drift); after fix: HEAD on feature/x.
    mockGetCurrentBranch
      .mockResolvedValueOnce("staging")
      .mockResolvedValueOnce("feature/x");
    const result = await doctor.fixFinding({
      projectDir: tmpDir,
      findingId: "head-branch-drift",
    });
    expect(result.action).toContain("git checkout");
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining("git checkout 'feature/x'"),
      expect.objectContaining({ cwd: tmpDir }),
    );
    expect(result.postReport.findings).toEqual([]);
  });

  it("refuses --fix when the finding is not present", async () => {
    writeEnv("p");
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "p",
    });
    mockListBranches.mockResolvedValue(lakebase2Tier());
    mockGetCurrentBranch.mockResolvedValue("staging");
    await expect(
      doctor.fixFinding({
        projectDir: tmpDir,
        findingId: "head-branch-drift",
      }),
    ).rejects.toMatchObject({ code: "finding-not-present" });
  });

  it("rejects unsupported finding id", async () => {
    writeEnv("p");
    await expect(
      doctor.fixFinding({
        projectDir: tmpDir,
        findingId: "no-state-file" as never,
      }),
    ).rejects.toMatchObject({ code: "unsupported-finding" });
  });

  it("--fix db-ahead-of-code delegates to abandon(force) to reset the polluted branch (FEIP-8039)", async () => {
    writeEnv("p");
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "feature-claimed",
      tier_topology: 2,
      project_id: "p",
      feature_id: "F2-adjust-stock",
      branch: "feature-f2-adjust-stock",
      parent_branch: "staging",
      lakebase_branch_uid: "br-f2",
      claimed_at: "2026-07-16T00:00:00Z",
    });
    mockListBranches.mockResolvedValue(lakebase2Tier());
    mockGetCurrentBranch.mockResolvedValue("feature-f2-adjust-stock");
    // Inject the finding so we don't need a live alembic read to produce it.
    const report = {
      projectDir: tmpDir,
      workflowStatePresent: true,
      findings: [
        {
          id: "db-ahead-of-code",
          severity: "fail" as const,
          message: "applied revision '20260716070934' has no local migration file",
        },
      ],
      worstSeverity: "fail" as const,
    };
    const result = await doctor.fixFinding({
      projectDir: tmpDir,
      findingId: "db-ahead-of-code",
      report: report as never,
    });
    expect(mockAbandon).toHaveBeenCalledWith(
      expect.objectContaining({ projectDir: tmpDir, force: true }),
    );
    expect(result.action).toMatch(/abandon|reset|re-fork|deleted/i);
  });

  it("flags .env branch drift when LAKEBASE_BRANCH_ID disagrees with state", async () => {
    writeEnv("p", "feature-old");
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "feature-claimed",
      tier_topology: 2,
      project_id: "p",
      feature_id: "new",
      branch: "feature/new",
      parent_branch: "staging",
      lakebase_branch_uid: "br-new",
      claimed_at: "2026-05-01T00:00:00Z",
    });
    mockListBranches.mockResolvedValue([
      ...lakebase2Tier(),
      { name: "p/branches/feature-new", uid: "br-new" },
    ]);
    mockGetBranchByName.mockResolvedValue({
      name: "p/branches/feature-new",
      uid: "br-new",
    });
    mockGetCurrentBranch.mockResolvedValue("feature/new");
    const report = await doctor.runDoctor({ projectDir: tmpDir });
    expect(
      report.findings.find((f) => f.id === "env-branch-drift"),
    ).toBeDefined();
  });
});

// FEIP-8050 / Finding 24: flag CI workflows that hardcode a kit version pin
// instead of resolving .lakebase/kit-ref at runtime, so a kit-ref bump never
// reaches CI.
describe("runDoctor: ci-workflow-kit-pin (Finding 24)", () => {
  function writeWorkflow(name: string, body: string): void {
    const dir = path.join(tmpDir, ".github", "workflows");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }

  it("flags a workflow that hardcodes github:...lakebase-app-dev-kit#v<ver>", async () => {
    writeEnv("p");
    mockListBranches.mockResolvedValue(lakebase2Tier());
    mockGetCurrentBranch.mockResolvedValue("staging");
    writeWorkflow(
      "pr.yml",
      "jobs:\n  x:\n    steps:\n      - run: npx --package=github:databricks-solutions/lakebase-app-dev-kit#v0.3.0-beta.15 lakebase-schema-migrate\n",
    );
    const report = await doctor.runDoctor({ projectDir: tmpDir });
    const f = report.findings.find((x) => x.id === "ci-workflow-kit-pin");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warn");
  });

  it("does NOT flag a workflow that resolves #\"${KIT_REF}\" from .lakebase/kit-ref", async () => {
    writeEnv("p");
    mockListBranches.mockResolvedValue(lakebase2Tier());
    mockGetCurrentBranch.mockResolvedValue("staging");
    writeWorkflow(
      "pr.yml",
      'jobs:\n  x:\n    steps:\n      - run: |\n          KIT_REF="$(tr -d "[:space:]" < .lakebase/kit-ref)"\n      - run: npx --package=github:databricks-solutions/lakebase-app-dev-kit#"${KIT_REF}" lakebase-schema-migrate\n',
    );
    const report = await doctor.runDoctor({ projectDir: tmpDir });
    expect(report.findings.find((x) => x.id === "ci-workflow-kit-pin")).toBeUndefined();
  });
});

describe("runDoctor: scm-state-git-tracked (Finding 28)", () => {
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  };
  function git(...args: string[]): void {
    execFileSync("git", args, { cwd: tmpDir, stdio: "ignore", env: gitEnv });
  }
  function seedState(): void {
    writeEnv("p");
    mockListBranches.mockResolvedValue(lakebase2Tier());
    mockGetCurrentBranch.mockResolvedValue("staging");
    git("init", "-q");
    state.writeWorkflowState(tmpDir, { version: 1, state: "scaffold-complete", tier_topology: 2, project_id: "p" });
  }

  it("flags a git-tracked .lakebase/workflow-state.json (checkout can restore a stale claim)", async () => {
    seedState();
    git("add", "--", ".lakebase/workflow-state.json");
    git("commit", "-q", "-m", "state");
    const report = await doctor.runDoctor({ projectDir: tmpDir });
    const f = report.findings.find((x) => x.id === "scm-state-git-tracked");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warn");
  });

  it("does NOT flag an untracked workflow-state.json", async () => {
    seedState(); // written but never git-added
    const report = await doctor.runDoctor({ projectDir: tmpDir });
    expect(report.findings.find((x) => x.id === "scm-state-git-tracked")).toBeUndefined();
  });
});
