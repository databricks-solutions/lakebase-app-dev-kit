#!/usr/bin/env node

// scripts/github/auth.ts
import { execFileSync } from "child_process";
var GITHUB_SCOPES = ["repo", "workflow", "delete_repo"];
async function resolveGitHubToken(scopes = GITHUB_SCOPES) {
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const fromVsCode = await tryVsCodeSession({ scopes });
  if (fromVsCode) return fromVsCode;
  const fromGh = tryGhAuthToken();
  if (fromGh) return fromGh;
  throw new Error(
    "No GitHub auth available. Set GITHUB_TOKEN, sign in to GitHub in VS Code, or run `gh auth login`."
  );
}
async function tryVsCodeSession(opts = {}) {
  const scopes = opts.scopes ?? GITHUB_SCOPES;
  try {
    const vscode = await import("vscode");
    if (!vscode?.authentication?.getSession) return void 0;
    const session = await vscode.authentication.getSession("github", [...scopes], {
      createIfNone: !!opts.createIfNone
    });
    return session?.accessToken;
  } catch {
    return void 0;
  }
}
function tryGhAuthToken() {
  try {
    const raw = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5e3
    });
    const token = raw.trim();
    return token || void 0;
  } catch {
    return void 0;
  }
}
async function diagnoseGitHubAuth() {
  const envSet = !!process.env.GITHUB_TOKEN?.trim();
  const vscodeAvailable = await tryVsCodeSession().then(Boolean).catch(() => false);
  const ghAvailable = !!tryGhAuthToken();
  const sources = [];
  if (envSet) sources.push("env");
  if (vscodeAvailable) sources.push("vscode");
  if (ghAvailable) sources.push("gh");
  return {
    sources,
    primary: sources[0],
    scopes: [...GITHUB_SCOPES]
  };
}

// scripts/github/auth.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--json":
        out.json = true;
        break;
      case "--diagnose":
        out.diagnose = true;
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
var HELP = `lakebase-github-token \u2013 unified GitHub token resolver

Usage:
  lakebase-github-token                 print the resolved token on stdout
  lakebase-github-token --json          print { token, source } as JSON
  lakebase-github-token --diagnose      print which auth sources are available
                                        (does NOT reveal the token)

Fallback chain:
  1. GITHUB_TOKEN env var
  2. VS Code authentication.getSession (only inside the extension host)
  3. \`gh auth token\`
  4. Exit 1 with a clear error

Scopes required by Lakebase SCM workflow ops:
  repo, workflow, delete_repo

Examples:
  # Pipe into Octokit:
  GH=$(lakebase-github-token) && curl -H "Authorization: bearer $GH" https://api.github.com/user

  # Check which sources are configured (safe to log):
  lakebase-github-token --diagnose
`;
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.diagnose) {
    const diagnosis = await diagnoseGitHubAuth();
    if (args.json) {
      process.stdout.write(JSON.stringify(diagnosis, null, 2) + "\n");
    } else {
      process.stdout.write(
        `Available sources: ${diagnosis.sources.length ? diagnosis.sources.join(", ") : "(none)"}
Primary: ${diagnosis.primary ?? "(none)"}
Scopes: ${diagnosis.scopes.join(", ")}
`
      );
    }
    return diagnosis.sources.length > 0 ? 0 : 1;
  }
  const token = await resolveGitHubToken();
  if (args.json) {
    const { primary } = await diagnoseGitHubAuth();
    process.stdout.write(JSON.stringify({ token, source: primary }) + "\n");
  } else {
    process.stdout.write(token + "\n");
  }
  return 0;
}
main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  }
);
//# sourceMappingURL=auth.cli.js.map