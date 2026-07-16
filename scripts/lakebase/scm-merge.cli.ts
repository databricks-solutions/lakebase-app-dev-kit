#!/usr/bin/env node
// CLI: ci-green -> merged (phase B+).

import * as path from "node:path";
import { isCliEntry } from "../util/cli-entry.js";
import {
  ScmMergeError,
  mergeFeature,
  type MergeResult,
} from "./scm-merge.js";
import { readWorkflowState } from "./scm-workflow-state.js";
import { runDatabricks } from "./databricks-cli.js";
import { applySchemaMigrations } from "./schema-migrate.js";

interface ParsedArgs {
  projectDir?: string;
  instance?: string;
  switchTo?: string;
  method?: "merge" | "squash" | "rebase";
  skipLocalCleanup?: boolean;
  noWaitMigrate?: boolean;
  migrateTimeoutSec?: number;
  migratePollSec?: number;
  migrateTimeoutNonfatal?: boolean;
  noVerifyMigrateAuth?: boolean;
  noLocalMigrateFallback?: boolean;
  json?: boolean;
  pretty?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--project-dir":
      case "--cwd":
        out.projectDir = argv[++i];
        break;
      case "--instance":
        out.instance = argv[++i];
        break;
      case "--switch-to":
        out.switchTo = argv[++i];
        break;
      case "--method":
        out.method = argv[++i] as "merge" | "squash" | "rebase";
        break;
      case "--skip-local-cleanup":
        out.skipLocalCleanup = true;
        break;
      case "--no-wait-migrate":
        out.noWaitMigrate = true;
        break;
      case "--migrate-timeout-sec":
        out.migrateTimeoutSec = Number.parseInt(argv[++i], 10);
        break;
      case "--migrate-poll-sec":
        out.migratePollSec = Number.parseInt(argv[++i], 10);
        break;
      case "--migrate-timeout-nonfatal":
        out.migrateTimeoutNonfatal = true;
        break;
      case "--no-verify-migrate-auth":
        out.noVerifyMigrateAuth = true;
        break;
      case "--no-local-migrate-fallback":
        out.noLocalMigrateFallback = true;
        break;
      case "--json":
        out.json = true;
        break;
      case "--pretty":
        out.pretty = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
    }
  }
  return out;
}

const HELP = `lakebase-scm-merge (phase B+)

Transition ci-green -> merged: GitHub merge (squash by default),
remote branch delete, Lakebase feature branch delete, local HEAD
switch to parent + local branch delete, state advance to merged.

Usage:
  lakebase-scm-merge [flags]

Flags:
  --project-dir <dir>     Project root (default: cwd)
  --instance <id>         Lakebase project id (default: from state)
  --switch-to <branch>    Branch to checkout after merge (default: parent_branch)
  --method <merge|squash|rebase>
                          GitHub merge method (default: squash)
  --skip-local-cleanup    Skip the local HEAD switch + branch delete
  --no-wait-migrate       Skip waiting for the downstream migrate workflow
                          on parent_branch. Default is to wait (the workflow
                          state is the workflow's success contract).
  --migrate-timeout-sec <n>
                          Migrate poll budget (default: 1800 = 30 minutes)
  --migrate-poll-sec <n>  Seconds between migrate polls (default: 30)
  --migrate-timeout-nonfatal
                          Treat a migrate-poll TIMEOUT as a warning, not an
                          error: the PR already merged + local synced, so a
                          slow/absent downstream-migrate run becomes a warning
                          (migrate.timedOut) and exit 0 instead of failing.
                          A migrate run that COMPLETES with failure is still
                          fatal. Used by fire-and-confirm callers (the TDD
                          orchestrator) so a slow migrate run does not hang the
                          whole drive.
  --no-verify-migrate-auth
                          Skip the pre-merge migrate-auth precondition. Default
                          (when waiting on the migrate) verifies the local
                          Databricks credential is usable BEFORE merging, so an
                          unusable credential fails fast (exit 2) instead of
                          promoting git without the schema (FEIP-8020).
  --no-local-migrate-fallback
                          Skip the local-migrate fallback. Default (when waiting)
                          applies the parent migrations LOCALLY with a fresh token
                          if the downstream migrate does not confirm, so git and
                          Lakebase schema do not diverge (FEIP-8020).
  --json                  Machine-readable JSON output
  --pretty                Pretty-print JSON
  -h, --help              Show this help

Exit codes:
  0 = merged + migrate succeeded (or --no-wait-migrate)
  1 = no state file
  2 = precondition refused (wrong state, missing PR URL / branch fields)
  3 = merge failed (GitHub merge / network)
  4 = downstream migrate failed or timed out (state IS merged)
`;

interface Report {
  ok: boolean;
  result?: MergeResult;
  error?: { code: string; message: string };
}

function renderHuman(r: Report): string {
  if (!r.ok) {
    return `lakebase-scm-merge: ${r.error?.code}\n\n  ${r.error?.message}`;
  }
  const res = r.result!;
  const lines: string[] = ["Merged:"];
  lines.push(`  state                : ${res.state.state}`);
  lines.push(`  merged_at            : ${res.state.merged_at}`);
  lines.push(`  head_after           : ${res.headAfter}`);
  lines.push(`  local_branch_deleted : ${res.localBranchDeleted}`);
  lines.push(`  lakebase_deleted     : ${res.paired.lakebaseBranchDeleted}`);
  lines.push(`  merge_message        : ${res.paired.message}`);
  if (res.migrate) {
    lines.push(
      `  migrate_waited       : ${res.migrate.waited}${res.migrate.waited ? ` (polls=${res.migrate.polls})` : ""}`,
    );
    if (res.migrate.runUrl) {
      lines.push(`  migrate_run_url      : ${res.migrate.runUrl}`);
    }
    if (res.migrate.conclusion) {
      lines.push(`  migrate_conclusion   : ${res.migrate.conclusion}`);
    }
    if (res.migrate.timedOut) {
      lines.push(`  migrate_timed_out    : true (advisory; merge already landed)`);
    }
    if (res.migrate.appliedLocally) {
      lines.push(`  migrate_applied_local: true (downstream migrate unconfirmed; applied parent migrations locally)`);
    }
    if (res.state.migrate_completed_at) {
      lines.push(
        `  migrate_completed_at : ${res.state.migrate_completed_at}`,
      );
    }
  }
  if (res.warnings.length > 0) {
    lines.push("");
    lines.push("warnings:");
    for (const w of res.warnings) lines.push(`  - ${w}`);
  }
  return lines.join("\n");
}

function exitCodeForError(err: Error): number {
  if (err instanceof ScmMergeError) {
    if (err.code === "no-state-file") return 1;
    if (err.code === "merge-failed") return 3;
    if (err.code === "migrate-failed" || err.code === "migrate-timeout") {
      return 4;
    }
    return 2;
  }
  return 3;
}

export async function runScmMergeCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const projectDir = path.resolve(args.projectDir ?? process.cwd());
  const waitMigrate = args.noWaitMigrate ? false : true;
  // Interim mitigation for the short-lived-CI-token failure (FEIP-8020). Wired
  // only when waiting on the migrate + not explicitly disabled.
  // - verifyMigrateAuth: the local Databricks credential is usable (a proxy that
  //   also proves the local-migrate fallback below is viable), run BEFORE merging
  //   so an unusable credential refuses the merge rather than promoting git
  //   without the schema.
  // - localMigrateFallback: apply the parent migrations LOCALLY (fresh token via
  //   the schema-migrate substrate) when the downstream migrate does not confirm.
  const verifyMigrateAuth =
    waitMigrate && !args.noVerifyMigrateAuth
      ? async (): Promise<{ ok: boolean; detail?: string }> => {
          try {
            await runDatabricks(["current-user", "me"], { cwd: projectDir });
            return { ok: true };
          } catch (e) {
            return { ok: false, detail: e instanceof Error ? e.message : String(e) };
          }
        }
      : undefined;
  const localMigrateFallback =
    waitMigrate && !args.noLocalMigrateFallback
      ? async (): Promise<{ ok: boolean; detail?: string }> => {
          const st = readWorkflowState(projectDir);
          const inst = args.instance ?? st?.project_id;
          const parent = st?.parent_branch;
          if (!inst || !parent) {
            return { ok: false, detail: "workflow state is missing project_id / parent_branch" };
          }
          try {
            // allowTier: the local fallback INTENTIONALLY migrates the parent
            // tier (staging/dev/default) as part of promote (FEIP-8039 guard).
            await applySchemaMigrations({ instance: inst, branch: parent, projectDir, allowTier: true });
            return { ok: true, detail: `applied pending migrations to ${parent} locally` };
          } catch (e) {
            return { ok: false, detail: e instanceof Error ? e.message : String(e) };
          }
        }
      : undefined;
  try {
    const result = await mergeFeature({
      projectDir,
      instance: args.instance,
      switchTo: args.switchTo,
      method: args.method,
      skipLocalCleanup: args.skipLocalCleanup,
      waitMigrate,
      migrateTimeoutMs: args.migrateTimeoutSec
        ? args.migrateTimeoutSec * 1000
        : undefined,
      migratePollMs: args.migratePollSec
        ? args.migratePollSec * 1000
        : undefined,
      migrateTimeoutFatal: args.migrateTimeoutNonfatal ? false : undefined,
      verifyMigrateAuth,
      localMigrateFallback,
    });
    const report: Report = { ok: true, result };
    if (args.json) {
      const indent = args.pretty ? 2 : 0;
      process.stdout.write(`${JSON.stringify(report, null, indent)}\n`);
    } else {
      process.stdout.write(`${renderHuman(report)}\n`);
    }
    return 0;
  } catch (e) {
    const err = e as Error;
    const code = err instanceof ScmMergeError ? err.code : "substrate-failure";
    const report: Report = {
      ok: false,
      error: { code, message: err.message },
    };
    if (args.json) {
      const indent = args.pretty ? 2 : 0;
      process.stdout.write(`${JSON.stringify(report, null, indent)}\n`);
    } else {
      process.stderr.write(`${renderHuman(report)}\n`);
    }
    return exitCodeForError(err);
  }
}

if (isCliEntry(import.meta.url)) {
  void runScmMergeCli(process.argv.slice(2)).then((c) => process.exit(c));
}
