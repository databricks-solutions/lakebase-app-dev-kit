// Scaffolder integration for the [Infra]-tag runner. Sibling to
// `enable-e2e.ts`: when a project is scaffolded with --enable-infra
// (default-on for Node, off otherwise), this helper patches
// package.json (adds `test:infra` script) and scripts/run-tests.sh
// (appends an infra block after the language-specific suite).
//
// Unlike enable-e2e, the runner itself ships in the kit (`lakebase-
// infra-runner` bin), so the project does not gain a new devDependency.
// The bin is reachable via `npx lakebase-infra-runner` when the kit is
// installed locally, or via the github:.../#tag pattern in CI.

import * as fs from "node:fs";
import * as path from "node:path";

const RUN_TESTS_INFRA_MARKER = "# Run Lakebase [Infra]-tag suite when wired";

export interface AddInfraToPackageJsonArgs {
  projectDir: string;
  /**
   * The `test:infra` script value. Defaults to invoking the kit bin
   * via npx (`npx --yes lakebase-infra-runner`). Override when a
   * project needs a custom invocation path (e.g. a vendored npm-pinned
   * version, a wrapper that injects env vars).
   */
  scriptValue?: string;
}

export interface AddInfraToPackageJsonResult {
  patched: boolean;
  scriptAdded: boolean;
}

/**
 * Idempotently add `scripts["test:infra"]` to package.json. No-op when
 * package.json is absent (non-Node project) so the helper is safe to
 * invoke unconditionally from the scaffolder.
 */
export function addInfraToPackageJson(
  args: AddInfraToPackageJsonArgs
): AddInfraToPackageJsonResult {
  const pkgPath = path.join(args.projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return { patched: false, scriptAdded: false };
  }
  const scriptValue = args.scriptValue ?? "npx --yes lakebase-infra-runner";
  const raw = fs.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as Record<string, unknown>;
  const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};
  let scriptAdded = false;
  if (!scripts["test:infra"]) {
    scripts["test:infra"] = scriptValue;
    scriptAdded = true;
  }
  pkg.scripts = scripts;
  if (scriptAdded) {
    const trailing = raw.endsWith("\n") ? "\n" : "";
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + trailing, "utf8");
  }
  return { patched: true, scriptAdded };
}

export interface AddInfraToRunTestsScriptArgs {
  projectDir: string;
}

export interface AddInfraToRunTestsScriptResult {
  patched: boolean;
  inserted: boolean;
}

/**
 * Idempotently append an [Infra] suite invocation to scripts/run-tests.sh.
 * The block fires when `package.json` has a `test:infra` script (so the
 * scaffolder integration is observable end-to-end), making retrofits and
 * partial wires both work.
 */
export function addInfraToRunTestsScript(
  args: AddInfraToRunTestsScriptArgs
): AddInfraToRunTestsScriptResult {
  const scriptPath = path.join(args.projectDir, "scripts", "run-tests.sh");
  if (!fs.existsSync(scriptPath)) {
    return { patched: false, inserted: false };
  }
  const original = fs.readFileSync(scriptPath, "utf8");
  if (original.includes(RUN_TESTS_INFRA_MARKER)) {
    return { patched: true, inserted: false };
  }
  const trimmed = original.replace(/\n+$/, "\n");
  const block = [
    "",
    RUN_TESTS_INFRA_MARKER,
    'if [ -f "$REPO_ROOT/package.json" ] && command -v npm >/dev/null 2>&1; then',
    '  if node -e "process.exit(!(require(\'./package.json\').scripts && require(\'./package.json\').scripts[\'test:infra\']))" 2>/dev/null; then',
    '    echo "Running Lakebase [Infra] suite..."',
    '    (cd "$REPO_ROOT" && npm run test:infra)',
    "  fi",
    "fi",
    "",
  ].join("\n");
  fs.writeFileSync(scriptPath, trimmed + block, "utf8");
  return { patched: true, inserted: true };
}

export interface EnableInfraForProjectArgs {
  projectDir: string;
  /** Forwarded to addInfraToPackageJson. */
  scriptValue?: string;
}

export interface EnableInfraForProjectResult {
  packageJson: AddInfraToPackageJsonResult;
  runTestsScript: AddInfraToRunTestsScriptResult;
}

/**
 * One-shot scaffolder integration: patch package.json + run-tests.sh
 * so `npm run test:infra` and the full validation suite both invoke
 * the [Infra] runner. Always safe to re-run.
 */
export function enableInfraForProject(
  args: EnableInfraForProjectArgs
): EnableInfraForProjectResult {
  const packageJson = addInfraToPackageJson({
    projectDir: args.projectDir,
    scriptValue: args.scriptValue,
  });
  const runTestsScript = addInfraToRunTestsScript({ projectDir: args.projectDir });
  return { packageJson, runTestsScript };
}
