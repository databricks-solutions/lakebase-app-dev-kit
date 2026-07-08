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
  });

  it("accept emits a `merge` command the experiment CLI accepts", () => {
    const args = experimentArgs({ kind: "accept", story: "S1-create-bug-form" }, cfg());
    expect(args[0]).toBe("merge");
    expect(validateExperimentArgs(parseExperimentArgs(args))).toBeNull();
  });

  it("cut and merge agree on the experiment branch + slug (same story)", () => {
    const cut = parseExperimentArgs(experimentArgs({ kind: "cut-experiment", story: "S1-create-bug-form" }, cfg()));
    const merge = parseExperimentArgs(experimentArgs({ kind: "accept", story: "S1-create-bug-form" }, cfg()));
    expect(cut.slug).toBe(merge.slug);
    // The branch cut is the branch merged back.
    expect(cut.branch).toBe(merge.experimentBranch);
    expect(cut.parent).toBe(merge.featureBranch);
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
