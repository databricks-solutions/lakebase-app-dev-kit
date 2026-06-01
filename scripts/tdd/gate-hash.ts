// Hash normalization helper for gate artifacts.
//
// Captures a stable fingerprint of a gate's protected artifact (spec.md,
// plan.json, test-list.json, ...) that survives formatter-only edits
// (prettier, editor whitespace settings, CRLF/LF differences) while still
// detecting any semantic change.
//
// Wrong normalization is the single biggest risk in the gates state machine:
//   - Too STRICT (no normalization) -> a prettier run trips the integrity
//     check; users lose trust and disable the gate.
//   - Too LOOSE (over-normalization) -> a formatting-only edit slips
//     through, but so does a semantic change that happens to look like
//     formatting (e.g. AC text edit that prettier already reflowed).
//
// Rules per ADR-0004:
//   1. Normalize line endings: CRLF and bare CR fold to LF.
//   2. Strip TRAILING whitespace per line. Leading whitespace is preserved
//      (markdown list indentation is semantic).
//   3. Collapse runs of consecutive blank lines (3+ newlines) down to a
//      single blank line (2 newlines). Blank lines that contained only
//      whitespace become empty after rule 2 and are then collapsed by
//      rule 3.
//
// The final hash is sha256 over the normalized text, returned as
// lowercase hex. Callers should compare hex strings directly.

import { createHash } from "crypto";

/**
 * Apply the ADR-0004 normalization rules. Exported for test + debug use;
 * production callers should use hashArtifact.
 *
 * Idempotent: normalizeForHash(normalizeForHash(x)) === normalizeForHash(x).
 */
export function normalizeForHash(content: string): string {
  // Rule 1: line-ending normalization. Order matters: handle CRLF first so
  // we do not double-fold the \n half into a second blank line.
  let normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Rule 2: strip trailing whitespace per line. Split + map + join is
  // straightforward and clearer than a single multi-line regex with the
  // `m` flag.
  normalized = normalized
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n");

  // Rule 3: collapse 3+ consecutive newlines down to 2 (a single blank
  // line between content). A 2-newline sequence is a single blank line
  // and is preserved as-is.
  normalized = normalized.replace(/\n{3,}/g, "\n\n");

  return normalized;
}

/**
 * Compute the canonical sha256 hex hash of an artifact's content after
 * applying the ADR-0004 normalization rules.
 *
 * Returns a 64-character lowercase hex string.
 */
export function hashArtifact(content: string): string {
  return createHash("sha256").update(normalizeForHash(content), "utf8").digest("hex");
}
