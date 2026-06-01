// G2 (FEIP-7359): hash normalization helper for gate artifacts.
//
// Test-FIRST per the ADR-0004 design rationale: this is the riskiest piece
// of the gates state machine. Wrong normalization causes false drift (a
// prettier run triggers an integrity violation) or false security (a
// formatting-only edit slips past the integrity gate). Each rule from
// ADR-0004 gets its own explicit case so the contract is unambiguous.
//
// Normalization rules (ADR-0004):
//   1. Normalize line endings to LF (CRLF -> LF, CR -> LF)
//   2. Strip TRAILING whitespace per line (leading whitespace preserved;
//      markdown indentation is semantic)
//   3. Collapse runs of consecutive blank lines to a single blank line
//   4. Final hash is sha256 over the normalized text, returned as hex

import { describe, it, expect } from "vitest";
import { hashArtifact, normalizeForHash } from "../../scripts/tdd/gate-hash";

describe("gate-hash: hashArtifact", () => {
  it("returns a 64-char lowercase hex sha256 string", () => {
    const h = hashArtifact("hello\n");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic: same input -> same hash", () => {
    expect(hashArtifact("hello\n")).toBe(hashArtifact("hello\n"));
  });

  it("is sensitive to semantic content changes", () => {
    expect(hashArtifact("hello\n")).not.toBe(hashArtifact("goodbye\n"));
  });

  it("handles UTF-8 content (non-ASCII characters)", () => {
    const a = hashArtifact("césar\n");
    const b = hashArtifact("césar\n");
    expect(a).toBe(b);
    expect(hashArtifact("césar\n")).not.toBe(hashArtifact("cesar\n"));
  });
});

describe("gate-hash: rule 1 line-ending normalization", () => {
  it("CRLF hashes identically to LF", () => {
    expect(hashArtifact("a\r\nb\r\n")).toBe(hashArtifact("a\nb\n"));
  });

  it("CR (old Mac) hashes identically to LF", () => {
    expect(hashArtifact("a\rb\r")).toBe(hashArtifact("a\nb\n"));
  });

  it("mixed CRLF + LF + CR all normalize to the same hash", () => {
    expect(hashArtifact("a\r\nb\nc\rd")).toBe(hashArtifact("a\nb\nc\nd"));
  });
});

describe("gate-hash: rule 2 trailing-whitespace stripping", () => {
  it("trailing spaces on a line are ignored", () => {
    expect(hashArtifact("hello   \n")).toBe(hashArtifact("hello\n"));
  });

  it("trailing tabs on a line are ignored", () => {
    expect(hashArtifact("hello\t\t\n")).toBe(hashArtifact("hello\n"));
  });

  it("mixed trailing whitespace on multiple lines is ignored", () => {
    const noisy = "alpha  \nbeta\t \ngamma   \t\n";
    const clean = "alpha\nbeta\ngamma\n";
    expect(hashArtifact(noisy)).toBe(hashArtifact(clean));
  });

  it("LEADING whitespace is preserved (markdown indentation is semantic)", () => {
    const indented = "  - item\n    - nested\n";
    const flat = "- item\n- nested\n";
    expect(hashArtifact(indented)).not.toBe(hashArtifact(flat));
  });

  it("interior whitespace inside a line is preserved", () => {
    expect(hashArtifact("a  b\n")).not.toBe(hashArtifact("a b\n"));
  });
});

describe("gate-hash: rule 3 blank-line collapse", () => {
  it("two consecutive blank lines collapse to one", () => {
    expect(hashArtifact("a\n\n\nb\n")).toBe(hashArtifact("a\n\nb\n"));
  });

  it("many consecutive blank lines collapse to one", () => {
    expect(hashArtifact("a\n\n\n\n\n\nb\n")).toBe(hashArtifact("a\n\nb\n"));
  });

  it("blank lines containing only whitespace are also collapsed", () => {
    const padded = "a\n   \n\t\n\nb\n";
    const clean = "a\n\nb\n";
    expect(hashArtifact(padded)).toBe(hashArtifact(clean));
  });

  it("a single blank line is preserved (semantic separator)", () => {
    expect(hashArtifact("a\n\nb\n")).not.toBe(hashArtifact("a\nb\n"));
  });
});

describe("gate-hash: integration of all three rules", () => {
  it("CRLF + trailing whitespace + extra blank lines all normalize together", () => {
    const noisy = "alpha   \r\n\r\n\r\nbeta\t\r\n";
    const clean = "alpha\n\nbeta\n";
    expect(hashArtifact(noisy)).toBe(hashArtifact(clean));
  });

  it("prettier-equivalent reformat does not change the hash", () => {
    // Simulated: trailing whitespace stripped, line endings normalized,
    // double-blank sections collapsed.
    const before = "# Title\r\n\r\n\r\nBody text   \r\n\r\nMore body  \r\n";
    const after = "# Title\n\nBody text\n\nMore body\n";
    expect(hashArtifact(before)).toBe(hashArtifact(after));
  });

  it("a semantic edit (word change) inside the body produces a different hash", () => {
    const before = "# Title\n\nBody text\n";
    const after = "# Title\n\nBody TEXT\n";
    expect(hashArtifact(before)).not.toBe(hashArtifact(after));
  });
});

describe("gate-hash: normalizeForHash exposed for debug", () => {
  it("is idempotent: normalize(normalize(x)) == normalize(x)", () => {
    const input = "alpha   \r\n\r\n\r\nbeta\t\r\n";
    const once = normalizeForHash(input);
    const twice = normalizeForHash(once);
    expect(twice).toBe(once);
  });

  it("hashArtifact(x) == sha256(normalizeForHash(x))", async () => {
    const input = "alpha   \r\nbeta\r\n";
    const normalized = normalizeForHash(input);
    const { createHash } = await import("crypto");
    const expected = createHash("sha256").update(normalized).digest("hex");
    expect(hashArtifact(input)).toBe(expected);
  });
});
