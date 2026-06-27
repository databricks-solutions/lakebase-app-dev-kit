// Deterministic contract-completeness check (the contract half of expand/contract,
// software-design-principles hard rule 9). When a migration DROPS or RENAMES a
// column/table, the running code must stop referencing it in the SAME change (ORM
// models, repositories/queries, serializers/DTOs, templates), or the app emits SQL
// for something the database no longer has and crashes at runtime ("column ... does
// not exist") even though the migration "succeeded".
//
// This catches that DETERMINISTICALLY, with no model judgment: parse the project's
// migrations for the net set of dropped symbols (dropped and not later re-added, so
// an expand/contract that re-adds is not flagged), then grep the production code tree
// for residual references. A finding is a precise file:line list the Driver can
// repair directly , the self-heal that removes model variance from the contract loop
// (the Navigator assess used to have to both notice AND localize it). Mirrors the
// `layering-clean` / `imports-clean` deterministic gates.
//
// Static + hermetic by design: it reads the migration files + the code tree, never
// the live database (the migration's own drop/add statements ARE the contract delta).

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

export interface ContractCleanArgs {
  /** Project working-tree root. */
  projectDir: string;
  /** Migration dirs to scan (relative to projectDir). Default: common locations. */
  migrationDirs?: string[];
  /** Production code dirs to scan for residual references (relative to projectDir).
   *  Default: app, src, templates, lib. Tests + migrations are always excluded. */
  codeDirs?: string[];
}

export interface ContractViolation {
  /** Project-relative file path. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** The dropped symbol still referenced. */
  symbol: string;
  /** The offending source line (trimmed). */
  text: string;
}

export interface ContractCleanResult {
  clean: boolean;
  /** Net-dropped symbols (dropped by a migration, not re-added by a later one). */
  droppedSymbols: string[];
  /** Production-code references to a net-dropped symbol. */
  violations: ContractViolation[];
  /** A precise, Driver-actionable repair directive (the file:line list + hard rule 9),
   *  or undefined when clean. This is what gets recorded as the green-failure fixDirective. */
  remediation?: string;
}

const DEFAULT_MIGRATION_DIRS = ["alembic/versions", "migrations", "db/migrations", "src/migrations"];
const DEFAULT_CODE_DIRS = ["app", "src", "lib", "templates"];
const CODE_EXTS = new Set([".py", ".ts", ".tsx", ".js", ".jsx", ".html", ".jinja", ".jinja2", ".sql"]);
// Never scan these for residual refs (the migration legitimately names the dropped
// symbol; tests are refactored via supersession, not this gate; junk dirs).
const EXCLUDE_DIR = /(^|\/)(node_modules|\.git|\.venv|venv|__pycache__|\.sftdd|\.tdd|\.lakebase|dist|build|tests?|alembic|migrations)(\/|$)/;

/** alembic: op.drop_column('table', 'col')  /  op.add_column('table', sa.Column('col' ... */
const DROP_COLUMN_PY = /op\.drop_column\(\s*['"][^'"]+['"]\s*,\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g;
const ADD_COLUMN_PY = /op\.add_column\(\s*['"][^'"]+['"]\s*,\s*sa\.Column\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g;
/** raw SQL (flyway / knex .raw): ALTER TABLE t DROP COLUMN col / ADD COLUMN col */
const DROP_COLUMN_SQL = /drop\s+column\s+(?:if\s+exists\s+)?["'`]?([a-zA-Z_][a-zA-Z0-9_]*)["'`]?/gi;
const ADD_COLUMN_SQL = /add\s+column\s+(?:if\s+not\s+exists\s+)?["'`]?([a-zA-Z_][a-zA-Z0-9_]*)["'`]?/gi;

function walk(dir: string, keep: (abs: string) => boolean, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = join(dir, e);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!EXCLUDE_DIR.test(abs)) walk(abs, keep, out);
    } else if (st.isFile() && keep(abs)) {
      out.push(abs);
    }
  }
  return out;
}

function collectAll(re: RegExp, text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

/**
 * The FORWARD (upgrade / up) half of a migration file, excluding the
 * down/rollback half. A normal REVERSIBLE migration adds a column in upgrade()
 * and drops it in downgrade() (or vice versa); scanning the whole file would
 * misread that add-then-rollback-drop as a contract DROP and flag a column that
 * is actually present. Only the forward direction defines the live schema.
 *   - alembic (.py): the `def upgrade()` body, up to `def downgrade`.
 *   - knex / umzug (.js/.ts): the `up` function, up to the `down` half.
 *   - raw SQL (.sql): the whole file (forward-only by convention , a flyway undo
 *     lives in a separate undo file the migration dirs do not pair here).
 */
function forwardMigrationBody(src: string, ext: string): string {
  if (ext === ".py") {
    const m = /def\s+upgrade\s*\(/.exec(src);
    if (!m) return src;
    const bodyStart = m.index + m[0].length;
    const rel = src.slice(bodyStart).search(/\ndef\s+downgrade\s*\(/);
    return rel === -1 ? src.slice(bodyStart) : src.slice(bodyStart, bodyStart + rel);
  }
  if (ext === ".js" || ext === ".ts") {
    const up = /(exports\.up\b|async\s+function\s+up\b|\bup\s*[:=])/.exec(src);
    if (!up) return src;
    const after = src.slice(up.index + up[0].length);
    const rel = after.search(/(exports\.down\b|async\s+function\s+down\b|\bdown\s*[:=])/);
    return rel === -1 ? after : after.slice(0, rel);
  }
  return src;
}

/**
 * The net set of columns a migration dropped and did NOT re-add. Reading migrations
 * in filename order (alembic timestamps + most migration tools sort lexically) is a
 * good-enough proxy for revision order for the drop-vs-readd netting; a symbol whose
 * LAST add/drop action is a drop is "contract-dropped".
 */
export function netDroppedSymbols(projectDir: string, migrationDirs = DEFAULT_MIGRATION_DIRS): string[] {
  const files: string[] = [];
  for (const md of migrationDirs) {
    const abs = join(projectDir, md);
    if (existsSync(abs)) {
      for (const f of walk(abs, (p) => /\.(py|sql|js|ts)$/.test(p))) files.push(f);
    }
  }
  files.sort(); // filename order ~ revision order (alembic timestamp prefixes, etc.)
  // last action per symbol: "drop" | "add"
  const lastAction = new Map<string, "drop" | "add">();
  for (const f of files) {
    let src: string;
    try {
      src = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const ext = extname(f);
    const isPy = ext === ".py";
    // Only the FORWARD (upgrade) direction defines the live schema; a reversible
    // migration's downgrade() drop of a column it added is not a contract drop.
    const body = forwardMigrationBody(src, ext);
    const drops = isPy ? collectAll(DROP_COLUMN_PY, body) : collectAll(DROP_COLUMN_SQL, body);
    const adds = isPy ? collectAll(ADD_COLUMN_PY, body) : collectAll(ADD_COLUMN_SQL, body);
    // Within one migration, an add then drop (or vice versa) , take textual order by
    // scanning positions. Simpler + robust enough: process adds then drops so a
    // migration that drops a column marks it dropped (the common contract case).
    for (const a of adds) lastAction.set(a, "add");
    for (const d of drops) lastAction.set(d, "drop");
  }
  return [...lastAction.entries()].filter(([, act]) => act === "drop").map(([sym]) => sym);
}

/** A word-boundary matcher for a symbol used as an identifier (not a substring). */
function symbolRefRegex(symbol: string): RegExp {
  return new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
}

export function checkContractClean(args: ContractCleanArgs): ContractCleanResult {
  const { projectDir } = args;
  const dropped = netDroppedSymbols(projectDir, args.migrationDirs);
  if (dropped.length === 0) return { clean: true, droppedSymbols: [], violations: [] };

  const matchers = dropped.map((s) => ({ symbol: s, re: symbolRefRegex(s) }));
  const codeDirs = args.codeDirs ?? DEFAULT_CODE_DIRS;
  const violations: ContractViolation[] = [];
  for (const cd of codeDirs) {
    const abs = join(projectDir, cd);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs, (p) => CODE_EXTS.has(extname(p)))) {
      let lines: string[];
      try {
        lines = readFileSync(file, "utf8").split("\n");
      } catch {
        continue;
      }
      lines.forEach((text, i) => {
        for (const { symbol, re } of matchers) {
          if (re.test(text)) {
            violations.push({ file: relative(projectDir, file), line: i + 1, symbol, text: text.trim().slice(0, 200) });
          }
        }
      });
    }
  }
  if (violations.length === 0) return { clean: true, droppedSymbols: dropped, violations: [] };

  const list = violations.map((v) => `  ${v.file}:${v.line}  [${v.symbol}]  ${v.text}`).join("\n");
  const syms = [...new Set(violations.map((v) => v.symbol))].join(", ");
  const remediation =
    `CONTRACT-INCOMPLETENESS (software-design-principles hard rule 9): a migration DROPPED ${syms}, but the` +
    ` running code still references it, so the app emits SQL for a column the database no longer has and crashes` +
    ` ("${syms} does not exist") even though the migration succeeded. Remove or replace EVERY reference below in` +
    ` the SAME change , the ORM model field, every query/repository, every serializer/DTO, and every template/view` +
    ` , so the code matches the migrated schema. Do NOT edit the migration or any test to hide this; fix the` +
    ` production code:\n${list}`;
  return { clean: false, droppedSymbols: dropped, violations, remediation };
}
