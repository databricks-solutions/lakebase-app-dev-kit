#!/usr/bin/env node

// scripts/tdd/layering-clean.cli.ts
import { readFileSync as readFileSync2 } from "fs";

// scripts/tdd/layering-clean.ts
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
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
    return { serviceBacked: false, boundaryModules: [], repositoryModules: [] };
  }
  const modulesByRole = (role) => (parsed.layers ?? []).filter((l) => l.role === role && typeof l.module === "string").map((l) => l.module);
  return {
    serviceBacked: parsed.service_backed === true,
    boundaryModules: modulesByRole("boundary"),
    repositoryModules: modulesByRole("repository")
  };
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
}
var callArgs = { projectDir: p.projectDir, serviceBacked };
if (boundary.length > 0) callArgs.boundaryModules = boundary;
if (repository.length > 0) callArgs.repositoryModules = repository;
var result = checkLayeringClean(callArgs);
if (p.json) {
  process.stdout.write(`${JSON.stringify(result)}
`);
} else if (result.clean) {
  const what = serviceBacked ? result.scanned.length ? `boundary clean (scanned: ${result.scanned.join(", ")})` : "no boundary modules to scan" : "feature is not service-backed (layering not required)";
  process.stdout.write(`layering-clean: OK , ${what}
`);
} else {
  process.stderr.write(
    `layering-clean: FAILED , the boundary/routes layer is not cleanly separated from persistence.

${result.violations.map((v) => `  ${v}`).join("\n")}

Remediation: ${result.remediation}
`
  );
}
process.exit(result.clean ? 0 : 1);
//# sourceMappingURL=layering-clean.cli.js.map