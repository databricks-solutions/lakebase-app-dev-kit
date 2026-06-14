#!/usr/bin/env node

// scripts/tdd/layering-clean.cli.ts
import { readFileSync as readFileSync2 } from "fs";

// scripts/tdd/layering-clean.ts
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
var SOURCE_SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
  ".git",
  "build",
  "dist",
  ".tdd",
  ".lakebase",
  "alembic",
  "migrations",
  "tests",
  "test",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache"
]);
function isTestFile(name) {
  return /^test_.*\.py$/.test(name) || /_test\.py$/.test(name) || name === "conftest.py";
}
function sourcePyFilesRec(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SOURCE_SKIP_DIRS.has(e.name)) sourcePyFilesRec(join(dir, e.name), out);
    } else if (e.isFile() && e.name.endsWith(".py") && !isTestFile(e.name)) {
      out.push(join(dir, e.name));
    }
  }
}
var DUP_CLASS_REMEDIATION = "The same class is defined in more than one module. Keep ONE canonical definition (usually the package that owns the layer) and delete the duplicate; re-export from the package __init__ if a stable import path is needed. Duplicate ORM model classes also risk a double table registration. See the `layering-violation` smell + DRY (one source of truth).";
var TOP_LEVEL_CLASS = /^class\s+([A-Za-z_]\w*)\s*[:(]/;
function checkDuplicateClasses(projectDir, roots = ["app", "src"]) {
  const files = [];
  for (const r of roots) {
    const abs = join(projectDir, r);
    if (!existsSync(abs)) continue;
    try {
      if (statSync(abs).isDirectory()) sourcePyFilesRec(abs, files);
      else if (abs.endsWith(".py") && !isTestFile(r)) files.push(abs);
    } catch {
    }
  }
  const defs = /* @__PURE__ */ new Map();
  for (const file of files) {
    const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = TOP_LEVEL_CLASS.exec(line);
      if (!m) continue;
      const set = defs.get(m[1]) ?? /* @__PURE__ */ new Set();
      set.add(shown);
      defs.set(m[1], set);
    }
  }
  const violations = [];
  for (const [name, modules] of [...defs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (modules.size > 1) {
      violations.push(
        `class ${name} is defined in ${modules.size} modules: ${[...modules].sort().join(", ")} (keep one canonical definition, delete the duplicate)`
      );
    }
  }
  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations, remediation: DUP_CLASS_REMEDIATION };
}
var SESSION_OP = /\b(?:db|session|_session|self\._?session)\s*\.\s*(query|add|add_all|commit|delete|merge|flush|execute|refresh|scalars|scalar)\s*\(/;
var REMEDIATION = "The boundary/routes layer calls the DB session directly (a fat controller). Extract a service (business logic) + a repository (the ONLY layer that touches the ORM/session); the route handler validates input + delegates to the service. See the `layering-violation` smell + @architectural-design-principles layered-architecture.";
var DEFAULT_BOUNDARY = ["app/main.py", "app/routes"];
var DEFAULT_REPOSITORY = ["app/repositories", "app/repository.py"];
function pyFilesFor(projectDir, rel) {
  const abs = join(projectDir, rel);
  if (!existsSync(abs)) return [];
  let isDir = false;
  try {
    isDir = statSync(abs).isDirectory();
  } catch {
    return [];
  }
  if (!isDir) return rel.endsWith(".py") ? [abs] : [];
  const out = [];
  for (const f of readdirSync(abs)) {
    if (f.endsWith(".py") && f !== "__init__.py") out.push(join(abs, f));
  }
  return out;
}
function repositoryExists(projectDir, repositoryModules) {
  return repositoryModules.some((rel) => existsSync(join(projectDir, rel)));
}
function checkLayeringClean(args) {
  if (!args.serviceBacked) {
    return { clean: true, scanned: [], violations: [] };
  }
  const boundary2 = args.boundaryModules?.length ? args.boundaryModules : DEFAULT_BOUNDARY;
  const repository2 = args.repositoryModules?.length ? args.repositoryModules : DEFAULT_REPOSITORY;
  const scanned = [];
  const violations = [];
  for (const rel of boundary2) {
    for (const file of pyFilesFor(args.projectDir, rel)) {
      scanned.push(file.startsWith(args.projectDir) ? file.slice(args.projectDir.length).replace(/^\//, "") : file);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (SESSION_OP.test(line)) {
          const shown = file.startsWith(args.projectDir) ? file.slice(args.projectDir.length).replace(/^\//, "") : file;
          violations.push(`${shown}:${i + 1}  ${line.trim()}`);
        }
      });
    }
  }
  if (scanned.length > 0 && !repositoryExists(args.projectDir, repository2)) {
    violations.push(`no repository module found (expected one of: ${repository2.join(", ")})`);
  }
  if (violations.length > 0) {
    return { clean: false, scanned, violations, remediation: REMEDIATION };
  }
  return { clean: true, scanned, violations: [] };
}
function layeringConfigFromArchitecture(architectureJson) {
  let parsed;
  try {
    parsed = JSON.parse(architectureJson);
  } catch {
    return { serviceBacked: false, boundaryModules: [], repositoryModules: [], allModules: [] };
  }
  const layers = parsed.layers ?? [];
  const modulesByRole = (role) => layers.filter((l) => l.role === role && typeof l.module === "string").map((l) => l.module);
  const allModules2 = layers.filter((l) => typeof l.role === "string" && typeof l.module === "string").map((l) => ({ role: l.role, module: l.module }));
  const boundaryLayer = layers.find((l) => l.role === "boundary" && typeof l.renders_via === "string");
  return {
    serviceBacked: parsed.service_backed === true,
    boundaryModules: modulesByRole("boundary"),
    repositoryModules: modulesByRole("repository"),
    allModules: allModules2,
    ...boundaryLayer?.renders_via ? { rendersVia: boundaryLayer.renders_via } : {}
  };
}
function checkModulePlacement(projectDir, allModules2) {
  const violations = [];
  const kindOf = (abs) => {
    if (!existsSync(abs)) return "missing";
    try {
      return statSync(abs).isDirectory() ? "dir" : "file";
    } catch {
      return "missing";
    }
  };
  for (const { role, module } of allModules2) {
    const base = module.replace(/\/$/, "");
    const wantDir = module.endsWith("/");
    const wantFile = module.endsWith(".py");
    const here = kindOf(join(projectDir, base));
    if (wantDir) {
      if (here === "dir") {
        if (kindOf(join(projectDir, `${base}.py`)) === "file") {
          violations.push(`declared ${role} layer "${module}" is a package, but a stale flat ${base}.py also exists alongside it (an orphan from a flat->package migration, shadowed + duplicating this layer); delete ${base}.py so only the package defines this layer`);
        }
        continue;
      }
      if (kindOf(join(projectDir, `${base}.py`)) === "file") {
        violations.push(`declared ${role} layer "${module}" is a package directory but the build created a flat file ${base}.py (organize this layer under ${module})`);
      } else {
        violations.push(`declared ${role} layer module "${module}" not found (the build placed this layer's code elsewhere)`);
      }
    } else if (wantFile) {
      if (here === "file") continue;
      if (here === "dir") violations.push(`declared ${role} layer module "${module}" is a file but a directory exists there`);
      else violations.push(`declared ${role} layer module "${module}" not found (the build placed this layer's code elsewhere)`);
    } else {
      if (here !== "missing" || kindOf(join(projectDir, `${base}.py`)) === "file") continue;
      violations.push(`declared ${role} layer module "${module}" not found (the build placed this layer's code elsewhere)`);
    }
  }
  return { ok: violations.length === 0, violations };
}
var INLINE_HTML = /<!DOCTYPE\b|<html[\s>]|HTMLResponse\s*\(\s*(?:content\s*=\s*)?["'`]\s*<|return\s+f?["'`]{1,3}\s*<(?:html|!DOCTYPE)/i;
var TEMPLATE_SEAM = /\b(?:Jinja2Templates|TemplateResponse|render_template|templates\.TemplateResponse)\b/;
var INLINE_RENDER_REMEDIATION = "The boundary renders HTML inline instead of through a templating framework. Render via the declared framework (e.g. Jinja2 TemplateResponse + a templates/ dir) with stable data-testid seams; the route returns a rendered template, never an inline HTML string. See the design-guide `UI Framework` section + @ui-ux-design-principles/testable-ui.";
function checkInlineRendering(projectDir, boundaryModules, rendersVia2) {
  const boundary2 = boundaryModules.length ? boundaryModules : DEFAULT_BOUNDARY;
  const violations = [];
  for (const rel of boundary2) {
    for (const file of pyFilesFor(projectDir, rel)) {
      const src = readFileSync(file, "utf8");
      const hasInline = INLINE_HTML.test(src);
      const hasSeam = TEMPLATE_SEAM.test(src);
      if (hasInline && !hasSeam) {
        const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
        violations.push(`${shown}: boundary emits inline HTML with no templating seam (use ${rendersVia2 ?? "the declared templating framework"})`);
      }
    }
  }
  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations, remediation: INLINE_RENDER_REMEDIATION };
}
function nontrivial(line) {
  const t = line.trim();
  return t.length > 0 && !t.startsWith("#") && t !== "}" && t !== "{" && t !== "return" && t !== "pass";
}
function checkCodeBudget(projectDir, sourcePaths, opts = {}) {
  const maxFn = opts.maxFunctionLines ?? 60;
  const dupWin = opts.dupWindow ?? 6;
  const violations = [];
  const files = [];
  for (const rel of sourcePaths) files.push(...pyFilesFor(projectDir, rel));
  for (const file of files) {
    const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*)def\s+(\w+)/.exec(lines[i]);
      if (!m) continue;
      const indent = m[1].length;
      let body = 0;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "") continue;
        const ind = /^(\s*)/.exec(lines[j])[1].length;
        if (ind <= indent) break;
        body++;
      }
      if (body > maxFn) violations.push(`${shown}:${i + 1}  def ${m[2]} is ${body} lines (> ${maxFn}); extract helpers (clean-code / single responsibility)`);
    }
  }
  const seen = /* @__PURE__ */ new Map();
  const reported = /* @__PURE__ */ new Set();
  for (const file of files) {
    const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
    const lines = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(nontrivial);
    for (let i = 0; i + dupWin <= lines.length; i++) {
      const key = lines.slice(i, i + dupWin).join("");
      if (key.length < dupWin * 3) continue;
      const first = seen.get(key);
      if (first === void 0) {
        seen.set(key, shown);
      } else if (!reported.has(key)) {
        reported.add(key);
        violations.push(`duplicated ${dupWin}-line block in ${first} and ${shown} (DRY: extract one shared helper)`);
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

// scripts/tdd/layering-clean.cli.ts
function parse(argv) {
  const out = { projectDir: process.cwd(), boundary: [], repository: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--architecture" && i + 1 < argv.length) out.architecture = argv[++i];
    else if (a === "--boundary" && i + 1 < argv.length) out.boundary.push(argv[++i]);
    else if (a === "--repository" && i + 1 < argv.length) out.repository.push(argv[++i]);
    else if (a === "--service-backed") out.serviceBacked = true;
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}
function help() {
  process.stdout.write(
    `lakebase-tdd-layering-clean , prove the boundary/routes layer does not touch persistence

Usage:
  lakebase-tdd-layering-clean [--project-dir <path>] [--architecture <path>] \\
                              [--boundary <rel> ...] [--repository <rel> ...] \\
                              [--service-backed] [--json]

service_backed + module paths are read from --architecture when given; flags override.
Exit 0 = clean / exempt; exit 1 = boundary calls the DB session directly or no repository.
`
  );
  process.exit(0);
}
var p = parse(process.argv.slice(2));
var serviceBacked = p.serviceBacked ?? false;
var boundary = p.boundary;
var repository = p.repository;
var allModules = [];
var rendersVia;
if (p.architecture) {
  let archJson = "";
  try {
    archJson = readFileSync2(p.architecture, "utf8");
  } catch {
    process.stderr.write(`layering-clean: cannot read architecture file ${p.architecture}
`);
    process.exit(1);
  }
  const cfg = layeringConfigFromArchitecture(archJson);
  if (p.serviceBacked === void 0) serviceBacked = cfg.serviceBacked;
  if (boundary.length === 0) boundary = cfg.boundaryModules;
  if (repository.length === 0) repository = cfg.repositoryModules;
  allModules = cfg.allModules;
  rendersVia = cfg.rendersVia;
}
var callArgs = { projectDir: p.projectDir, serviceBacked };
if (boundary.length > 0) callArgs.boundaryModules = boundary;
if (repository.length > 0) callArgs.repositoryModules = repository;
var layering = checkLayeringClean(callArgs);
var placement = serviceBacked && allModules.length ? checkModulePlacement(p.projectDir, allModules) : { ok: true, violations: [] };
var rendering = serviceBacked ? checkInlineRendering(p.projectDir, boundary, rendersVia) : { ok: true, violations: [] };
var budgetPaths = allModules.length ? allModules.map((m) => m.module) : ["app"];
var budget = checkCodeBudget(p.projectDir, budgetPaths);
var duplicates = checkDuplicateClasses(p.projectDir);
var groups = [
  { label: "layering (boundary vs persistence)", ok: layering.clean, violations: layering.violations, remediation: layering.remediation },
  { label: "module placement (layers at declared paths)", ok: placement.ok, violations: placement.violations },
  { label: "rendering (templating, not inline HTML)", ok: rendering.ok, violations: rendering.violations, remediation: rendering.remediation },
  { label: "DRY + complexity budget", ok: budget.ok, violations: budget.violations },
  { label: "no duplicate class definitions", ok: duplicates.ok, violations: duplicates.violations, remediation: duplicates.remediation }
];
var ok = groups.every((g) => g.ok);
if (p.json) {
  process.stdout.write(`${JSON.stringify({ ok, scanned: layering.scanned, groups })}
`);
} else if (ok) {
  const what = serviceBacked ? layering.scanned.length ? `layered + rendered + within budget (boundary scanned: ${layering.scanned.join(", ")})` : "no boundary modules to scan" : "feature is not service-backed (layering not required)";
  process.stdout.write(`layering-clean: OK , ${what}
`);
} else {
  const blocks = groups.filter((g) => !g.ok).map((g) => `  [${g.label}]
${g.violations.map((v) => `    ${v}`).join("\n")}${g.remediation ? `
    -> ${g.remediation}` : ""}`).join("\n\n");
  process.stderr.write(`layering-clean: FAILED , architecture-quality checks did not pass.

${blocks}
`);
}
process.exit(ok ? 0 : 1);
//# sourceMappingURL=layering-clean.cli.js.map