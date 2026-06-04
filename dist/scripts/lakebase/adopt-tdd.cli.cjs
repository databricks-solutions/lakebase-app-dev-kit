#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// scripts/lakebase/adopt-tdd.ts
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var import_node_url = require("url");
function adoptTdd(args) {
  if (!fs.existsSync(args.projectDir)) {
    throw new Error(`Project directory does not exist: ${args.projectDir}`);
  }
  if (!fs.existsSync(path.join(args.projectDir, ".git"))) {
    throw new Error(
      `Not a git repo root: ${args.projectDir}. Run \`git init\` first, or pass a path that already has \`.git/\`.`
    );
  }
  const dest = path.join(args.projectDir, ".tdd");
  const update = args.update === true || args.force === true;
  if (fs.existsSync(dest) && !update) {
    throw new Error(
      `.tdd/ already exists at ${dest}. Re-run with --update to refresh missing files (drift is reported, not overwritten) or --update --force to overwrite drifted ones.`
    );
  }
  const src = args.bootstrapDir ?? findBootstrapDir();
  const entries = walkTemplateTree(src);
  const added = [];
  const inSync = [];
  const drifted = [];
  const updated = [];
  for (const rel of entries) {
    const fromPath = path.join(src, rel);
    const toPath = path.join(dest, rel);
    if (!fs.existsSync(toPath)) {
      if (!args.dryRun) {
        fs.mkdirSync(path.dirname(toPath), { recursive: true });
        fs.copyFileSync(fromPath, toPath);
      }
      added.push(rel);
      continue;
    }
    const before = fs.readFileSync(fromPath);
    const after = fs.readFileSync(toPath);
    if (before.equals(after)) {
      inSync.push(rel);
      continue;
    }
    if (args.force) {
      if (!args.dryRun) {
        fs.copyFileSync(fromPath, toPath);
      }
      updated.push(rel);
    } else {
      drifted.push(rel);
    }
  }
  return {
    added,
    inSync,
    drifted,
    updated,
    noChanges: added.length === 0 && updated.length === 0
  };
}
function walkTemplateTree(root) {
  if (!fs.existsSync(root)) {
    throw new Error(`tdd-bootstrap template tree missing: ${root}`);
  }
  const out = [];
  const stack = [""];
  while (stack.length) {
    const rel = stack.pop();
    const abs = path.join(root, rel);
    for (const entry of fs.readdirSync(abs)) {
      const childRel = rel ? path.join(rel, entry) : entry;
      const childAbs = path.join(abs, entry);
      const stat = fs.statSync(childAbs);
      if (stat.isDirectory()) {
        stack.push(childRel);
      } else {
        out.push(childRel);
      }
    }
  }
  return out.sort();
}
var cachedBootstrapDir;
function findBootstrapDir() {
  if (cachedBootstrapDir) return cachedBootstrapDir;
  const here = path.dirname((0, import_node_url.fileURLToPath)(importMetaUrl));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "templates", "tdd-bootstrap", ".tdd");
    if (fs.existsSync(candidate)) {
      cachedBootstrapDir = candidate;
      return cachedBootstrapDir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/tdd-bootstrap/.tdd relative to ${here}. Pass explicit { bootstrapDir } to override.`
  );
}

// scripts/lakebase/adopt-tdd.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--project-dir":
      case "-C":
        out.projectDir = argv[++i];
        break;
      case "--update":
        out.update = true;
        break;
      case "--force":
        out.force = true;
        break;
      case "--dry-run":
        out.dryRun = true;
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
var HELP = `lakebase-adopt-tdd \u2013 bootstrap the .tdd/ workflow tree on an existing repo

Usage:
  lakebase-adopt-tdd [path]                     fresh adoption; fails if .tdd/ exists
  lakebase-adopt-tdd [path] --update            report drift, add missing files
  lakebase-adopt-tdd [path] --update --force    additionally overwrite drifted files
  lakebase-adopt-tdd [path] --dry-run --update  preview without writing

Flags:
  --project-dir <path>, -C <path>   Project root (defaults to current directory)
  --update                          Allow running on a project that already has .tdd/
  --force                           Overwrite drifted template files (implies --update)
  --dry-run                         Report what would change; write nothing
  --help, -h                        Show this help

Output: JSON to stdout: { added, inSync, drifted, updated, noChanges }
       Exit codes:
         0 - success (whether or not changes were applied)
         1 - operational failure (not a git repo, .tdd/ exists without --update, etc.)
`;
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const input = {
    projectDir: args.projectDir ?? process.cwd(),
    update: args.update,
    force: args.force,
    dryRun: args.dryRun
  };
  const result = adoptTdd(input);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
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
//# sourceMappingURL=adopt-tdd.cli.cjs.map