/// <reference types="vitest/config" />
import { defineConfig } from "vite";
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
    // renderer; e2e specs under tests/e2e/ are Playwright's, not Vitest's.
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
    // Component tests live either co-located under src/ or under tests/
    // (kind:"client" story items, e.g. tests/pages/<Screen>.test.tsx), never
    // e2e specs (tests/e2e/*.spec.ts, Playwright's, excluded by extension).
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    css: false,
  },
});
