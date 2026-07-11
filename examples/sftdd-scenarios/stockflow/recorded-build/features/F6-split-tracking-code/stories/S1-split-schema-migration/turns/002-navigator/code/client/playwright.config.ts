import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the rendered SPA through a real browser against the
// real backend, backed by the paired Lakebase branch. Playwright boots BOTH
// servers: the backend FIRST (so Vite's /api proxy has a target), then Vite.
// Adapt the backend `command`/`url` to your stack if it is not Python/FastAPI.
//
// Resiliency: the ports are env-driven (E2E_BACKEND_PORT / E2E_CLIENT_PORT) with
// the conventional defaults. In CI (reuseExistingServer:false), a stale server
// left on 8000/5173 by a prior run would otherwise make webServer hard-fail with
// "port already used". So CI's E2E step allocates FREE ports (scripts/port-utils.sh,
// the same probe run-dev.sh uses) and hands them in here , the run moves off a
// busy port instead of colliding. The Vite proxy is pointed at the resolved
// backend port via VITE_PROXY_TARGET so /api + /health still reach the backend.
const BACKEND_PORT = process.env.E2E_BACKEND_PORT ?? "8000";
const CLIENT_PORT = process.env.E2E_CLIENT_PORT ?? "5173";
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Serialize specs when they share real-DB state via a seed/restore step.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: CLIENT_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Python/FastAPI backend. For other stacks:
      //   Node.js:     npm --prefix .. run start   (poll your /health)
      //   Java/Spring: ../mvnw -q spring-boot:run  (poll /actuator/health)
      command: `uv run --project .. uvicorn app.main:app --port ${BACKEND_PORT}`,
      url: `${BACKEND_URL}/health`,
      cwd: "..",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABRICKS_HOST: process.env.DATABRICKS_HOST ?? "",
        DATABRICKS_TOKEN: process.env.DATABRICKS_TOKEN ?? "",
      },
    },
    {
      command: `npm run dev -- --port ${CLIENT_PORT} --strictPort`,
      url: CLIENT_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Point the Vite dev proxy at the resolved backend port so /api + /health
      // reach the backend even when it moved off the default 8000.
      env: {
        VITE_PROXY_TARGET: BACKEND_URL,
      },
    },
  ],
});
