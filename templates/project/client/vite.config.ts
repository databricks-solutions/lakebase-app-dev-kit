/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

// The SPA talks to the JSON API over relative /api (and /health) paths so the
// same code works in dev (Vite proxies to the backend) and in prod (the backend
// serves the built client from client/dist, so the paths are same-origin).
// run-dev.sh sets VITE_PROXY_TARGET to the backend it booted; default to the
// conventional local backend port when running Vite directly.
const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: proxyTarget, changeOrigin: true },
      "/health": { target: proxyTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
  },
  test: {
    // Component + hook tests run against the real DOM (jsdom), never a mock
    // renderer. Collect component tests from BOTH src/** (co-located) and
    // tests/** (the tests/pages/ layout this scaffold ships and the design lane
    // routes client component tests to) , EXCEPT tests/e2e/, which is Playwright's,
    // not Vitest's. (A prior include of only src/** silently dropped every
    // tests/pages/*.test.tsx, so a client RED test there could never be collected
    // and the build escalated with "no runner for the layer".)
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    css: false,
  },
});
