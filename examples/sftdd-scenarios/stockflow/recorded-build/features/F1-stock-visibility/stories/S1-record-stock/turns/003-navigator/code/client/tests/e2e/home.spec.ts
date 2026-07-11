import { test, expect } from "@playwright/test";

// The one behavior a fresh scaffold can prove end-to-end: the SPA loads, calls
// the backend /health through the Vite proxy, and shows the result as an
// explicit state (never a blank page). Grow this into your feature's flows.
test("home page loads and shows backend health", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("status-badge")).toContainText("Backend", {
    timeout: 15_000,
  });
});
