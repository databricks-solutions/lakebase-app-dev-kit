// BDD coverage for the layering-clean gate (scripts/tdd/layering-clean.ts).
// Each test builds an isolated temp project so the static source scan runs
// against a real working tree (no interpreter needed). The gate proves a
// service-backed feature's boundary/routes layer does NOT call the DB session
// directly (a fat controller) and that a repository layer exists.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  checkLayeringClean,
  checkModulePlacement,
  checkInlineRendering,
  checkCodeBudget,
  checkDuplicateClasses,
  layeringConfigFromArchitecture,
} from "../../scripts/tdd/layering-clean.js";

const tmpDirs: string[] = [];

function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layering-clean-"));
  tmpDirs.push(dir);
  return dir;
}

function write(dir: string, rel: string, body: string): void {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

/** A boundary (FastAPI route module) that calls the DB session directly. */
const FAT_CONTROLLER = `
from fastapi import APIRouter, Depends
from app.db import get_session

router = APIRouter()

@router.post("/bugs")
def create_bug(payload: dict, db = Depends(get_session)):
    bug = Bug(**payload)
    db.add(bug)
    db.commit()
    return bug
`;

/** A boundary that delegates to a service (no session ops). */
const CLEAN_BOUNDARY = `
from fastapi import APIRouter, Depends
from app.services.bug_service import BugService

router = APIRouter()

@router.post("/bugs")
def create_bug(payload: dict, service: BugService = Depends()):
    return service.create(payload)
`;

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  }
});

describe("checkLayeringClean", () => {
  it("flags a service-backed boundary that calls the DB session directly (fat controller)", () => {
    const dir = mkProject();
    write(dir, "app/routes/bugs.py", FAT_CONTROLLER);
    // even with a repository present, the session op in the boundary is a violation
    write(dir, "app/repositories/bug_repository.py", "class BugRepository:\n    pass\n");

    const r = checkLayeringClean({ projectDir: dir, serviceBacked: true });
    expect(r.clean).toBe(false);
    if (!r.clean) {
      expect(r.violations.join("\n")).toMatch(/bugs\.py:\d+/);
      expect(r.violations.join("\n")).toMatch(/db\.add|db\.commit/);
      expect(r.remediation).toBeTruthy();
    }
  });

  it("passes a layered fixture: clean boundary + a repository module exists", () => {
    const dir = mkProject();
    write(dir, "app/routes/bugs.py", CLEAN_BOUNDARY);
    write(dir, "app/services/bug_service.py", "class BugService:\n    pass\n");
    write(dir, "app/repositories/bug_repository.py", "class BugRepository:\n    pass\n");

    const r = checkLayeringClean({ projectDir: dir, serviceBacked: true });
    expect(r.clean).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.scanned.some((s) => s.endsWith("bugs.py"))).toBe(true);
  });

  it("flags a service-backed feature with a clean boundary but NO repository module", () => {
    const dir = mkProject();
    write(dir, "app/routes/bugs.py", CLEAN_BOUNDARY);
    write(dir, "app/services/bug_service.py", "class BugService:\n    pass\n");
    // no app/repositories/* nor app/repository.py

    const r = checkLayeringClean({ projectDir: dir, serviceBacked: true });
    expect(r.clean).toBe(false);
    if (!r.clean) {
      expect(r.violations.join("\n")).toMatch(/no repository module/);
    }
  });

  it("exempts a feature that is not service-backed (layering not warranted)", () => {
    const dir = mkProject();
    write(dir, "app/routes/bugs.py", FAT_CONTROLLER);

    const r = checkLayeringClean({ projectDir: dir, serviceBacked: false });
    expect(r.clean).toBe(true);
    expect(r.scanned).toEqual([]);
  });

  it("is clean when there are no boundary modules to scan", () => {
    const dir = mkProject();
    // service-backed but no app/main.py and no app/routes
    const r = checkLayeringClean({ projectDir: dir, serviceBacked: true });
    expect(r.clean).toBe(true);
    expect(r.scanned).toEqual([]);
  });

  it("honors explicit boundary + repository module overrides", () => {
    const dir = mkProject();
    write(dir, "src/api/handlers.py", FAT_CONTROLLER);
    write(dir, "src/data/store.py", "class Store:\n    pass\n");

    const dirty = checkLayeringClean({
      projectDir: dir,
      serviceBacked: true,
      boundaryModules: ["src/api/handlers.py"],
      repositoryModules: ["src/data/store.py"],
    });
    expect(dirty.clean).toBe(false);

    write(dir, "src/api/clean.py", CLEAN_BOUNDARY);
    const clean = checkLayeringClean({
      projectDir: dir,
      serviceBacked: true,
      boundaryModules: ["src/api/clean.py"],
      repositoryModules: ["src/data/store.py"],
    });
    expect(clean.clean).toBe(true);
  });

  it("does not false-positive on dict.get / non-session .get calls", () => {
    const dir = mkProject();
    write(
      dir,
      "app/routes/bugs.py",
      `
from fastapi import APIRouter
router = APIRouter()

@router.get("/bugs/{id}")
def read_bug(id: int, cache: dict):
    return cache.get(id)
`,
    );
    write(dir, "app/repositories/bug_repository.py", "class BugRepository:\n    pass\n");
    const r = checkLayeringClean({ projectDir: dir, serviceBacked: true });
    expect(r.clean).toBe(true);
  });
});

describe("layeringConfigFromArchitecture", () => {
  it("reads service_backed + boundary/repository module paths from architecture.json layers", () => {
    const arch = JSON.stringify({
      service_backed: true,
      layers: [
        { name: "API", role: "boundary", module: "app/routes" },
        { name: "Domain", role: "service", module: "app/services" },
        { name: "Persistence", role: "repository", module: "app/repositories" },
      ],
    });
    const cfg = layeringConfigFromArchitecture(arch);
    expect(cfg.serviceBacked).toBe(true);
    expect(cfg.boundaryModules).toEqual(["app/routes"]);
    expect(cfg.repositoryModules).toEqual(["app/repositories"]);
  });

  it("returns serviceBacked=false for a non-service-backed architecture", () => {
    const cfg = layeringConfigFromArchitecture(JSON.stringify({ service_backed: false }));
    expect(cfg.serviceBacked).toBe(false);
    expect(cfg.boundaryModules).toEqual([]);
    expect(cfg.repositoryModules).toEqual([]);
  });

  it("tolerates invalid / empty JSON", () => {
    expect(layeringConfigFromArchitecture("not json")).toEqual({
      serviceBacked: false,
      boundaryModules: [],
      repositoryModules: [],
      allModules: [],
    });
  });

  it("returns allModules + boundary renders_via", () => {
    const cfg = layeringConfigFromArchitecture(
      JSON.stringify({
        service_backed: true,
        layers: [
          { role: "boundary", module: "app/routes/", renders_via: "jinja2" },
          { role: "service", module: "app/services/" },
          { role: "repository", module: "app/repositories/" },
        ],
      }),
    );
    expect(cfg.allModules).toHaveLength(3);
    expect(cfg.rendersVia).toBe("jinja2");
  });
});

describe("checkModulePlacement (A1): layers live at their declared module paths", () => {
  it("flags a flat file where a package directory was declared", () => {
    const dir = mkProject();
    write(dir, "app/services.py", "x = 1\n"); // built flat
    const r = checkModulePlacement(dir, [{ role: "service", module: "app/services/" }]);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/service.*app\/services\/.*package directory/i);
  });

  it("passes when each declared module exists as declared (dir for `/`, file for `.py`)", () => {
    const dir = mkProject();
    write(dir, "app/services/bug_service.py", "x = 1\n");
    write(dir, "app/main.py", "x = 1\n");
    const r = checkModulePlacement(dir, [
      { role: "service", module: "app/services/" },
      { role: "boundary", module: "app/main.py" },
    ]);
    expect(r.ok).toBe(true);
  });

  it("flags a declared module that does not exist at all", () => {
    const dir = mkProject();
    const r = checkModulePlacement(dir, [{ role: "repository", module: "app/repositories/" }]);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/not found/i);
  });

  it("flags a STALE flat module shadowing a correctly-built package (the F5 orphan)", () => {
    // The package exists as declared AND a leftover flat app/models.py sits
    // alongside it (an orphan from a flat->package migration that was never
    // deleted). The package is correct; the flat shadow is the violation.
    const dir = mkProject();
    write(dir, "app/models/recipe.py", "class Recipe: ...\n");
    write(dir, "app/models.py", "class Recipe: ...\n"); // stale orphan
    const r = checkModulePlacement(dir, [{ role: "models", module: "app/models/" }]);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/stale flat app\/models\.py.*alongside|orphan.*flat->package/i);
  });

  it("passes a declared package with NO flat shadow alongside it", () => {
    const dir = mkProject();
    write(dir, "app/models/recipe.py", "class Recipe: ...\n");
    const r = checkModulePlacement(dir, [{ role: "models", module: "app/models/" }]);
    expect(r.ok).toBe(true);
  });
});

describe("checkDuplicateClasses (A4): no class is defined in two modules", () => {
  it("flags the same top-level class defined in two modules (the F5 Recipe orphan)", () => {
    const dir = mkProject();
    write(dir, "app/models/recipe.py", "class Recipe(Base):\n    __tablename__ = 'recipes'\n");
    write(dir, "app/models.py", "class Recipe(Base):\n    __tablename__ = 'recipes'\n"); // stale orphan
    const r = checkDuplicateClasses(dir);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/class Recipe is defined in 2 modules/);
    expect(r.violations.join(" ")).toMatch(/app\/models\.py/);
    expect(r.violations.join(" ")).toMatch(/app\/models\/recipe\.py/);
    expect(r.remediation).toBeTruthy();
  });

  it("catches the duplicate even when NO architecture/layers are declared (declaration-independent)", () => {
    // This is the resiliency the placement check lacks: it needs no `models` layer
    // declaration , it scans source directly, so an architect omitting the layer
    // cannot let a duplicate class slip through.
    const dir = mkProject();
    write(dir, "app/models.py", "class Recipe:\n    pass\n");
    write(dir, "app/domain/recipe.py", "class Recipe:\n    pass\n");
    // no architecture.json anywhere; the gate still fires
    const r = checkDuplicateClasses(dir);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/class Recipe is defined in 2 modules/);
  });

  it("passes when each class is defined in exactly one module", () => {
    const dir = mkProject();
    write(dir, "app/models/recipe.py", "class Recipe(Base):\n    pass\n");
    write(dir, "app/models/cuisine.py", "class Cuisine(Base):\n    pass\n");
    write(dir, "app/models/__init__.py", "from .recipe import Recipe\nfrom .cuisine import Cuisine\n"); // re-export, not a def
    const r = checkDuplicateClasses(dir);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("ignores nested Config/Meta classes (only column-0 defs count)", () => {
    const dir = mkProject();
    write(dir, "app/schemas/recipe.py", "class RecipeIn(BaseModel):\n    name: str\n    class Config:\n        orm_mode = True\n");
    write(dir, "app/schemas/cuisine.py", "class CuisineIn(BaseModel):\n    name: str\n    class Config:\n        orm_mode = True\n");
    const r = checkDuplicateClasses(dir);
    expect(r.ok).toBe(true); // two nested `Config` classes are NOT a duplicate
  });

  it("ignores test files and migration dirs (legit repeated names there)", () => {
    const dir = mkProject();
    write(dir, "app/models/recipe.py", "class Recipe(Base):\n    pass\n");
    write(dir, "tests/test_recipe.py", "class Recipe:\n    pass\n"); // test fixture, skipped
    write(dir, "alembic/versions/0001_init.py", "class Recipe:\n    pass\n"); // migration dir, skipped
    write(dir, "app/conftest.py", "class Recipe:\n    pass\n"); // conftest, skipped
    const r = checkDuplicateClasses(dir);
    expect(r.ok).toBe(true);
  });
});

describe("checkInlineRendering (A2): boundary renders via a framework, not inline HTML", () => {
  it("flags a boundary returning an inline HTML document with no templating seam", () => {
    const dir = mkProject();
    write(dir, "app/main.py", `from fastapi.responses import HTMLResponse\n\ndef page():\n    html = "<!DOCTYPE html><html><body>hi</body></html>"\n    return HTMLResponse(content=html)\n`);
    const r = checkInlineRendering(dir, ["app/main.py"], "jinja2");
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/inline HTML/i);
  });

  it("passes a boundary that uses a TemplateResponse seam", () => {
    const dir = mkProject();
    write(dir, "app/main.py", `from fastapi.templating import Jinja2Templates\ntemplates = Jinja2Templates(directory="templates")\n\ndef page(request):\n    return templates.TemplateResponse("index.html", {"request": request})\n`);
    const r = checkInlineRendering(dir, ["app/main.py"], "jinja2");
    expect(r.ok).toBe(true);
  });
});

describe("checkCodeBudget (A3): DRY + function-length budget", () => {
  it("flags an over-long function", () => {
    const dir = mkProject();
    const body = Array.from({ length: 70 }, (_, i) => `    x${i} = ${i}`).join("\n");
    write(dir, "app/services.py", `def big():\n${body}\n`);
    const r = checkCodeBudget(dir, ["app/services.py"], { maxFunctionLines: 60 });
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/def big is \d+ lines/i);
  });

  it("flags a duplicated block across two files (DRY)", () => {
    const dir = mkProject();
    const block = `    total = compute_total(items)\n    tax = total * rate\n    grand = total + tax\n    log.info(grand)\n    persist(grand)\n    notify(grand)\n`;
    write(dir, "app/a.py", `def fa():\n${block}`);
    write(dir, "app/b.py", `def fb():\n${block}`);
    const r = checkCodeBudget(dir, ["app/a.py", "app/b.py"], { dupWindow: 6 });
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toMatch(/duplicated .*block/i);
  });

  it("passes clean, short, non-duplicated code", () => {
    const dir = mkProject();
    write(dir, "app/services.py", `def small(x):\n    return x + 1\n`);
    expect(checkCodeBudget(dir, ["app/services.py"]).ok).toBe(true);
  });
});
