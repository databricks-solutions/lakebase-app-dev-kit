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

// ─── A4: no duplicate class definitions (declaration-independent) ──
// A repo-wide invariant: a top-level class name is defined in exactly one module.
// Two modules defining the same top-level class (e.g. `Recipe` in both a leftover
// flat app/models.py and the app/models/recipe.py package) is the flat->package
// migration orphan in its most general form. Unlike checkModulePlacement, this does
// NOT depend on the architect declaring a `models` layer (models is an optional
// role), so it catches the duplicate even when placement cannot inspect that path.
// Duplicate ORM model classes also risk a double SQLAlchemy table registration.
// Nested classes (Pydantic `Config`, Django `Meta`) are intentionally ignored ,
// only column-0 `class` defs count, so common nested helpers never false-positive.

/** Directory names that are never application source (vendor / test / migration). */
const SOURCE_SKIP_DIRS = new Set([
  "node_modules", "__pycache__", ".venv", "venv", ".git", "build", "dist",
  ".tdd", ".lakebase", "alembic", "migrations", "tests", "test",
  ".mypy_cache", ".pytest_cache", ".ruff_cache",
]);

/** A test module (its classes legitimately repeat names across files). */
function isTestFile(name: string): boolean {
  return /^test_.*\.py$/.test(name) || /_test\.py$/.test(name) || name === "conftest.py";
}

/** Recursively collect application source *.py files under `dir`, skipping
 *  vendor/test/migration dirs and test files. */
function sourcePyFilesRec(dir: string, out: string[]): void {
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

export interface DuplicateClassResult {
  ok: boolean;
  violations: string[];
  remediation?: string;
}

const DUP_CLASS_REMEDIATION =
  "The same class is defined in more than one module. Keep ONE canonical definition " +
  "(usually the package that owns the layer) and delete the duplicate; re-export from the " +
  "package __init__ if a stable import path is needed. Duplicate ORM model classes also risk " +
  "a double table registration. See the `layering-violation` smell + DRY (one source of truth).";

// Column-0 `class Name:` or `class Name(Base):` , a top-level definition only
// (no leading whitespace, so nested Config/Meta classes are excluded).
const TOP_LEVEL_CLASS = /^class\s+([A-Za-z_]\w*)\s*[:(]/;

/**
 * Flag any top-level class name defined in 2+ source modules across the project.
 * Declaration-independent (does not read architecture.json): a repo-wide DRY/clean
 * invariant. Scans `roots` (default the existing of ["app", "src"]) recursively,
 * skipping vendor/test/migration dirs and test files. Only column-0 `class` defs
 * count, so nested Config/Meta classes never false-positive.
 */
export function checkDuplicateClasses(projectDir: string, roots: string[] = ["app", "src"]): DuplicateClassResult {
  const files: string[] = [];
  for (const r of roots) {
    const abs = join(projectDir, r);
    if (!existsSync(abs)) continue;
    try {
      if (statSync(abs).isDirectory()) sourcePyFilesRec(abs, files);
      else if (abs.endsWith(".py") && !isTestFile(r)) files.push(abs);
    } catch {
      /* skip unreadable root */
    }
  }
  // class name -> set of project-relative modules that define it at top level.
  const defs = new Map<string, Set<string>>();
  for (const file of files) {
    const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = TOP_LEVEL_CLASS.exec(line);
      if (!m) continue;
      const set = defs.get(m[1]) ?? new Set<string>();
      set.add(shown);
      defs.set(m[1], set);
    }
  }
  const violations: string[] = [];
  for (const [name, modules] of [...defs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (modules.size > 1) {
      violations.push(
        `class ${name} is defined in ${modules.size} modules: ${[...modules].sort().join(", ")} (keep one canonical definition, delete the duplicate)`,
      );
    }
  }
  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations, remediation: DUP_CLASS_REMEDIATION };
}

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

/** Read `service_backed` + the layer module paths + the boundary `renders_via`
 *  out of an architecture.json string, for the CLI. Tolerant of absent/invalid JSON. */
export function layeringConfigFromArchitecture(architectureJson: string): {
  serviceBacked: boolean;
  boundaryModules: string[];
  repositoryModules: string[];
  /** Every declared layer's role + module (for the placement check). */
  allModules: Array<{ role: string; module: string }>;
  /** The boundary layer's `renders_via` (templating framework), if declared. */
  rendersVia?: string;
} {
  let parsed: {
    service_backed?: boolean;
    layers?: Array<{ role?: string; module?: string; renders_via?: string }>;
  };
  try {
    parsed = JSON.parse(architectureJson);
  } catch {
    return { serviceBacked: false, boundaryModules: [], repositoryModules: [], allModules: [] };
  }
  const layers = parsed.layers ?? [];
  const modulesByRole = (role: string): string[] =>
    layers.filter((l) => l.role === role && typeof l.module === "string").map((l) => l.module as string);
  const allModules = layers
    .filter((l) => typeof l.role === "string" && typeof l.module === "string")
    .map((l) => ({ role: l.role as string, module: l.module as string }));
  const boundaryLayer = layers.find((l) => l.role === "boundary" && typeof l.renders_via === "string");
  return {
    serviceBacked: parsed.service_backed === true,
    boundaryModules: modulesByRole("boundary"),
    repositoryModules: modulesByRole("repository"),
    allModules,
    ...(boundaryLayer?.renders_via ? { rendersVia: boundaryLayer.renders_via } : {}),
  };
}

// ─── A1: module placement ────────────────────────────────────────
// The architect's `layers[].module` is the contract for WHERE each layer's code
// lives. Honor exactly what is declared (no imposed directory convention): a
// module ending in "/" must be a package directory; one ending in ".py" must be
// that file; a bare path may be either. A declared module the build put elsewhere
// (e.g. a flat `app/services.py` where `app/services/` was declared) is a
// layering-violation , the layering exists only on paper.

export interface PlacementResult {
  ok: boolean;
  violations: string[];
}

/** Each declared `layers[].module` must exist as declared. */
export function checkModulePlacement(projectDir: string, allModules: Array<{ role: string; module: string }>): PlacementResult {
  const violations: string[] = [];
  const kindOf = (abs: string): "dir" | "file" | "missing" => {
    if (!existsSync(abs)) return "missing";
    try {
      return statSync(abs).isDirectory() ? "dir" : "file";
    } catch {
      return "missing";
    }
  };
  for (const { role, module } of allModules) {
    const base = module.replace(/\/$/, "");
    const wantDir = module.endsWith("/");
    const wantFile = module.endsWith(".py");
    const here = kindOf(join(projectDir, base));
    if (wantDir) {
      if (here === "dir") {
        // The package exists as declared, but a stale flat `<base>.py` ALONGSIDE
        // it is a shadow-duplicate: an orphan from a flat->package migration that
        // was never deleted (e.g. v1's app/models.py left behind when a later
        // feature introduced the app/models/ package). Python shadows the flat
        // module with the package, so it is dead code, but it can re-register a
        // duplicate ORM table if imported directly and it confuses the build.
        // Flag it so the Driver deletes the orphan.
        if (kindOf(join(projectDir, `${base}.py`)) === "file") {
          violations.push(`declared ${role} layer "${module}" is a package, but a stale flat ${base}.py also exists alongside it (an orphan from a flat->package migration, shadowed + duplicating this layer); delete ${base}.py so only the package defines this layer`);
        }
        continue;
      }
      // The telling case: declared a package dir but the build made a flat
      // `<base>.py` (e.g. app/services/ declared, app/services.py built).
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
      // bare path: a directory, the file itself, or a `<base>.py` all satisfy it.
      if (here !== "missing" || kindOf(join(projectDir, `${base}.py`)) === "file") continue;
      violations.push(`declared ${role} layer module "${module}" not found (the build placed this layer's code elsewhere)`);
    }
  }
  return { ok: violations.length === 0, violations };
}

// ─── A2: inline rendering ────────────────────────────────────────
// The boundary must render through a templating framework (design-guide "UI
// Framework"), not hand-assemble HTML in a route handler. An inline HTML document
// returned from the boundary is unmaintainable + bypasses the design system.

const INLINE_HTML = /<!DOCTYPE\b|<html[\s>]|HTMLResponse\s*\(\s*(?:content\s*=\s*)?["'`]\s*<|return\s+f?["'`]{1,3}\s*<(?:html|!DOCTYPE)/i;
const TEMPLATE_SEAM = /\b(?:Jinja2Templates|TemplateResponse|render_template|templates\.TemplateResponse)\b/;
const INLINE_RENDER_REMEDIATION =
  "The boundary renders HTML inline instead of through a templating framework. " +
  "Render via the declared framework (e.g. Jinja2 TemplateResponse + a templates/ dir) " +
  "with stable data-testid seams; the route returns a rendered template, never an inline HTML string. " +
  "See the design-guide `UI Framework` section + @ui-ux-design-principles/testable-ui.";

export interface InlineRenderResult {
  ok: boolean;
  violations: string[];
  remediation?: string;
}

/**
 * Flag a boundary module that emits inline HTML without using a templating seam.
 * Scoped to UI features: runs when `rendersVia` is declared, or when inline HTML
 * is actually present (its presence is itself the signal). A boundary that uses a
 * TemplateResponse/Jinja2 seam is clean even if a stray tag appears in a string.
 */
export function checkInlineRendering(
  projectDir: string,
  boundaryModules: string[],
  rendersVia?: string,
): InlineRenderResult {
  const boundary = boundaryModules.length ? boundaryModules : DEFAULT_BOUNDARY;
  const violations: string[] = [];
  for (const rel of boundary) {
    for (const file of pyFilesFor(projectDir, rel)) {
      const src = readFileSync(file, "utf8");
      const hasInline = INLINE_HTML.test(src);
      const hasSeam = TEMPLATE_SEAM.test(src);
      if (hasInline && !hasSeam) {
        const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
        violations.push(`${shown}: boundary emits inline HTML with no templating seam (use ${rendersVia ?? "the declared templating framework"})`);
      }
    }
  }
  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations, remediation: INLINE_RENDER_REMEDIATION };
}

// ─── A3: DRY + complexity budget ─────────────────────────────────
// Heuristic (not a contract): flag copy-paste duplication + over-long functions
// across the feature's source. Catches the DRY/clean-code smells the Navigator
// REVIEW would otherwise have to eyeball. Budgets are conservative to avoid noise.

export interface CodeBudgetOptions {
  /** A def/function body longer than this many lines is flagged. Default 60. */
  maxFunctionLines?: number;
  /** A run of >= this many identical non-trivial lines appearing 2+ times is a dup. Default 6. */
  dupWindow?: number;
}

export interface CodeBudgetResult {
  ok: boolean;
  violations: string[];
}

function nontrivial(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && !t.startsWith("#") && t !== "}" && t !== "{" && t !== "return" && t !== "pass";
}

/** DRY + function-length budget over the given source files (project-relative shown). */
export function checkCodeBudget(projectDir: string, sourcePaths: string[], opts: CodeBudgetOptions = {}): CodeBudgetResult {
  const maxFn = opts.maxFunctionLines ?? 60;
  const dupWin = opts.dupWindow ?? 6;
  const violations: string[] = [];
  const files: string[] = [];
  for (const rel of sourcePaths) files.push(...pyFilesFor(projectDir, rel));

  // Function length: a `def ` line, then count body lines until the indent returns
  // to <= the def's indent (a blank-tolerant Python heuristic).
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
        const ind = (/^(\s*)/.exec(lines[j]) as RegExpExecArray)[1].length;
        if (ind <= indent) break;
        body++;
      }
      if (body > maxFn) violations.push(`${shown}:${i + 1}  def ${m[2]} is ${body} lines (> ${maxFn}); extract helpers (clean-code / single responsibility)`);
    }
  }

  // Duplication: hash each window of `dupWin` consecutive non-trivial lines; a
  // window appearing in 2+ places is copy-paste (DRY).
  const seen = new Map<string, string>();
  const reported = new Set<string>();
  for (const file of files) {
    const shown = file.startsWith(projectDir) ? file.slice(projectDir.length).replace(/^\//, "") : file;
    const lines = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(nontrivial);
    for (let i = 0; i + dupWin <= lines.length; i++) {
      const key = lines.slice(i, i + dupWin).join("");
      if (key.length < dupWin * 3) continue; // skip trivially short windows
      const first = seen.get(key);
      if (first === undefined) {
        seen.set(key, shown);
      } else if (!reported.has(key)) {
        reported.add(key);
        violations.push(`duplicated ${dupWin}-line block in ${first} and ${shown} (DRY: extract one shared helper)`);
      }
    }
  }
  return { ok: violations.length === 0, violations };
}
