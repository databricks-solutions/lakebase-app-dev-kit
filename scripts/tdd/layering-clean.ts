// layering-clean gate: prove a service-backed feature's boundary/routes layer does
// NOT touch persistence directly (a fat controller), and that a repository layer
// exists.
//
// Why this exists: a build agent that puts `db.add(...)` / `db.commit()` /
// `db.query(...)` straight in a FastAPI route handler greens its behavior tests
// (the behavior is correct) but violates the layered-architecture contract the
// architect declared in architecture.json `layers` (boundary -> service ->
// repository -> ORM). Behavior tests never catch that; this gate does,
// deterministically + model-independently, by scanning the boundary module's
// source for SQLAlchemy session operations and confirming a repository module
// exists. The fix the agent should have written is to extract a service +
// repository and have the route delegate. This is the `layering-violation` smell.
//
// Static (no interpreter needed): read the boundary source, regex the session
// ops, check the repository path. Scoped to service-backed features (the YAGNI
// guard); a non-service-backed feature is exempt.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface LayeringCleanArgs {
  projectDir: string;
  /** From architecture.json `service_backed`. A false/absent value exempts the
   *  feature (layering is not required where it is not warranted). */
  serviceBacked: boolean;
  /** Boundary module paths (project-relative) from architecture.json `layers`
   *  (role=boundary). Defaults to the Python convention: app/main.py + app/routes. */
  boundaryModules?: string[];
  /** Repository module paths (role=repository) whose existence proves the
   *  persistence layer was extracted. Defaults to app/repositories +
   *  app/repository.py. */
  repositoryModules?: string[];
}

export interface LayeringCleanResult {
  clean: boolean;
  /** Boundary files that were scanned. */
  scanned: string[];
  /** "file:line  <code>" for each boundary line doing a session op (the violation). */
  violations: string[];
  remediation?: string;
}

// SQLAlchemy session operations: persistence happening in THIS file. `db.`,
// `session.`, or `self._session.` prefix + a session method. (`.get(` is omitted
// to avoid dict.get false positives; the create/read/update/delete verbs below
// are unambiguous SQLAlchemy session calls.)
const SESSION_OP =
  /\b(?:db|session|_session|self\._?session)\s*\.\s*(query|add|add_all|commit|delete|merge|flush|execute|refresh|scalars|scalar)\s*\(/;

const REMEDIATION =
  "The boundary/routes layer calls the DB session directly (a fat controller). " +
  "Extract a service (business logic) + a repository (the ONLY layer that touches " +
  "the ORM/session); the route handler validates input + delegates to the service. " +
  "See the `layering-violation` smell + @architectural-design-principles layered-architecture.";

const DEFAULT_BOUNDARY = ["app/main.py", "app/routes"];
const DEFAULT_REPOSITORY = ["app/repositories", "app/repository.py"];

/** Collect *.py files for a project-relative path (a file -> itself; a dir ->
 *  its .py files, one level deep). Missing paths contribute nothing. */
function pyFilesFor(projectDir: string, rel: string): string[] {
  const abs = join(projectDir, rel);
  if (!existsSync(abs)) return [];
  let isDir = false;
  try {
    isDir = statSync(abs).isDirectory();
  } catch {
    return [];
  }
  if (!isDir) return rel.endsWith(".py") ? [abs] : [];
  const out: string[] = [];
  for (const f of readdirSync(abs)) {
    if (f.endsWith(".py") && f !== "__init__.py") out.push(join(abs, f));
  }
  return out;
}

/** Does any repository module path exist? (the persistence layer was extracted) */
function repositoryExists(projectDir: string, repositoryModules: string[]): boolean {
  return repositoryModules.some((rel) => existsSync(join(projectDir, rel)));
}

/**
 * Check the layering contract statically. Returns clean=true when the feature is
 * not service-backed (exempt), or when no boundary file does a session op AND a
 * repository module exists. Python-focused (the kit's persistence stack); a
 * project with no boundary files to scan is treated as clean (nothing to check).
 */
export function checkLayeringClean(args: LayeringCleanArgs): LayeringCleanResult {
  if (!args.serviceBacked) {
    return { clean: true, scanned: [], violations: [] };
  }
  const boundary = args.boundaryModules?.length ? args.boundaryModules : DEFAULT_BOUNDARY;
  const repository = args.repositoryModules?.length ? args.repositoryModules : DEFAULT_REPOSITORY;

  const scanned: string[] = [];
  const violations: string[] = [];
  for (const rel of boundary) {
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

  // A service-backed feature with no repository module is itself a violation (the
  // persistence layer was never extracted), even if the boundary happens to be clean.
  if (scanned.length > 0 && !repositoryExists(args.projectDir, repository)) {
    violations.push(`no repository module found (expected one of: ${repository.join(", ")})`);
  }

  if (violations.length > 0) {
    return { clean: false, scanned, violations, remediation: REMEDIATION };
  }
  return { clean: true, scanned, violations: [] };
}

/** Read `service_backed` + the boundary/repository module paths out of an
 *  architecture.json string, for the CLI. Tolerant of absent/invalid JSON. */
export function layeringConfigFromArchitecture(architectureJson: string): {
  serviceBacked: boolean;
  boundaryModules: string[];
  repositoryModules: string[];
} {
  let parsed: { service_backed?: boolean; layers?: Array<{ role?: string; module?: string }> };
  try {
    parsed = JSON.parse(architectureJson);
  } catch {
    return { serviceBacked: false, boundaryModules: [], repositoryModules: [] };
  }
  const modulesByRole = (role: string): string[] =>
    (parsed.layers ?? [])
      .filter((l) => l.role === role && typeof l.module === "string")
      .map((l) => l.module as string);
  return {
    serviceBacked: parsed.service_backed === true,
    boundaryModules: modulesByRole("boundary"),
    repositoryModules: modulesByRole("repository"),
  };
}
