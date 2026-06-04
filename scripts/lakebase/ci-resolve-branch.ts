// Resolve a Lakebase branch paired with a git branch for CI: ensure the
// branch exists (optionally forked from a known parent), ensure its primary
// endpoint is up, mint credentials, and return a structured result the CLI
// can serialize as either GITHUB_ENV heredoc lines or shell-eval `KEY='value'`
// pairs.
//
// In-process equivalent of templates/.../scripts/ci/resolve-lakebase-branch.sh.
// The shell stays as a 5-line thin wrapper that execs this CLI bin so the
// same logic powers local dev, GH Actions, and the substrate state machine.

import {
  getBranchByName,
  getDefaultBranch,
  listBranches,
  type LakebaseBranchInfo,
} from "./branch-utils.js";
import { createBranch } from "./branch-create.js";
import { deleteBranch } from "./branch-delete.js";
import { ensureEndpoint, getCredential, getEndpoint } from "./branch-endpoint.js";
import { sanitizeBranchName } from "../util/sanitize-branch-name.js";
import { KIT_TIMEOUTS } from "./kit-config.js";

const DEFAULT_DATABASE = "databricks_postgres";

export type ResolveCiBranchStatus =
  | "CREATED"
  | "EXISTS"
  | "VERIFIED"
  | "RECREATED"
  | "UNVERIFIED";

export interface ResolveCiBranchArgs {
  /** Lakebase project id (mirrors shell's LAKEBASE_PROJECT_ID env). */
  instance: string;
  /** Git branch name (main / staging / feature/x / ci-pr-N / ...). */
  gitBranch?: string;
  /**
   * Explicit Lakebase name. Overrides gitBranch mapping. Used by CI for
   * ci-pr-N branches that don't follow the sanitize-branch-name convention.
   */
  lakebaseName?: string;
  /**
   * Optional parent git branch to fork from if the Lakebase branch doesn't
   * exist yet. Without this, a missing branch is a hard error.
   */
  createFrom?: string;
  /**
   * When the existing Lakebase branch's source_branch differs from the
   * resolved parent, delete and re-fork. Intended for disposable CI
   * branches (ci-pr-*). Without this flag, source-mismatch is a hard error.
   */
  recreateOnSourceMismatch?: boolean;
  /** When true, create the primary endpoint if missing. */
  ensureEndpoint?: boolean;
  /** Default: "databricks_postgres". */
  database?: string;
}

export interface ResolveCiBranchResult {
  lakebaseName: string;
  branchPath: string;
  status: ResolveCiBranchStatus;
  /** The actual source branch leaf, or empty string if unknown / not recorded. */
  source: string;
  /** Endpoint host. Empty if endpoint creation was not requested and one doesn't exist (callable error caller should surface). */
  host: string;
  email: string;
  token: string;
  databaseUrl: string;
  jdbcUrl: string;
}

const STATE_MACHINE_DOC = `
Four cases driven by (does the branch exist?) x (was createFrom given?):
  exists=no,  createFrom=no  → hard error (nothing to do)
  exists=no,  createFrom=yes → create + wait. status=CREATED
  exists=yes, createFrom=no  → use as-is, no verification. status=EXISTS
  exists=yes, createFrom=yes → verify source matches. status=VERIFIED on match;
                               RECREATED on mismatch + recreateOnSourceMismatch;
                               hard error on mismatch without that flag;
                               UNVERIFIED when API didn't record source.
`.trim();

/**
 * Map a git branch name to its Lakebase counterpart leaf. main/master resolve
 * to the project's default branch leaf (e.g. "production"); everything else
 * goes through the canonical sanitizer.
 */
async function gitToLakebaseName(
  gitBranch: string,
  branches: LakebaseBranchInfo[],
  instance: string
): Promise<string> {
  if (gitBranch === "main" || gitBranch === "master") {
    const def =
      branches.find((b) => b.isDefault) ??
      (await getDefaultBranch({ instance }));
    if (!def) {
      throw new Error(
        `Could not resolve default Lakebase branch for instance "${instance}"`
      );
    }
    return def.name.split("/branches/").pop() ?? def.uid;
  }
  return sanitizeBranchName(gitBranch);
}

/** Find the recorded source branch leaf for an existing Lakebase branch. Empty when not recorded. */
function describeSourceBranchLeaf(info: LakebaseBranchInfo | undefined): string {
  if (!info) return "";
  // branch-utils parses status.source_branch into sourceBranchId (leaf)
  // and sourceBranchName (full path). Prefer the already-leaf form.
  if (info.sourceBranchId) return info.sourceBranchId;
  if (info.sourceBranchName) {
    return info.sourceBranchName.split("/branches/").pop() ?? info.sourceBranchName;
  }
  return "";
}

async function waitUntilDeleted(
  instance: string,
  name: string,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await getBranchByName(name, { instance });
    if (!info) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(
    `Lakebase branch "${name}" did not propagate delete within ${timeoutMs}ms`
  );
}

async function waitUntilReady(
  instance: string,
  name: string,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "unknown";
  while (Date.now() < deadline) {
    const info = await getBranchByName(name, { instance });
    if (info?.state === "READY") return;
    if (info?.state) last = info.state;
    await new Promise((r) => setTimeout(r, KIT_TIMEOUTS.readyPoll));
  }
  throw new Error(
    `Lakebase branch "${name}" did not reach READY within ${timeoutMs}ms (last state: ${last})`
  );
}

function urlEncodeDsnPart(s: string): string {
  return s
    .replace(/@/g, "%40")
    .replace(/:/g, "%3A")
    .replace(/\//g, "%2F")
    .replace(/\?/g, "%3F")
    .replace(/#/g, "%23");
}

/**
 * Resolve a Lakebase branch for CI usage. See STATE_MACHINE_DOC for the four
 * (exists x createFrom) cases.
 *
 * Throws on:
 *   - Neither gitBranch nor lakebaseName provided
 *   - gitBranch → name mapping fails
 *   - branch missing AND createFrom not given (case 1)
 *   - source mismatch AND recreateOnSourceMismatch not set (case 4)
 *   - endpoint missing AND ensureEndpoint not set
 *   - credential mint fails
 */
export async function resolveCiBranch(
  args: ResolveCiBranchArgs
): Promise<ResolveCiBranchResult> {
  if (!args.gitBranch && !args.lakebaseName) {
    throw new Error(
      "resolveCiBranch: either gitBranch or lakebaseName is required"
    );
  }
  const database = args.database ?? DEFAULT_DATABASE;
  const branches = await listBranches({ instance: args.instance });

  const lakebaseName = args.lakebaseName
    ? args.lakebaseName
    : await gitToLakebaseName(args.gitBranch!, branches, args.instance);
  if (!lakebaseName) {
    throw new Error(
      `Could not map git branch "${args.gitBranch}" to a Lakebase branch name`
    );
  }
  const branchPath = `projects/${args.instance}/branches/${lakebaseName}`;

  // ── 1. State machine: ensure the branch exists from the right source ──
  let status: ResolveCiBranchStatus;
  let source = "";
  const existing = branches.find(
    (b) =>
      b.uid === lakebaseName ||
      b.name === lakebaseName ||
      b.name.endsWith(`/${lakebaseName}`)
  );

  if (!existing) {
    if (!args.createFrom) {
      throw new Error(
        `Lakebase branch "${lakebaseName}" does not exist and createFrom not given`
      );
    }
    const sourceName = await gitToLakebaseName(
      args.createFrom,
      branches,
      args.instance
    );
    if (!sourceName) {
      throw new Error(
        `Could not resolve source branch for createFrom="${args.createFrom}"`
      );
    }
    await createBranch({
      instance: args.instance,
      branch: lakebaseName,
      parentBranch: sourceName,
      noExpiry: true,
    });
    await waitUntilReady(args.instance, lakebaseName, KIT_TIMEOUTS.readyWait);
    status = "CREATED";
    source = sourceName;
  } else if (!args.createFrom) {
    status = "EXISTS";
    source = describeSourceBranchLeaf(existing);
  } else {
    const expected = await gitToLakebaseName(
      args.createFrom,
      branches,
      args.instance
    );
    const actual = describeSourceBranchLeaf(existing);
    source = actual;
    if (!actual) {
      status = "UNVERIFIED";
    } else if (actual === expected) {
      status = "VERIFIED";
    } else if (args.recreateOnSourceMismatch) {
      await deleteBranch({
        instance: args.instance,
        branch: lakebaseName,
        // Disposable CI branches (ci-pr-*) only; never the default.
        allowDefault: false,
      });
      await waitUntilDeleted(
        args.instance,
        lakebaseName,
        KIT_TIMEOUTS.readyWait
      );
      await createBranch({
        instance: args.instance,
        branch: lakebaseName,
        parentBranch: expected,
        noExpiry: true,
      });
      await waitUntilReady(args.instance, lakebaseName, KIT_TIMEOUTS.readyWait);
      status = "RECREATED";
      source = expected;
    } else {
      throw new Error(
        `Lakebase branch "${lakebaseName}" was forked from "${actual}" but parent ` +
          `"${expected}" was requested. Pass recreateOnSourceMismatch=true to delete and re-fork.`
      );
    }
  }

  // ── 2. Endpoint ────────────────────────────────────────────────────────
  let host = "";
  const existingEp = await getEndpoint({
    instance: args.instance,
    branch: lakebaseName,
  });
  if (existingEp?.host) {
    host = existingEp.host;
  } else if (args.ensureEndpoint) {
    const ep = await ensureEndpoint({
      instance: args.instance,
      branch: lakebaseName,
    });
    host = ep.host;
  } else {
    throw new Error(
      `No endpoint for "${lakebaseName}" (pass ensureEndpoint=true to create)`
    );
  }

  // ── 3. Credentials ─────────────────────────────────────────────────────
  const { token, email } = await getCredential({
    instance: args.instance,
    branch: lakebaseName,
  });
  if (!token || !email) {
    throw new Error(
      `Could not mint credentials for "${lakebaseName}" (token or email missing)`
    );
  }

  // ── 4. URLs ────────────────────────────────────────────────────────────
  const encodedUser = urlEncodeDsnPart(email);
  const encodedPass = urlEncodeDsnPart(token);
  const databaseUrl = `postgresql://${encodedUser}:${encodedPass}@${host}:5432/${database}?sslmode=require`;
  const jdbcUrl = `jdbc:postgresql://${host}:5432/${database}?sslmode=require`;

  return {
    lakebaseName,
    branchPath,
    status,
    source,
    host,
    email,
    token,
    databaseUrl,
    jdbcUrl,
  };
}

/** Suppress unused-symbol warning for the state machine doc constant. */
void STATE_MACHINE_DOC;
