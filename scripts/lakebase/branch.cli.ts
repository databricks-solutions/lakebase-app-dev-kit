#!/usr/bin/env node
// CLI for Lakebase branch lifecycle (FEIP-7331, P0.1).
//
// Wraps the existing branch primitives (branch-utils, branch-create,
// branch-delete, convention-branches, long-running-branch,
// paired-branch) under a single bin: `lakebase-branch <sub> ...`.
//
// Prints JSON on stdout, progress + errors on stderr. Exit codes:
//   0 = success
//   1 = runtime error (CLI failed, branch not found, etc.)
//   2 = usage error (bad / missing args)

import {
  listBranches,
  getBranchByName,
  resolveBranchPath,
} from "./branch-utils.js";
import { createBranch } from "./branch-create.js";
import { deleteBranch } from "./branch-delete.js";
import {
  createFeaturePairedBranch,
  createTestPairedBranch,
  createUatPairedBranch,
  createPerfPairedBranch,
} from "./convention-branches.js";
import {
  createPairedBranch,
  deletePairedBranch,
  checkoutPaired,
  syncEnvToCurrentBranch,
} from "./paired-branch.js";
import { sanitizeBranchName } from "../util/sanitize-branch-name.js";

type Tier = "feature" | "test" | "uat" | "perf";

interface ParsedArgs {
  subcommand?: string;
  tier?: Tier;
  instance?: string;
  branch?: string;
  parentBranch?: string;
  ttl?: string;
  noExpiry?: boolean;
  cwd?: string;
  host?: string;
  database?: string;
  remote?: string;
  noGitBranch?: boolean;
  noSyncEnv?: boolean;
  noGitLocal?: boolean;
  noGitRemote?: boolean;
  strictParent?: boolean;
  allowDefault?: boolean;
  pretty?: boolean;
  help?: boolean;
  // positional after subcommand (used by create-tier)
  positional?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  if (argv.length === 0) return out;
  // If the first arg is a flag (e.g. --help, -h), don't treat it as a
  // subcommand; let the flag-loop catch it and trigger help.
  let i = 0;
  if (!argv[0].startsWith("-")) {
    out.subcommand = argv[0];
    i = 1;
    // Capture an optional positional (e.g. tier name for create-tier)
    if (argv[1] && !argv[1].startsWith("-")) {
      out.positional = argv[1];
      i = 2;
    }
  }
  for (; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--instance":
        out.instance = argv[++i];
        break;
      case "--branch":
        out.branch = argv[++i];
        break;
      case "--parent":
      case "--parent-branch":
        out.parentBranch = argv[++i];
        break;
      case "--ttl":
        out.ttl = argv[++i];
        break;
      case "--no-expiry":
        out.noExpiry = true;
        break;
      case "--cwd":
      case "--project-dir":
        out.cwd = argv[++i];
        break;
      case "--host":
        out.host = argv[++i];
        break;
      case "--database":
        out.database = argv[++i];
        break;
      case "--remote":
        out.remote = argv[++i];
        break;
      case "--no-git-branch":
        out.noGitBranch = true;
        break;
      case "--no-sync-env":
        out.noSyncEnv = true;
        break;
      case "--no-git-local":
        out.noGitLocal = true;
        break;
      case "--no-git-remote":
        out.noGitRemote = true;
        break;
      case "--strict-parent":
        out.strictParent = true;
        break;
      case "--allow-default":
        out.allowDefault = true;
        break;
      case "--pretty":
        out.pretty = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        break;
    }
  }
  return out;
}

const HELP = `lakebase-branch (FEIP-7331)

Subcommands:
  list             List branches on a project
  show             Show one branch (project path, parent, expiration, state)
  create           Create a Lakebase branch (no git side-effects)
  create-paired    Create Lakebase branch + matching git branch + .env update
  create-tier <feature|test|uat|perf>
                   Create a convention-tier Lakebase branch (default fork from staging).
                   No git side-effects; use create-paired-tier for the paired variant.
  create-paired-tier <feature|test|uat|perf>
                   Create the convention-tier PAIRED branch (Lakebase + git + .env)
                   atomically. The canonical way to claim a feature branch:
                   substrate is the only path, convention TTL is applied automatically.
  delete           Delete a Lakebase branch (no git side-effects). Refuses
                   the project's default branch unless --allow-default is set.
  delete-paired    Delete Lakebase branch + local git branch + remote git branch
  checkout-paired  Equivalent of post-checkout hook (sync .env to current git branch)
  sync-env         Refresh .env to point at the current branch's endpoint
  sanitize-name [<input>]
                   Print the kit's canonical sanitization of a git branch name
                   into a Lakebase-safe leaf. Single source of truth for shells
                   that need the mapping (CI / post-checkout / ad-hoc scripts).
                   Input via --branch or the positional after the subcommand.

Common flags:
  --instance <id>          Lakebase project id (required for most subcommands)
  --branch <name>          Branch name (required for most subcommands)
  --host <host>            DATABRICKS_HOST override
  --pretty                 Pretty-print JSON output

create / create-paired / create-tier:
  --parent <name>          Parent branch override
  --ttl <duration>         TTL (e.g. "604800s" for 7 days)
  --no-expiry              Set no_expiry=true (long-running tiers only)
  --strict-parent          (create-tier) Throw if convention's default parent missing

create-paired / delete-paired / checkout-paired / sync-env:
  --cwd <dir>              Project directory (default: process cwd)
  --database <name>        Database name (default: "databricks_postgres")
  --no-git-branch          (create-paired) Skip creating the local git branch
  --no-sync-env            (create-paired) Skip writing .env
  --no-git-local           (delete-paired) Skip deleting the local git branch
  --no-git-remote          (delete-paired) Skip deleting the remote git branch
  --remote <name>          (delete-paired) Git remote name (default: "origin")

Examples:
  lakebase-branch list --instance proj-x
  lakebase-branch show --instance proj-x --branch staging
  lakebase-branch create --instance proj-x --branch feat/foo --parent staging
  lakebase-branch create-paired --instance proj-x --branch feat/foo --cwd .
  lakebase-branch create-tier feature --instance proj-x --branch feat/foo
  lakebase-branch delete --instance proj-x --branch feat/foo
  lakebase-branch delete-paired --instance proj-x --branch feat/foo --cwd .
  lakebase-branch checkout-paired --cwd .
  lakebase-branch sync-env --cwd .
  lakebase-branch sanitize-name feature/foo
  lakebase-branch delete --instance proj-x --branch production --allow-default

Refuses the project's default Lakebase branch under delete (the trunk every
other branch was forked from). Pass --allow-default to override only when
tearing down the entire project.
`;

function printJson(result: unknown, pretty: boolean): void {
  process.stdout.write(
    (pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result)) + "\n"
  );
}

function requireFlags(
  sub: string,
  args: ParsedArgs,
  required: Array<keyof ParsedArgs>
): boolean {
  const missing = required.filter((k) => args[k] === undefined);
  if (missing.length === 0) return true;
  process.stderr.write(
    `${sub}: missing required flag(s): ${missing
      .map((m) => "--" + String(m).replace(/([A-Z])/g, "-$1").toLowerCase())
      .join(", ")}\n`
  );
  return false;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.subcommand) {
    process.stdout.write(HELP);
    return args.help ? 0 : 2;
  }

  const pretty = args.pretty ?? false;

  try {
    switch (args.subcommand) {
      case "list": {
        if (!requireFlags("list", args, ["instance"])) return 2;
        const branches = await listBranches({
          instance: args.instance!,
          host: args.host,
        });
        printJson(branches, pretty);
        return 0;
      }

      case "show": {
        if (!requireFlags("show", args, ["instance", "branch"])) return 2;
        const lookup = { instance: args.instance!, host: args.host };
        const b = await getBranchByName(args.branch!, lookup);
        if (!b) {
          process.stderr.write(`Branch not found: ${args.branch}\n`);
          return 1;
        }
        const path = await resolveBranchPath(args.branch!, lookup);
        printJson({ ...b, projectPath: path }, pretty);
        return 0;
      }

      case "create": {
        if (!requireFlags("create", args, ["instance", "branch"])) return 2;
        const result = await createBranch({
          instance: args.instance!,
          host: args.host,
          branch: args.branch!,
          parentBranch: args.parentBranch,
          ttl: args.ttl,
          noExpiry: args.noExpiry,
        });
        printJson(result, pretty);
        return 0;
      }

      case "create-paired": {
        if (!requireFlags("create-paired", args, ["instance", "branch"]))
          return 2;
        const result = await createPairedBranch({
          instance: args.instance!,
          branch: args.branch!,
          parentBranch: args.parentBranch,
          cwd: args.cwd ?? process.cwd(),
          createGitBranch: !args.noGitBranch,
          syncEnv: !args.noSyncEnv,
          database: args.database,
        });
        printJson(result, pretty);
        return 0;
      }

      // NOTE: the unpaired `create-tier` subcommand was DELETED. It created a
      // Lakebase branch with no git branch + no .env sync. Use
      // `create-paired-tier` (below): every branch is paired through the
      // substrate. There is no unpaired tier-create path by design.

      case "create-paired-tier": {
        // Atomic paired (Lakebase + git + .env) + convention TTL per tier.
        // This is the canonical "claim a feature branch" primitive: every
        // git branch gets a Lakebase branch via the substrate, with the
        // convention TTL (30d feature / 14d test / 14d uat / 7d perf).
        const tier = args.positional as Tier | undefined;
        if (!tier || !["feature", "test", "uat", "perf"].includes(tier)) {
          process.stderr.write(
            `create-paired-tier: expected one of feature|test|uat|perf as the first positional arg.\n`
          );
          return 2;
        }
        if (!requireFlags("create-paired-tier", args, ["instance", "branch"]))
          return 2;
        const common = {
          instance: args.instance!,
          branch: args.branch!,
          parentBranch: args.parentBranch,
          ttl: args.ttl,
          cwd: args.cwd ?? process.cwd(),
          createGitBranch: !args.noGitBranch,
          syncEnv: !args.noSyncEnv,
          database: args.database,
        };
        const result =
          tier === "feature"
            ? await createFeaturePairedBranch(common)
            : tier === "test"
              ? await createTestPairedBranch(common)
              : tier === "uat"
                ? await createUatPairedBranch(common)
                : await createPerfPairedBranch(common);
        printJson(result, pretty);
        return 0;
      }

      case "delete": {
        if (!requireFlags("delete", args, ["instance", "branch"])) return 2;
        await deleteBranch({
          instance: args.instance!,
          host: args.host,
          branch: args.branch!,
          allowDefault: args.allowDefault,
        });
        printJson({ deleted: true, branch: args.branch }, pretty);
        return 0;
      }

      case "delete-paired": {
        if (!requireFlags("delete-paired", args, ["instance", "branch"]))
          return 2;
        const result = await deletePairedBranch({
          instance: args.instance!,
          branch: args.branch!,
          cwd: args.cwd ?? process.cwd(),
          deleteGitLocal: !args.noGitLocal,
          deleteGitRemote: !args.noGitRemote,
          gitRemote: args.remote,
        });
        printJson(result, pretty);
        return 0;
      }

      case "checkout-paired": {
        const result = await checkoutPaired({
          cwd: args.cwd ?? process.cwd(),
          branch: args.branch,
          instance: args.instance,
        });
        printJson(result, pretty);
        return 0;
      }

      case "sync-env": {
        const result = await syncEnvToCurrentBranch({
          cwd: args.cwd ?? process.cwd(),
          instance: args.instance,
          branch: args.branch,
          database: args.database,
        });
        printJson(result, pretty);
        return 0;
      }

      case "sanitize-name": {
        // Print the kit's canonical sanitization of a git branch name
        // into a Lakebase-safe leaf. Single source of truth for shells
        // and CI workflows that need the mapping (post-checkout.sh,
        // ci/resolve-lakebase-branch.sh) without re-implementing it.
        // Input via --branch <name> OR the positional after the subcommand.
        const input = args.branch ?? args.positional;
        if (!input) {
          process.stderr.write(
            "sanitize-name: --branch <name> (or positional) required\n"
          );
          return 2;
        }
        const sanitized = sanitizeBranchName(input);
        if (pretty) {
          printJson({ input, sanitized }, true);
        } else {
          // Default: bare sanitized name on stdout, suitable for shell
          // command-substitution: `LAKEBASE_NAME="$(lakebase-branch sanitize-name "$git_branch")"`.
          process.stdout.write(`${sanitized}\n`);
        }
        return 0;
      }

      default:
        process.stderr.write(
          `Unknown subcommand: ${args.subcommand}\n\n${HELP}`
        );
        return 2;
    }
  } catch (err) {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`
    );
    return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }
);
