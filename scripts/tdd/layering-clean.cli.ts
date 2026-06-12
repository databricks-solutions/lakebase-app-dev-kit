#!/usr/bin/env node
// CLI for the layering-clean gate: prove a service-backed feature's
// boundary/routes layer does NOT touch persistence directly (a fat controller)
// and that a repository layer exists. The deterministic, model-independent
// backstop for the `layering-violation` smell, mirroring lakebase-tdd-imports-clean.
//
// Exit 0 = clean (layered, or the feature is not service-backed so layering is
//          not warranted, or there is no boundary to scan).
// Exit 1 = the boundary calls the DB session directly and/or no repository
//          module exists , the fat-controller form of the layering-violation
//          smell. Prints the offending lines + remediation.
//
// Usage:
//   lakebase-tdd-layering-clean [--project-dir <path>] [--architecture <path>]
//                               [--boundary <rel> ...] [--repository <rel> ...]
//                               [--service-backed] [--json]
//
// With --architecture, service_backed + the boundary/repository module paths are
// read from architecture.json `layers`; explicit flags override.

import { readFileSync } from "node:fs";
import {
  checkLayeringClean,
  layeringConfigFromArchitecture,
  type LayeringCleanArgs,
} from "./layering-clean.js";

interface Parsed {
  projectDir: string;
  architecture?: string;
  boundary: string[];
  repository: string[];
  serviceBacked?: boolean;
  json: boolean;
}

function parse(argv: string[]): Parsed {
  const out: Parsed = { projectDir: process.cwd(), boundary: [], repository: [], json: false };
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

function help(): never {
  process.stdout.write(
    `lakebase-tdd-layering-clean , prove the boundary/routes layer does not touch persistence\n\n` +
      `Usage:\n` +
      `  lakebase-tdd-layering-clean [--project-dir <path>] [--architecture <path>] \\\n` +
      `                              [--boundary <rel> ...] [--repository <rel> ...] \\\n` +
      `                              [--service-backed] [--json]\n\n` +
      `service_backed + module paths are read from --architecture when given; flags override.\n` +
      `Exit 0 = clean / exempt; exit 1 = boundary calls the DB session directly or no repository.\n`,
  );
  process.exit(0);
}

const p = parse(process.argv.slice(2));

// Derive config from architecture.json when provided, then let explicit flags win.
let serviceBacked = p.serviceBacked ?? false;
let boundary = p.boundary;
let repository = p.repository;
if (p.architecture) {
  let archJson = "";
  try {
    archJson = readFileSync(p.architecture, "utf8");
  } catch {
    process.stderr.write(`layering-clean: cannot read architecture file ${p.architecture}\n`);
    process.exit(1);
  }
  const cfg = layeringConfigFromArchitecture(archJson);
  if (p.serviceBacked === undefined) serviceBacked = cfg.serviceBacked;
  if (boundary.length === 0) boundary = cfg.boundaryModules;
  if (repository.length === 0) repository = cfg.repositoryModules;
}

const callArgs: LayeringCleanArgs = { projectDir: p.projectDir, serviceBacked };
if (boundary.length > 0) callArgs.boundaryModules = boundary;
if (repository.length > 0) callArgs.repositoryModules = repository;

const result = checkLayeringClean(callArgs);

if (p.json) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (result.clean) {
  const what = serviceBacked
    ? result.scanned.length
      ? `boundary clean (scanned: ${result.scanned.join(", ")})`
      : "no boundary modules to scan"
    : "feature is not service-backed (layering not required)";
  process.stdout.write(`layering-clean: OK , ${what}\n`);
} else {
  process.stderr.write(
    `layering-clean: FAILED , the boundary/routes layer is not cleanly separated from persistence.\n\n` +
      `${result.violations.map((v) => `  ${v}`).join("\n")}\n\n` +
      `Remediation: ${result.remediation}\n`,
  );
}

process.exit(result.clean ? 0 : 1);
