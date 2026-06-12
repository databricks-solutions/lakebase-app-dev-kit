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
    });
  });
});
