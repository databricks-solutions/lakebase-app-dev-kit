// Contract test: the driver's emitted experiment-CLI commands are COMPLETE.
//
// The deterministic driver (commandsForAction) emits `lakebase-sftdd-experiment`
// CLI invocations; the CLI (story-experiment.cli) validates required args. A
// previous e2e tested experiment.ts DIRECTLY, so the driver->CLI glue was never
// checked and a `cut` command missing --slug/--branch/--parent/--instance
// shipped (the live smoke caught it, not the suite). This test closes that gap:
// it runs the driver's ACTUAL emitted args through the CLI's OWN validator
// (validateExperimentArgs, the same function main() calls), no DB, no module
// shortcut. If the driver emits an incomplete command, this fails here.

import { describe, it, expect } from "vitest";
import { commandsForAction, type DriveEffectsConfig } from "../../scripts/sftdd/orchestrator-effects";
import { parseExperimentArgs, validateExperimentArgs } from "../../scripts/sftdd/experiment-args";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive";

const EXPERIMENT_BIN = "lakebase-sftdd-experiment";

function cfg(over: Partial<DriveEffectsConfig> = {}): DriveEffectsConfig {
  return {
    projectDir: "/p",
    sftddDir: "/p/.tdd",
    featureId: "F1-file-bug",
    runner: { async run() {} },
    modelForRole: () => "sonnet",
    approver: "human-proxy",
    // What drive.cli resolves from SCM state for a claimed feature:
    instance: "lb-project-123",
    featureBranch: "feature/file-bug",
    ...over,
  };
}

/** The args of the single lakebase-sftdd-experiment command the action emits. */
function experimentArgs(action: WorkflowAction, c: DriveEffectsConfig): string[] {
  const cmd = commandsForAction(action, c).find(
    (x): x is { kind: "cli"; bin: string; args: string[] } => x.kind === "cli" && x.bin === EXPERIMENT_BIN,
  );
  if (!cmd) throw new Error(`no ${EXPERIMENT_BIN} command emitted for ${action.kind}`);
  return cmd.args;
}

describe("driver -> experiment CLI contract (the shipped path, not the module)", () => {
  it("cut-experiment emits a command the experiment CLI accepts", () => {
    const args = experimentArgs({ kind: "cut-experiment", story: "S1-create-bug-form" }, cfg());
    expect(args[0]).toBe("cut");
    // Validate through the CLI's OWN required-arg contract.
    expect(validateExperimentArgs(parseExperimentArgs(args))).toBeNull();
    // A first cut does NOT re-fork (nothing stale to reset).
    expect(args).not.toContain("--reset-stale-branch");
    expect(parseExperimentArgs(args).resetStaleBranch).toBeUndefined();
  });

  it("a RE-cut (resetStaleBranch) emits --reset-stale-branch the CLI parses (Finding 27)", () => {
    const args = experimentArgs({ kind: "cut-experiment", story: "S1-create-bug-form", resetStaleBranch: true }, cfg());
    expect(args[0]).toBe("cut");
    expect(args).toContain("--reset-stale-branch");
    const parsed = parseExperimentArgs(args);
    expect(parsed.resetStaleBranch).toBe(true);
    expect(validateExperimentArgs(parsed)).toBeNull();
  });

  it("accept emits pipeline accept (which performs the merge), NOT an experiment CLI command (FEIP-8013)", () => {
    // The driver no longer emits `experiment merge` for accept: `pipeline accept`
    // performs the merge itself, resolving the experiment branch + slug from the
    // record `cut` persisted (so cut and merge agree BY CONSTRUCTION, verified in
    // sftdd-experiment-merge.test.ts). The explicit-args `experiment merge` CLI
    // stays as the recovery door, just not emitted here.
    const cmds = commandsForAction({ kind: "accept", story: "S1-create-bug-form" }, cfg());
    expect(cmds.some((x) => (x as { bin?: string }).bin === EXPERIMENT_BIN)).toBe(false);
    const accept = cmds.find(
      (x): x is { kind: "cli"; bin: string; args: string[] } => x.kind === "cli" && x.bin === "lakebase-sftdd-pipeline",
    );
    expect(accept?.args[0]).toBe("accept");
    // The instance + project-dir the merge needs are supplied by the orchestrator.
    expect(accept?.args).toContain("--instance");
    expect(accept?.args).toContain("--project-dir");
  });

  it("reproduces the live failure: without the resolved feature branch + instance the command is REJECTED", () => {
    // This is exactly the bug the smoke hit: the driver had no feature branch /
    // instance, so the emitted `cut` failed the CLI's required-arg check. The
    // contract test makes that a hermetic failure, not a live-only one.
    const args = experimentArgs(
      { kind: "cut-experiment", story: "S1-create-bug-form" },
      cfg({ featureBranch: undefined, instance: undefined }),
    );
    expect(validateExperimentArgs(parseExperimentArgs(args))).not.toBeNull();
  });
});
