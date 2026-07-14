#!/usr/bin/env node
"use strict";

// scripts/sftdd/migration-app-clean.ts
var import_node_fs = require("fs");
var import_node_path = require("path");
var DEFAULT_MIGRATION_DIRS = ["alembic/versions", "migrations", "db/migrations", "src/migrations"];
var EXCLUDE_DIR = /(^|\/)(node_modules|\.git|\.venv|venv|__pycache__)(\/|$)/;
var MODULE_SCOPE_APP_IMPORT = /^(from\s+app\b|import\s+app\b)/;
function walk(dir, keep, out = []) {
  let entries;
  try {
    entries = (0, import_node_fs.readdirSync)(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = (0, import_node_path.join)(dir, e);
    let st;
    try {
      st = (0, import_node_fs.statSync)(abs);
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
function checkMigrationAppClean(args) {
  const migrationDirs = args.migrationDirs ?? DEFAULT_MIGRATION_DIRS;
  const violations = [];
  for (const md of migrationDirs) {
    const abs = (0, import_node_path.join)(args.projectDir, md);
    if (!(0, import_node_fs.existsSync)(abs)) continue;
    for (const file of walk(abs, (p2) => (0, import_node_path.extname)(p2) === ".py")) {
      let lines;
      try {
        lines = (0, import_node_fs.readFileSync)(file, "utf8").split("\n");
      } catch {
        continue;
      }
      lines.forEach((text, i) => {
        if (MODULE_SCOPE_APP_IMPORT.test(text)) {
          violations.push({ file: (0, import_node_path.relative)(args.projectDir, file), line: i + 1, text: text.trim().slice(0, 200) });
        }
      });
    }
  }
  if (violations.length === 0) return { clean: true, violations: [] };
  const list = violations.map((v) => `  ${v.file}:${v.line}  ${v.text}`).join("\n");
  const remediation = `MIGRATION-APP-COUPLING: the migration(s) below import app code at module scope. A migration is an immutable historical artifact; importing mutable app code means a later rename/move/removal of that symbol breaks replaying the migration from base, and it loads under \`alembic upgrade\` (env.py sets sys.path) yet fails in \`alembic history\`/\`heads\` (which do not). Make the migration self-contained: inline a frozen copy of the needed logic directly in the migration file (or express the change in raw SQL). Do NOT import from app.* at module scope:
${list}`;
  return { clean: false, violations, remediation };
}

// scripts/sftdd/migration-app-clean.cli.ts
function parse(argv) {
  const out = { projectDir: process.cwd(), migrations: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--migrations" && i + 1 < argv.length) out.migrations.push(argv[++i]);
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}
function help() {
  process.stdout.write(
    `lakebase-sftdd-migration-clean: prove no migration imports app code at module scope

Usage:
  lakebase-sftdd-migration-clean [--project-dir <path>] [--migrations <rel> ...] [--json]

Exit 0 = clean; exit 1 = a migration imports app.* at module scope (migration-app-coupling).
`
  );
  process.exit(0);
}
var p = parse(process.argv.slice(2));
var callArgs = { projectDir: p.projectDir };
if (p.migrations.length > 0) callArgs.migrationDirs = p.migrations;
var r = checkMigrationAppClean(callArgs);
if (p.json) {
  process.stdout.write(`${JSON.stringify(r)}
`);
} else if (r.clean) {
  process.stdout.write(`migration-app-clean: OK (no migration imports app.* at module scope)
`);
} else {
  process.stderr.write(`migration-app-clean: FAILED (${r.violations.length} module-scope app import(s)).

${r.remediation}
`);
}
process.exit(r.clean ? 0 : 1);
//# sourceMappingURL=migration-app-clean.cli.cjs.map