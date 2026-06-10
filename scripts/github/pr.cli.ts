#!/usr/bin/env node
// CLI for the GitHub PR primitives (P0.2). Subcommands:
//   lakebase-pr open --owner-repo o/r --head h --title t --body b [--base b]
//   lakebase-pr merge --owner-repo o/r --pull-number N [--method merge|squash|rebase] [--keep-remote]
//   lakebase-pr merge-paired --owner-repo o/r --pull-number N --instance proj-x [...]
//   lakebase-pr status --owner-repo o/r --pull-number N
//   lakebase-pr files --owner-repo o/r --pull-number N
//   lakebase-pr reviews --owner-repo o/r --pull-number N
//   lakebase-pr comments --owner-repo o/r --pull-number N
//
// Prints JSON on stdout, errors on stderr.

import {
  createPullRequest,
  getPullRequest,
  getPullRequestReviews,
  getPullRequestFiles,
  getPullRequestComments,
  mergePullRequest,
  mergePairedPullRequest,
} from "./pr.js";

interface ParsedArgs {
  subcommand?: string;
  ownerRepo?: string;
  head?: string;
  base?: string;
  title?: string;
  body?: string;
  pullNumber?: number;
  method?: "merge" | "squash" | "rebase";
  keepRemote?: boolean;
  instance?: string;
  keepLakebase?: boolean;
  pretty?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  if (argv.length === 0) return out;
  // If the first arg is a flag (--help / -h), skip subcommand assignment.
  let startIdx = 0;
  if (!argv[0].startsWith("-")) {
    out.subcommand = argv[0];
    startIdx = 1;
  }
  for (let i = startIdx; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--owner-repo":
        out.ownerRepo = argv[++i];
        break;
      case "--head":
        out.head = argv[++i];
        break;
      case "--base":
        out.base = argv[++i];
        break;
      case "--title":
        out.title = argv[++i];
        break;
      case "--body":
        out.body = argv[++i];
        break;
      case "--pull-number":
      case "--pr":
        out.pullNumber = parseInt(argv[++i], 10);
        break;
      case "--method":
        out.method = argv[++i] as "merge" | "squash" | "rebase";
        break;
      case "--keep-remote":
        out.keepRemote = true;
        break;
      case "--instance":
        out.instance = argv[++i];
        break;
      case "--keep-lakebase":
        out.keepLakebase = true;
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

const HELP = `lakebase-pr

Subcommands:
  open          Create a new PR (returns html_url)
  merge         Merge a PR via GitHub REST API (delete remote head by default)
  merge-paired  Merge a PR + delete the matching Lakebase feature branch
  status        Show PR state + checks + counts (looks up by --head, JSON)
  files         List PR file changes (by --pull-number)
  reviews       List PR reviews (by --pull-number)
  comments      List PR issue-level comments (by --pull-number)

Common flags:
  --owner-repo <o/r>     GitHub repo slug (required)
  --pull-number <N>      PR number (required for merge/merge-paired/status/files/reviews/comments)
  --pretty               Pretty-print JSON output

Open-specific:
  --head <branch>        Head branch (required)
  --title <text>         PR title (required)
  --body <text>          PR body (required)
  --base <branch>        Base branch (default: repo default branch)

Merge-specific:
  --method <m>           "merge" | "squash" | "rebase" (default: merge)
  --keep-remote          Keep the remote head branch after merge (default: delete)

merge-paired (Lakebase feature-branch cleanup as well as git):
  --instance <id>        Lakebase project id (required)
  --keep-lakebase        Skip Lakebase branch deletion (default: delete)

Authentication:
  Uses the same GitHub auth pipeline as lakebase-github-token (PAT from
  GITHUB_TOKEN env var, or gh-cli token, or workspace secret).

Examples:
  lakebase-pr open --owner-repo o/r --head feat/x --title "feat: x" --body "..."
  lakebase-pr status --owner-repo o/r --pull-number 42 --pretty
  lakebase-pr merge --owner-repo o/r --pull-number 42 --method squash
  lakebase-pr merge-paired --owner-repo o/r --pull-number 42 --instance proj-x
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
      case "open": {
        if (
          !requireFlags("open", args, [
            "ownerRepo",
            "head",
            "title",
            "body",
          ])
        )
          return 2;
        const url = await createPullRequest({
          ownerRepo: args.ownerRepo!,
          headBranch: args.head!,
          baseBranch: args.base,
          title: args.title!,
          body: args.body!,
        });
        printJson({ url }, pretty);
        return 0;
      }

      case "merge": {
        if (!requireFlags("merge", args, ["ownerRepo", "pullNumber"]))
          return 2;
        const message = await mergePullRequest({
          ownerRepo: args.ownerRepo!,
          pullNumber: args.pullNumber!,
          method: args.method,
          deleteRemoteBranch: !args.keepRemote,
        });
        printJson({ message }, pretty);
        return 0;
      }

      case "merge-paired": {
        if (
          !requireFlags("merge-paired", args, [
            "ownerRepo",
            "pullNumber",
            "instance",
          ])
        )
          return 2;
        const result = await mergePairedPullRequest({
          ownerRepo: args.ownerRepo!,
          pullNumber: args.pullNumber!,
          lakebaseInstance: args.instance!,
          method: args.method,
          deleteRemoteBranch: !args.keepRemote,
          deleteLakebaseBranch: !args.keepLakebase,
        });
        printJson(result, pretty);
        return 0;
      }

      case "status": {
        // status looks up by head branch (matches the substrate
        // getPullRequest signature, which is branch -> info).
        if (!requireFlags("status", args, ["ownerRepo", "head"])) return 2;
        const info = await getPullRequest(args.ownerRepo!, args.head!);
        if (!info) {
          process.stderr.write(
            `No open PR found for ${args.ownerRepo} head=${args.head}\n`
          );
          return 1;
        }
        printJson(info, pretty);
        return 0;
      }

      case "files": {
        if (!requireFlags("files", args, ["ownerRepo", "pullNumber"]))
          return 2;
        const files = await getPullRequestFiles(
          args.ownerRepo!,
          args.pullNumber!
        );
        printJson(files, pretty);
        return 0;
      }

      case "reviews": {
        if (!requireFlags("reviews", args, ["ownerRepo", "pullNumber"]))
          return 2;
        const reviews = await getPullRequestReviews(
          args.ownerRepo!,
          args.pullNumber!
        );
        printJson(reviews, pretty);
        return 0;
      }

      case "comments": {
        if (!requireFlags("comments", args, ["ownerRepo", "pullNumber"]))
          return 2;
        const comments = await getPullRequestComments(
          args.ownerRepo!,
          args.pullNumber!
        );
        printJson(comments, pretty);
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
