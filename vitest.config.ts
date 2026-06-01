import { defineConfig } from "vitest/config";

// Tests in templates/** are scaffolded artifacts that ship with USER
// projects (e.g. templates/project/nodejs/tests/app.test.js requires
// supertest and a sibling src/index.js – neither exists in this repo).
// They're meant to run AFTER scaffold, not as part of our test suite.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.js"],
    exclude: ["templates/**", "node_modules/**", "dist/**"],
    // 5s default is too tight for git-fixture tests on a loaded system
    // (pre-push hook running tests right after typecheck); they spawn
    // real git subprocesses against tempdir repos. Bump to 10s so a CPU-
    // contended run doesn't flake the gate. Per-test overrides for the
    // truly long ones (migrate-live, deploy-end-to-end, etc.) stay in
    // place via their `it("...", fn, 180_000)` annotations.
    testTimeout: 10_000,
  },
});
