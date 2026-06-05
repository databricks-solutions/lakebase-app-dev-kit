// FEIP-7510 / UX adherence: the design guide is a contract, and "ensures
// adherence" must be machine-enforced, not eyeballed. The running app defines
// its design tokens as CSS custom properties on :root (per the real
// partner-asset-tracker STYLE_GUIDE: tokens in theme.css :root are readable in
// Playwright tests). This checks those rendered :root variables against the
// tokens declared in design-guide.json, so a primary button that renders blue
// or rounded when the guide says red + sharp fails the build.

import { describe, it, expect } from "vitest";
import {
  designGuideToCssVars,
  checkTokenAdherence,
  assertDesignAdherence,
} from "../../scripts/tdd/design-adherence";

const GUIDE = {
  typography: { font_family: "DM Sans", font_mono: "DM Mono", scale: { "text-base": "15px" } },
  colors: { brand: { "brand-red": "#FF3621" }, semantic: { success: "#2E844A" } },
  spacing: { "space-4": "16px" },
  radius: { "radius-none": "0px" },
};

describe("designGuideToCssVars: flattens a guide to CSS custom properties", () => {
  it("maps tokens to their --css-var names by convention", () => {
    const vars = designGuideToCssVars(GUIDE);
    expect(vars["--font-family"]).toBe("DM Sans");
    expect(vars["--font-mono"]).toBe("DM Mono");
    expect(vars["--text-base"]).toBe("15px");
    expect(vars["--color-brand-red"]).toBe("#FF3621");
    expect(vars["--color-success"]).toBe("#2E844A");
    expect(vars["--space-4"]).toBe("16px");
    expect(vars["--radius-none"]).toBe("0px");
  });
});

describe("checkTokenAdherence: rendered :root vars vs declared tokens", () => {
  const declared = designGuideToCssVars(GUIDE);

  it("ok when every declared token matches the rendered value (case/space-insensitive)", () => {
    const rendered = {
      "--font-family": "DM Sans",
      "--font-mono": "DM Mono",
      "--text-base": "15px",
      "--color-brand-red": " #ff3621 ", // whitespace + lowercase still matches
      "--color-success": "#2E844A",
      "--space-4": "16px",
      "--radius-none": "0px",
    };
    expect(checkTokenAdherence(declared, rendered).ok).toBe(true);
  });

  it("reports a mismatch when a rendered value differs from the declared token", () => {
    const rendered = { ...{ "--font-family": "DM Sans", "--font-mono": "DM Mono", "--text-base": "15px", "--color-success": "#2E844A", "--space-4": "16px", "--radius-none": "0px" }, "--color-brand-red": "#0000FF" };
    const r = checkTokenAdherence(declared, rendered);
    expect(r.ok).toBe(false);
    const brand = r.mismatches.find((m) => m.cssVar === "--color-brand-red");
    expect(brand?.expected).toBe("#FF3621");
    expect(brand?.actual).toBe("#0000FF");
  });

  it("reports a missing var when the app does not define a declared token", () => {
    const rendered = { "--font-family": "DM Sans" }; // everything else absent
    const r = checkTokenAdherence(declared, rendered);
    expect(r.ok).toBe(false);
    const missing = r.mismatches.find((m) => m.cssVar === "--color-brand-red");
    expect(missing?.actual).toBeUndefined();
  });
});

describe("assertDesignAdherence: reads :root from a page-like reader", () => {
  // A minimal reader stands in for a Playwright Page: it returns the computed
  // value of each requested CSS custom property.
  function readerFrom(vars: Record<string, string>) {
    return {
      evaluate: async (_fn: unknown, names: string[]) =>
        Object.fromEntries(names.map((n) => [n, vars[n] ?? ""])),
    };
  }

  it("resolves when the rendered tokens match the guide", async () => {
    const reader = readerFrom({
      "--font-family": "DM Sans",
      "--font-mono": "DM Mono",
      "--text-base": "15px",
      "--color-brand-red": "#FF3621",
      "--color-success": "#2E844A",
      "--space-4": "16px",
      "--radius-none": "0px",
    });
    await expect(assertDesignAdherence(reader, GUIDE)).resolves.toBeUndefined();
  });

  it("throws naming the mismatched token when the UI drifts from the guide", async () => {
    const reader = readerFrom({
      "--font-family": "DM Sans",
      "--font-mono": "DM Mono",
      "--text-base": "15px",
      "--color-brand-red": "#0000FF", // wrong
      "--color-success": "#2E844A",
      "--space-4": "16px",
      "--radius-none": "0px",
    });
    await expect(assertDesignAdherence(reader, GUIDE)).rejects.toThrow(/--color-brand-red/);
  });
});
