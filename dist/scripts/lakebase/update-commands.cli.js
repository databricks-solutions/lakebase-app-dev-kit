#!/usr/bin/env node

// scripts/lakebase/update-commands.cli.ts
import * as readline from "readline";

// scripts/lakebase/workflow-drift.ts
import * as fs from "fs";
import * as path from "path";
function unifiedDiff(name, projectContent, templateContent) {
  if (projectContent === templateContent) return "";
  const a = projectContent.split("\n");
  const b = templateContent.split("\n");
  const out = [`--- project/${name}`, `+++ template/${name}`];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === bv) continue;
    if (av !== void 0) out.push(`-${i + 1}: ${av}`);
    if (bv !== void 0) out.push(`+${i + 1}: ${bv}`);
  }
  return out.join("\n");
}
function applyCommandPlaceholders(content, version) {
  return content.replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
}
var COMMAND_HOOK_FILE_PATTERN = /\.(pre|post)-hook\.md$/;
function findKitCommandsDir(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(
      dir,
      "templates",
      "project",
      "common",
      ".claude",
      "commands"
    );
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project/common/.claude/commands/ relative to ${start}. Pass explicit kitDir.`
  );
}
function parsePinnedVersion(content) {
  const m = content.match(/^\s*[*_>`\s]*pinned\s+to\s*:\s*[`*_]*([^\s`*_]+)[`*_]*\s*$/im);
  return m ? m[1] : void 0;
}
function detectCommandDrift(args) {
  const projectCommandsDir = path.join(args.projectDir, ".claude", "commands");
  const here = path.dirname(new URL(import.meta.url).pathname);
  const kitCommandsDir = args.kitDir ? path.join(args.kitDir, "templates", "project", "common", ".claude", "commands") : findKitCommandsDir(here);
  const kitVersion = readKitVersionFromCommandsDir(kitCommandsDir);
  const templateFiles = fs.existsSync(kitCommandsDir) ? fs.readdirSync(kitCommandsDir).filter((f) => f.endsWith(".md") && !COMMAND_HOOK_FILE_PATTERN.test(f)) : [];
  const projectFiles = fs.existsSync(projectCommandsDir) ? fs.readdirSync(projectCommandsDir).filter((f) => f.endsWith(".md") && !COMMAND_HOOK_FILE_PATTERN.test(f)) : [];
  const seen = /* @__PURE__ */ new Set();
  const files = [];
  for (const name of templateFiles) {
    seen.add(name);
    const projectPath = path.join(projectCommandsDir, name);
    const templatePath = path.join(kitCommandsDir, name);
    const templateRaw = fs.readFileSync(templatePath, "utf8");
    if (!fs.existsSync(projectPath)) {
      files.push({ name, status: "missing", kit_version: kitVersion });
      continue;
    }
    const projectContent = fs.readFileSync(projectPath, "utf8");
    const pinned = parsePinnedVersion(projectContent);
    const versionForCompare = pinned ?? kitVersion;
    const templateContent = applyCommandPlaceholders(templateRaw, versionForCompare);
    if (projectContent === templateContent) {
      files.push({
        name,
        status: "unchanged",
        pinned_version: pinned,
        kit_version: kitVersion
      });
    } else {
      files.push({
        name,
        status: "drifted",
        pinned_version: pinned,
        kit_version: kitVersion,
        diff: unifiedDiff(name, projectContent, templateContent)
      });
    }
  }
  for (const name of projectFiles) {
    if (seen.has(name)) continue;
    files.push({ name, status: "extra", kit_version: kitVersion });
  }
  const order = {
    drifted: 0,
    missing: 1,
    extra: 2,
    unchanged: 3
  };
  files.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  const hasDrift = files.some((f) => f.status === "drifted" || f.status === "missing");
  return { overall: hasDrift ? "drift" : "ok", files };
}
function readKitVersionFromCommandsDir(kitCommandsDir) {
  let dir = kitCommandsDir;
  for (let i = 0; i < 5; i++) {
    dir = path.dirname(dir);
  }
  try {
    const raw = fs.readFileSync(path.join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

// scripts/lakebase/update-commands.ts
import * as fs2 from "fs";
import * as path2 from "path";
var COMMAND_HOOK_FILE_PATTERN2 = /\.(pre|post)-hook\.md$/;
function findKitCommandsDir2(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path2.join(
      dir,
      "templates",
      "project",
      "common",
      ".claude",
      "commands"
    );
    if (fs2.existsSync(candidate)) return candidate;
    const parent = path2.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project/common/.claude/commands/ relative to ${start}. Pass explicit kitDir.`
  );
}
function readKitVersion(kitCommandsDir) {
  let dir = kitCommandsDir;
  for (let i = 0; i < 5; i++) {
    dir = path2.dirname(dir);
  }
  try {
    const raw = fs2.readFileSync(path2.join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
function applyCommandPlaceholders2(content, version) {
  return content.replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
}
function updateCommands(args) {
  const projectCommandsDir = path2.join(args.projectDir, ".claude", "commands");
  const here = path2.dirname(new URL(import.meta.url).pathname);
  const kitCommandsDir = args.kitDir ? path2.join(args.kitDir, "templates", "project", "common", ".claude", "commands") : findKitCommandsDir2(here);
  const dryRun = args.dryRun === true;
  const force = args.force !== false;
  const templateFiles = fs2.existsSync(kitCommandsDir) ? fs2.readdirSync(kitCommandsDir).filter((f) => f.endsWith(".md") && !COMMAND_HOOK_FILE_PATTERN2.test(f)) : [];
  if (!dryRun && templateFiles.length > 0 && !fs2.existsSync(projectCommandsDir)) {
    fs2.mkdirSync(projectCommandsDir, { recursive: true });
  }
  const version = readKitVersion(kitCommandsDir);
  const files = [];
  for (const name of templateFiles) {
    const projectPath = path2.join(projectCommandsDir, name);
    const templatePath = path2.join(kitCommandsDir, name);
    const templateRaw = fs2.readFileSync(templatePath, "utf-8");
    const desired = applyCommandPlaceholders2(templateRaw, version);
    const existed = fs2.existsSync(projectPath);
    const current = existed ? fs2.readFileSync(projectPath, "utf-8") : "";
    let outcome;
    if (!existed) {
      outcome = "added";
    } else if (current === desired) {
      outcome = "unchanged";
    } else if (!force) {
      outcome = "preserved";
    } else {
      outcome = "updated";
    }
    if (!dryRun && (outcome === "added" || outcome === "updated")) {
      fs2.writeFileSync(projectPath, desired);
    }
    files.push({ name, outcome });
  }
  const order = {
    added: 0,
    updated: 1,
    preserved: 2,
    unchanged: 3
  };
  files.sort((a, b) => order[a.outcome] - order[b.outcome] || a.name.localeCompare(b.name));
  const changed = files.some((f) => f.outcome === "added" || f.outcome === "updated");
  return { files, changed };
}

// scripts/lakebase/update-commands.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--project-dir":
      case "-C":
        out.projectDir = argv[++i];
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--force":
        out.force = true;
        break;
      case "--json":
        out.json = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        if (!a.startsWith("-") && !out.projectDir) {
          out.projectDir = a;
        }
        break;
    }
  }
  return out;
}
var HELP = `lakebase-update-commands \u2013 refresh .claude/commands/ from the current kit

Usage:
  lakebase-update-commands [path]                 interactive per-file confirm
  lakebase-update-commands [path] --force         overwrite drifted files unattended
  lakebase-update-commands [path] --dry-run       preview without writing

Flags:
  --project-dir <path>, -C <path>   Project root (defaults to current directory)
  --dry-run                         Report what would change; write nothing
  --force                           Overwrite drifted files without prompting
  --json                            Emit a JSON report on stdout instead of human text
  --help, -h                        Show this help

Hook files (design.{pre,post}-hook.md, build.{pre,post}-hook.md) are
project-owned and NEVER touched by this command.

Output: a human-readable summary on stdout (or JSON with --json).
       Exit codes:
         0 - success (whether or not changes were applied)
         1 - operational failure (kit templates missing, etc.)
`;
async function promptYn(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}
function renderDriftSummary(entries) {
  const lines = [];
  for (const e of entries) {
    if (e.status === "unchanged") continue;
    lines.push(`  ${e.status.padEnd(8)} ${e.name}${e.pinned_version ? `  (pinned: ${e.pinned_version})` : ""}`);
  }
  return lines.join("\n") || "  (no command-file drift)";
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const projectDir = args.projectDir ?? process.cwd();
  const force = args.force === true;
  const dryRun = args.dryRun === true;
  const drift = detectCommandDrift({ projectDir });
  if (drift.overall === "ok" && !drift.files.some((f) => f.status === "missing")) {
    if (args.json) {
      process.stdout.write(JSON.stringify({ changed: false, files: [] }, null, 2) + "\n");
    } else {
      process.stdout.write("Commands are in sync with the kit. Nothing to do.\n");
    }
    return 0;
  }
  if (!args.json) {
    process.stderr.write("Drift report:\n");
    process.stderr.write(renderDriftSummary(drift.files) + "\n\n");
  }
  let resolvedForce = force;
  if (!dryRun && !force) {
    const drifted = drift.files.filter((f) => f.status === "drifted").map((f) => f.name);
    if (drifted.length > 0) {
      const ok = await promptYn(
        `Overwrite drifted file(s) ${drifted.join(", ")} with the kit's current template? [y/N] `
      );
      if (!ok) {
        process.stderr.write("Skipping drifted files (force=false). Missing files (if any) will still be added.\n");
      }
      resolvedForce = ok;
    } else {
      resolvedForce = true;
    }
  }
  const result = updateCommands({ projectDir, dryRun, force: resolvedForce });
  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }
  for (const f of result.files) {
    process.stdout.write(`  ${f.outcome.padEnd(10)} ${f.name}
`);
  }
  if (dryRun) {
    process.stdout.write("\n(dry-run: no files were written)\n");
  } else if (!result.changed) {
    process.stdout.write("\nNo files changed.\n");
  } else {
    process.stdout.write("\nDone.\n");
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
//# sourceMappingURL=update-commands.cli.js.map