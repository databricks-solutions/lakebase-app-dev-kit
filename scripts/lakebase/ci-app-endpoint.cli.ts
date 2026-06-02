#!/usr/bin/env node
// CLI for substrate's CI app endpoint lookup. Used by the scaffolded
// pr.yml to populate LAKEBASE_APP_ENDPOINT in $GITHUB_ENV so the
// project-root Playwright step (FEIP-7094 Phase 2) targets the
// paired-branch deployment instead of a webServer-booted local app.
//
// Output: prints the resolved URL to stdout on success. Exits 0 with
// no output (and a stderr note) when the app does not exist yet, so
// the calling shell can capture the value and only export it when
// non-empty.
//
// GitHub Actions usage (pinned at scaffold time via {{LAKEBASE_KIT_VERSION}}):
//
//   - name: Resolve CI app endpoint
//     env:
//       DATABRICKS_HOST: ${{ secrets.DATABRICKS_HOST }}
//       DATABRICKS_TOKEN: ${{ secrets.DATABRICKS_TOKEN }}
//       DATABRICKS_AUTH_TYPE: pat
//     run: |
//       URL="$(npx --yes \
//         --package=github:databricks-solutions/lakebase-app-dev-kit#v<pin> \
//         lakebase-ci-app-endpoint \
//         --instance "$LAKEBASE_PROJECT_ID" \
//         --branch "ci-pr-${{ github.event.pull_request.number }}")"
//       if [ -n "$URL" ]; then
//         echo "LAKEBASE_APP_ENDPOINT=$URL" >> $GITHUB_ENV
//       fi

import { getCiAppEndpoint } from "./deploy-app-endpoint.js";

interface ParsedArgs {
  instance?: string;
  branch?: string;
  profile?: string;
  appName?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      printHelpAndExit();
    } else if (a === "--instance" && i + 1 < argv.length) {
      parsed.instance = argv[++i];
    } else if (a === "--branch" && i + 1 < argv.length) {
      parsed.branch = argv[++i];
    } else if (a === "--profile" && i + 1 < argv.length) {
      parsed.profile = argv[++i];
    } else if (a === "--app-name" && i + 1 < argv.length) {
      parsed.appName = argv[++i];
    }
  }
  return parsed;
}

function printHelpAndExit(): never {
  process.stdout.write(
    `lakebase-ci-app-endpoint – resolve the deployed Databricks Apps URL for a Lakebase CI branch\n\n` +
      `Usage:\n` +
      `  lakebase-ci-app-endpoint --instance <id> --branch <name> [--profile <p>] [--app-name <name>]\n\n` +
      `Output (stdout):\n` +
      `  The app URL on a single line when the app exists.\n` +
      `  Empty (with a stderr note) when the app does not exist yet.\n\n` +
      `Exit codes:\n` +
      `  0  app resolved, OR app missing (graceful no-op).\n` +
      `  1  bad invocation (missing --instance / --branch) or infrastructure error.\n`,
  );
  process.exit(0);
}

const args = parseArgs(process.argv.slice(2));

if (!args.instance || !args.branch) {
  process.stderr.write(
    `lakebase-ci-app-endpoint: --instance and --branch are required\n`,
  );
  process.exit(1);
}

getCiAppEndpoint({
  instance: args.instance,
  branch: args.branch,
  profile: args.profile,
  appName: args.appName,
})
  .then((result) => {
    if (result.url) {
      process.stdout.write(`${result.url}\n`);
    } else {
      process.stderr.write(
        `lakebase-ci-app-endpoint: app "${result.appName}" does not exist; LAKEBASE_APP_ENDPOINT will remain unset.\n`,
      );
    }
    process.exit(0);
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`lakebase-ci-app-endpoint: ${msg}\n`);
    process.exit(1);
  });
