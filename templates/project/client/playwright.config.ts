import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the rendered SPA through a real browser against the
// real backend, backed by the paired Lakebase branch. Playwright boots BOTH
// servers: the backend FIRST (so Vite's /api proxy has a target), then Vite.
// Adapt the backend `command`/`url` to your stack if it is not Python/FastAPI.
export default defineConfig({
  testDir: "./tests/e2e",
  // Serialize specs when they share real-DB state via a seed/restore step.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Python/FastAPI backend. For other stacks:
      //   Node.js:     npm --prefix .. run start   (poll your /health)
      //   Java/Spring: ../mvnw -q spring-boot:run  (poll /actuator/health)
      command: "uv run --project .. uvicorn app.main:app --port 8000",
      url: "http://localhost:8000/health",
      cwd: "..",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABRICKS_HOST: process.env.DATABRICKS_HOST ?? "",
        DATABRICKS_TOKEN: process.env.DATABRICKS_TOKEN ?? "",
      },
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
