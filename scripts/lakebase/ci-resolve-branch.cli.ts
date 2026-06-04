#!/usr/bin/env node
// CLI for resolveCiBranch. Output is byte-compatible with the legacy
// templates/.../scripts/ci/resolve-lakebase-branch.sh so existing GH
// Actions YAML steps that `eval $(...)` or write to $GITHUB_ENV keep
// working unchanged.

import * as fs from "node:fs";
import { resolveCiBranch } from "./ci-resolve-branch.js";

interface ParsedArgs {
  gitBranch?: string;
  lakebaseName?: string;
  createFrom?: string;
  recreateOnSourceMismatch?: boolean;
  ensureEndpoint?: boolean;
  githubEnv?: boolean;
  database?: string;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--git-branch":
        out.gitBranch = argv[++i];
        break;
      case "--lakebase-name":
        out.lakebaseName = argv[++i];
        break;
      case "--create-from":
        out.createFrom = argv[++i];
        break;
      case "--recreate-on-source-mismatch":
        out.recreateOnSourceMismatch = true;
        break;
      case "--ensure-endpoint":
        out.ensureEndpoint = true;
        break;
      case "--github-env":
        out.githubEnv = true;
        break;
      case "--database":
        out.database = argv[++i];
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        process.stderr.write(`Unknown flag: ${a}\n`);
        process.exit(2);
    }
  }
  return out;
}

const HELP = `lakebase-ci-resolve-branch – resolve a CI Lakebase branch + endpoint + credentials

Usage:
  lakebase-ci-resolve-branch --git-branch <name> [flags]
  lakebase-ci-resolve-branch --lakebase-name <name> [flags]

Flags:
  --git-branch <name>          Git branch (main/master/staging/feature/x/ci-pr-N/...)
  --lakebase-name <name>       Skip mapping; use this exact Lakebase branch name
  --create-from <parent>       Create the Lakebase branch from <parent>'s Lakebase
                               clone if it doesn't exist. No-op if branch exists.
  --recreate-on-source-mismatch
                               If the branch exists but was forked from a different
                               source than --create-from asks for, delete and re-fork.
                               Intended for disposable CI branches (ci-pr-*).
  --ensure-endpoint            Create the primary endpoint if it doesn't exist.
  --github-env                 Append vars to $GITHUB_ENV (heredoc for secrets)
                               AND emit NON-SECRET KEY='value' to stdout for the
                               caller to \`eval\` within the same step.
  --database <name>            Database name (default: databricks_postgres).

Requires:
  LAKEBASE_PROJECT_ID env (project id; the CLI inherits this).
  Authenticated databricks CLI on PATH (DATABRICKS_HOST/DATABRICKS_TOKEN or .databrickscfg).

Outputs (KEY='value' shell-eval form, with --github-env also written to \$GITHUB_ENV):
  LAKEBASE_BRANCH_NAME    – e.g. "production" / "feature-foo" / "ci-pr-42"
  LAKEBASE_BRANCH_PATH    – projects/<id>/branches/<name>
  LAKEBASE_BRANCH_STATUS  – CREATED | EXISTS | VERIFIED | RECREATED | UNVERIFIED
  LAKEBASE_BRANCH_SOURCE  – the actual source branch leaf (or empty)
  LAKEBASE_HOST           – endpoint hostname
  LAKEBASE_USERNAME       – user email (OAuth "user" for psql)
  LAKEBASE_PASSWORD       – OAuth token (secret)
  DATABASE_URL            – postgresql:// URL with embedded creds
  JDBC_URL                – jdbc:postgresql:// URL (no creds)
`;

function escapeSingleQuotes(s: string): string {
  // Shell-eval lines use single-quoted values. A literal ' inside the
  // value must be escaped as '\'' (close-quote, escaped-quote, reopen).
  return s.replace(/'/g, "'\\''");
}

function emitEvalLine(key: string, value: string): string {
  return `${key}='${escapeSingleQuotes(value)}'\n`;
}

function emitGithubEnvScalar(key: string, value: string): string {
  return `${key}=${value}\n`;
}

function emitGithubEnvHeredoc(key: string, value: string): string {
  // GH Actions heredoc syntax: KEY<<DELIM \n value \n DELIM. Must use a
  // delimiter that cannot appear in the value. __LB_PW_EOF__ matches the
  // legacy shell's choice so existing parsers / docs remain valid.
  return `${key}<<__LB_PW_EOF__\n${value}\n__LB_PW_EOF__\n`;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const instance = process.env.LAKEBASE_PROJECT_ID;
  if (!instance) {
    process.stderr.write(
      "lakebase-ci-resolve-branch: LAKEBASE_PROJECT_ID env not set\n"
    );
    return 2;
  }
  if (!args.gitBranch && !args.lakebaseName) {
    process.stderr.write(
      "lakebase-ci-resolve-branch: --git-branch or --lakebase-name required\n"
    );
    return 2;
  }

  const result = await resolveCiBranch({
    instance,
    gitBranch: args.gitBranch,
    lakebaseName: args.lakebaseName,
    createFrom: args.createFrom,
    recreateOnSourceMismatch: args.recreateOnSourceMismatch,
    ensureEndpoint: args.ensureEndpoint,
    database: args.database,
  });

  if (args.githubEnv) {
    const ghEnvFile = process.env.GITHUB_ENV;
    if (!ghEnvFile) {
      process.stderr.write(
        "lakebase-ci-resolve-branch: --github-env set but GITHUB_ENV env is empty\n"
      );
      return 2;
    }
    // Write everything (incl. secrets) to $GITHUB_ENV. Heredoc-wrap any
    // value that could contain newlines (tokens minted via PAT can be
    // single-line, but the OAuth user-token spec allows for arbitrary
    // payloads; heredoc is safe regardless).
    const ghEnvLines =
      emitGithubEnvScalar("LAKEBASE_BRANCH_NAME", result.lakebaseName) +
      emitGithubEnvScalar("LAKEBASE_BRANCH_PATH", result.branchPath) +
      emitGithubEnvScalar("LAKEBASE_BRANCH_STATUS", result.status) +
      emitGithubEnvScalar("LAKEBASE_BRANCH_SOURCE", result.source) +
      emitGithubEnvScalar("LAKEBASE_HOST", result.host) +
      emitGithubEnvScalar("LAKEBASE_USERNAME", result.email) +
      emitGithubEnvHeredoc("LAKEBASE_PASSWORD", result.token) +
      emitGithubEnvScalar("DATABASE_URL", result.databaseUrl) +
      emitGithubEnvScalar("JDBC_URL", result.jdbcUrl) +
      emitGithubEnvScalar("DB_USERNAME", result.email) +
      emitGithubEnvHeredoc("DB_PASSWORD", result.token) +
      emitGithubEnvScalar("SPRING_DATASOURCE_URL", result.jdbcUrl) +
      emitGithubEnvScalar("SPRING_DATASOURCE_USERNAME", result.email) +
      emitGithubEnvHeredoc("SPRING_DATASOURCE_PASSWORD", result.token);
    fs.appendFileSync(ghEnvFile, ghEnvLines, { encoding: "utf8" });

    // Mirror NON-SECRET vars to stdout for the caller to `eval` within
    // the SAME step. Tokens and DATABASE_URL (which embeds the token)
    // stay in $GITHUB_ENV only; they reach downstream steps via GH's
    // env-context masking.
    process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_NAME", result.lakebaseName));
    process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_PATH", result.branchPath));
    process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_STATUS", result.status));
    process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_SOURCE", result.source));
    process.stdout.write(emitEvalLine("LAKEBASE_HOST", result.host));
    process.stdout.write(emitEvalLine("LAKEBASE_USERNAME", result.email));
    process.stdout.write(emitEvalLine("JDBC_URL", result.jdbcUrl));
    return 0;
  }

  // Stdout mode: full set, shell-eval form. Caller does
  //   eval "$(lakebase-ci-resolve-branch ...)"
  process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_NAME", result.lakebaseName));
  process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_PATH", result.branchPath));
  process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_STATUS", result.status));
  process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_SOURCE", result.source));
  process.stdout.write(emitEvalLine("LAKEBASE_HOST", result.host));
  process.stdout.write(emitEvalLine("LAKEBASE_USERNAME", result.email));
  process.stdout.write(emitEvalLine("LAKEBASE_PASSWORD", result.token));
  process.stdout.write(emitEvalLine("DATABASE_URL", result.databaseUrl));
  process.stdout.write(emitEvalLine("JDBC_URL", result.jdbcUrl));
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
);
