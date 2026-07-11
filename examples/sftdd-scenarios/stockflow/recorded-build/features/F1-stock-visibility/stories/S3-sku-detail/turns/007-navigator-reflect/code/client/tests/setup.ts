// Vitest global setup: extends expect() with jest-dom matchers and clears the
// DOM + mocks between tests so each test starts from a known state.
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
