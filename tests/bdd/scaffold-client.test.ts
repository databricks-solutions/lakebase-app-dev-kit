// Coverage for the React SPA client scaffold (templates/project/client) and its
// generator seam deployClientProject. Pure filesystem; no live Lakebase, no git.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { deployClientProject } from "../../scripts/lakebase/scaffold.js";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TEMPLATES = path.join(REPO_ROOT, "templates", "project");

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
});

function mkTarget(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-client-"));
  tmpDirs.push(dir);
  return dir;
}

function read(dir: string, rel: string): string {
  return fs.readFileSync(path.join(dir, rel), "utf8");
}

describe("deployClientProject", () => {
  it("writes the layered React SPA scaffold under client/", () => {
    const target = mkTarget();
    const written = deployClientProject(target, "demoapp", { templatesDir: TEMPLATES });

    // Every layer the SPA client conventions require exists, each tested on its
    // own side (api = only fetch layer, then hooks/components/pages/styles).
    for (const f of [
      "client/package.json",
      "client/vite.config.ts",
      "client/tsconfig.json",
      "client/index.html",
      "client/playwright.config.ts",
      "client/src/main.tsx",
      "client/src/App.tsx",
      "client/src/api/client.ts",
      "client/src/hooks/useHealth.ts",
      "client/src/components/StatusBadge.tsx",
      "client/src/pages/HomePage.tsx",
      "client/src/styles/theme.css",
      "client/tests/setup.ts",
      "client/tests/e2e/home.spec.ts",
    ]) {
      expect(fs.existsSync(path.join(target, f)), `${f} should be scaffolded`).toBe(true);
      expect(written).toContain(f);
    }
  });

  it("substitutes {{PROJECT_NAME}} and leaves no unresolved placeholder", () => {
    const target = mkTarget();
    deployClientProject(target, "warehouse-ui", { templatesDir: TEMPLATES });

    const pkg = read(target, "client/package.json");
    expect(pkg).toContain("warehouse-ui");
    // The whole client tree must carry no residual placeholder.
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else if (fs.readFileSync(p, "utf8").includes("{{PROJECT_NAME}}")) out.push(p);
      }
      return out;
    };
    expect(walk(path.join(target, "client"))).toEqual([]);
  });

  it("ships the React + Vite + Vitest + Playwright toolchain in package.json", () => {
    const target = mkTarget();
    deployClientProject(target, "demoapp", { templatesDir: TEMPLATES });
    const pkg = JSON.parse(read(target, "client/package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(pkg.dependencies.react).toBeTruthy();
    expect(pkg.dependencies["react-router-dom"]).toBeTruthy();
    expect(pkg.devDependencies.vite).toBeTruthy();
    expect(pkg.devDependencies.vitest).toBeTruthy();
    expect(pkg.devDependencies["@playwright/test"]).toBeTruthy();
    expect(pkg.devDependencies["@testing-library/react"]).toBeTruthy();
    // The CI + run-tests wiring keys off these script names.
    expect(pkg.scripts.build).toBeTruthy();
    expect(pkg.scripts.test).toBeTruthy();
  });

  it("wires the API proxy through VITE_PROXY_TARGET so /api reaches the backend", () => {
    const target = mkTarget();
    deployClientProject(target, "demoapp", { templatesDir: TEMPLATES });
    const vite = read(target, "client/vite.config.ts");
    expect(vite).toContain("VITE_PROXY_TARGET");
    expect(vite).toContain("/api");
  });

  it("Playwright config takes its ports from env with defaults, so CI can hand it FREE ports", () => {
    // Resiliency: in CI (reuseExistingServer:false) a stale server on the default
    // port would make webServer hard-fail. The config reads E2E_BACKEND_PORT /
    // E2E_CLIENT_PORT (CI allocates free ones via port-utils.sh) and defaults to
    // the conventional 8000/5173 locally. The backend port must flow into the
    // uvicorn command, the /health poll URL, AND the Vite proxy target.
    const target = mkTarget();
    deployClientProject(target, "demoapp", { templatesDir: TEMPLATES });
    const cfg = read(target, "client/playwright.config.ts");
    expect(cfg).toMatch(/E2E_BACKEND_PORT/);
    expect(cfg).toMatch(/E2E_CLIENT_PORT/);
    expect(cfg).toMatch(/\?\?\s*"8000"/);
    expect(cfg).toMatch(/\?\?\s*"5173"/);
    // The uvicorn webServer command binds the resolved backend port, not a literal.
    expect(cfg).toMatch(/uvicorn app\.main:app --port \$\{BACKEND_PORT\}/);
    // The Vite dev proxy is pointed at the resolved backend so /api still reaches it.
    expect(cfg).toMatch(/VITE_PROXY_TARGET:\s*BACKEND_URL/);
  });
});
