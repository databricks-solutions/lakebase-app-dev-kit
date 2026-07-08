// BDD coverage for the migration-self-containment gate (scripts/sftdd/migration-app-clean.ts)
// + its wiring into the honest-GREEN path (greenOpenCycle).
//
// A migration is an immutable historical artifact; importing app code at MODULE
// scope couples it to mutable app code and breaks CI's `alembic history` (which,
// unlike `upgrade`, does not run env.py to set sys.path). It greens locally yet
// fails in CI. The gate scans migration files for module-scope app imports and,
// because it runs PROACTIVELY at GREEN even when the local verify passes, catches
// it before the PR: a hit converts the passing verify into a routed repair.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { checkMigrationAppClean } from "../../scripts/sftdd/migration-app-clean.js";
import { beginNextPendingCycle, greenOpenCycle, type GreenVerifier } from "../../scripts/sftdd/cycle-record.js";
import { readGreenFailure } from "../../scripts/sftdd/supersession.js";

const tmpDirs: string[] = [];
function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-app-clean-"));
  tmpDirs.push(dir);
  return dir;
}
function write(dir: string, rel: string, body: string): void {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});

const APP_IMPORT_MIGRATION = `"""split inventory code"""
from alembic import op
import sqlalchemy as sa
from app.services.inventory_code_parser import compose_inventory_code, parse_batch_and_serial

def upgrade():
    op.add_column('stock', sa.Column('batch_number', sa.String()))

def downgrade():
    op.drop_column('stock', 'batch_number')
`;

describe("checkMigrationAppClean", () => {
  it("flags a module-scope `from app... import` in a migration (file:line)", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0002_split.py", APP_IMPORT_MIGRATION);
    const r = checkMigrationAppClean({ projectDir: dir });
    expect(r.clean).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].file).toBe("alembic/versions/0002_split.py");
    expect(r.violations[0].text).toMatch(/from app\.services/);
    expect(r.remediation).toMatch(/self-contained/);
    expect(r.remediation).toMatch(/alembic history/);
  });

  it("flags a bare `import app`", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0003_x.py", "import app\n\ndef upgrade():\n    pass\n");
    expect(checkMigrationAppClean({ projectDir: dir }).clean).toBe(false);
  });

  it("does NOT flag an app import INDENTED inside a function body (runs only on execute, path is set)", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0004_ok.py", "def upgrade():\n    from app.services.parser import parse\n    parse()\n");
    expect(checkMigrationAppClean({ projectDir: dir }).clean).toBe(true);
  });

  it("matches on a word boundary, not a prefix (no false positive on `from application import`)", () => {
    const dir = mkProject();
    write(dir, "alembic/versions/0005_app_like.py", "from application_config import settings\nimport apples\n");
    expect(checkMigrationAppClean({ projectDir: dir }).clean).toBe(true);
  });

  it("is clean when there are no migrations", () => {
    expect(checkMigrationAppClean({ projectDir: mkProject() }).clean).toBe(true);
  });
});

// greenOpenCycle wiring: the gate runs even when the honest verify PASSES, so an
// app-importing migration that greens locally still routes a repair before the PR.
describe("greenOpenCycle: migration-app-coupling is caught proactively at GREEN", () => {
  const F = "F1";
  const S = "S1";
  const writeJson = (file: string, obj: unknown): void => fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
  const pass: GreenVerifier = async () => ({ passed: true, summary: "all tests green" });

  function scaffold(): { project: string; tdd: string } {
    const project = mkProject();
    const tdd = path.join(project, ".sftdd");
    const acsDir = path.join(tdd, "features", F, "stories", S, "acs");
    fs.mkdirSync(acsDir, { recursive: true });
    writeJson(path.join(acsDir, "AC1.json"), { id: "AC1", layer: "API", text: "split the code column" });
    const items = [{ id: "T1", description: "split inventory code", ac_id: "AC1", status: "pending" }];
    writeJson(path.join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
    writeJson(path.join(tdd, "features", F, "test-list.json"), { feature_id: F, items });
    const expDir = path.join(tdd, "experiments", F, S, "exp1");
    fs.mkdirSync(expDir, { recursive: true });
    fs.writeFileSync(path.join(expDir, "branch.txt"), "experiment-s1-exp1");
    writeJson(path.join(expDir, "outcomes.json"), { status: "running" });
    return { project, tdd };
  }

  it("a PASSING verify + an app-importing migration converts to a routed repair (does not green)", async () => {
    const { project, tdd } = scaffold();
    write(project, "alembic/versions/0002_split.py", APP_IMPORT_MIGRATION);

    beginNextPendingCycle({ sftddDir: tdd, featureId: F, story: S });
    const r = await greenOpenCycle({ sftddDir: tdd, featureId: F, story: S, verify: pass });

    expect(r.recorded).toBe(false);
    expect(r.needsAssess).toBe(true);
    expect(r.summary).toMatch(/MIGRATION-APP-COUPLING/);
    expect(readGreenFailure(tdd, F, S, "AC1")?.assessed).toBe(false);
  });

  it("a PASSING verify + a self-contained migration greens normally", async () => {
    const { project, tdd } = scaffold();
    write(project, "alembic/versions/0002_split.py", "from alembic import op\n\ndef upgrade():\n    op.add_column('stock', None)\n");

    beginNextPendingCycle({ sftddDir: tdd, featureId: F, story: S });
    const r = await greenOpenCycle({ sftddDir: tdd, featureId: F, story: S, verify: pass });

    expect(r.recorded).toBe(true);
  });
});
