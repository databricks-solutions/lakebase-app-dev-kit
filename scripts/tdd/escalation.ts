// Escalations: the single "raise to the HIL" channel (follow-up).
//
// WHY: a live smoke shipped a false-GREEN on a self-contradictory test, the
// orchestration stamped green without a real run, ignored the Navigator's
// contradiction smell, and then STALLED at await-acceptance. The fix is a
// uniform rule: after ANY role/step surfaces a blocking problem (a failed honest
// GREEN run, a blocking bad-smell, a deploy verify-fail), it writes an
// escalation here, and the deterministic driver routes to a single `raise-to-hil`
// halt while an unresolved escalation exists, it never advances past it and
// never silently spins. Headless mode surfaces + halts (a human resumes); it
// does not auto-decide.

import * as fs from "node:fs";
import { escalationsDir, escalationFile } from "./tdd-paths.js";
import { readSmellsLog, writeSmellsLog, type SmellName } from "./smells.js";

/** A blocking problem raised to the HIL. Identity is `id` (derived from source +
 *  scope) so the same condition re-detected across driver iterations is the same
 *  escalation, not a new one (keeps the stall-detector + the log quiet). */
export interface Escalation {
  id: string;
  /** Who/what raised it: "driver-green" | "deploy-verify" | "smell:<name>" | a role name. */
  source: string;
  /** Human-readable reason (shown in the halt message + the log). */
  reason: string;
  feature_id?: string;
  story_id?: string;
  ac_id?: string;
  raised_at: string;
  /** Set when the HIL resolves it (a human edits this in, or a resolve verb does). */
  resolved_at?: string;
}

/** Bad smells that BLOCK the build (vs. advisory ones). A flagged blocking smell
 *  halts to the HIL rather than being recorded for reporting only. */
export const BLOCKING_SMELLS: ReadonlySet<SmellName> = new Set<SmellName>([
  "test-list-drift",
  "cycle-stall",
  "boundary-violation",
  "test-deletion-attempt",
  // A missing kit-owned scaffold piece (e.g. the E2E conftest/live_server) must
  // halt to the HIL, not let the build fabricate it. The driver-wrote-its-own-
  // conftest defect (2026-06-11 smoke) traced to this not being blocking.
  "scaffold-defect",
  // Non-independent ACs (one AC's `then` implied by another) make a faithful RED
  // impossible. Flagged by the test-strategist at the design gate so it halts
  // BEFORE a build cycle, not mid-build as a cycle-stall (the 2026-06-11 AC2/AC3
  // overlap that stalled S1).
  "ac-overlap",
]);

/** A stable, filesystem-safe escalation id from its source + scope, so the same
 *  condition does not pile up duplicate files across iterations. */
export function escalationId(parts: { source: string; feature_id?: string; story_id?: string; ac_id?: string }): string {
  return [parts.source, parts.feature_id, parts.story_id, parts.ac_id]
    .filter(Boolean)
    .join("__")
    .replace(/[^A-Za-z0-9_.-]/g, "-");
}

/** Record a blocking escalation (idempotent by id: a still-unresolved one is left
 *  as-is so its original raised_at + reason stand). Returns the escalation. */
export function writeEscalation(
  tddDir: string,
  esc: Omit<Escalation, "id" | "raised_at"> & { id?: string; raised_at?: string },
): Escalation {
  const id = esc.id ?? escalationId(esc);
  const file = escalationFile(tddDir, id);
  const existing = readEscalationFile(file);
  if (existing && !existing.resolved_at) return existing;
  const full: Escalation = {
    id,
    source: esc.source,
    reason: esc.reason,
    ...(esc.feature_id ? { feature_id: esc.feature_id } : {}),
    ...(esc.story_id ? { story_id: esc.story_id } : {}),
    ...(esc.ac_id ? { ac_id: esc.ac_id } : {}),
    raised_at: esc.raised_at ?? new Date().toISOString(),
  };
  fs.mkdirSync(escalationsDir(tddDir), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(full, null, 2) + "\n", "utf8");
  return full;
}

function readEscalationFile(file: string): Escalation | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Escalation;
  } catch {
    return undefined;
  }
}

/** Every explicitly-recorded escalation on disk (resolved + unresolved). */
export function readEscalations(tddDir: string): Escalation[] {
  const dir = escalationsDir(tddDir);
  if (!fs.existsSync(dir)) return [];
  const out: Escalation[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const e = readEscalationFile(`${dir}/${f}`);
    if (e) out.push(e);
  }
  return out;
}

/** Escalations derived from unresolved BLOCKING bad-smells in `.tdd/smells.json`.
 *  The Navigator flags a smell (e.g. test-list-drift on a contradictory test);
 *  if it is in BLOCKING_SMELLS and unresolved, it becomes an HIL escalation
 *  rather than a reporting-only line. */
export function escalationsFromSmells(tddDir: string, featureId?: string): Escalation[] {
  const log = readSmellsLog(tddDir);
  return log.detected
    .filter((d) => !d.resolution && BLOCKING_SMELLS.has(d.smell))
    .map((d) => ({
      id: escalationId({ source: `smell:${d.smell}`, feature_id: featureId, story_id: d.story_id }),
      source: `smell:${d.smell}`,
      reason: `blocking smell "${d.smell}": ${d.detail}`,
      ...(featureId ? { feature_id: featureId } : {}),
      ...(d.story_id ? { story_id: d.story_id } : {}),
      ...(d.ac_id ? { ac_id: d.ac_id } : {}),
      raised_at: d.detected_at,
    }));
}

/** Mirror a role-flagged BLOCKING smell into `smells.json` so the driver's
 *  `firstPendingEscalation` -> raise-to-hil picks it up and HALTS the loop.
 *  A `smell.flagged` log event is observability only; persisting the blocking
 *  ones here is what makes the navigator's "(blocking)" actually stop the build
 *  (the driver-fabricated-conftest defect traced to this gap). No-op for
 *  advisory/unknown smell names; idempotent (skips a still-unresolved dup of the
 *  same smell). Returns true iff a new entry was written. */
export function recordBlockingSmellFlag(
  tddDir: string,
  smell: string,
  detail?: string,
  scope?: { story_id?: string; ac_id?: string },
): boolean {
  if (!BLOCKING_SMELLS.has(smell as SmellName)) return false;
  // Idempotent per (smell, story): a still-open flag of the same smell on the
  // same story is a dup. A legacy entry with no story matches any story so a
  // pre-scope flag is not re-raised.
  const open = readSmellsLog(tddDir).detected.some(
    (d) =>
      d.smell === smell &&
      !d.resolution &&
      (scope?.story_id === undefined || d.story_id === undefined || d.story_id === scope.story_id),
  );
  if (open) return false;
  writeSmellsLog(tddDir, [
    {
      smell: smell as SmellName,
      cycle_ids: [],
      detail: detail || `flagged blocking smell: ${smell}`,
      ...(scope?.story_id ? { story_id: scope.story_id } : {}),
      ...(scope?.ac_id ? { ac_id: scope.ac_id } : {}),
    },
  ]);
  return true;
}

/** The first UNRESOLVED escalation for a feature (explicit files + blocking
 *  smells), or null. This is what the driver consults to decide whether to
 *  pre-empt every other transition with a raise-to-hil halt. Explicit files win
 *  over smell-derived (they carry the richer reason). */
export function firstPendingEscalation(tddDir: string, featureId?: string): Escalation | null {
  const explicit = readEscalations(tddDir).filter((e) => !e.resolved_at);
  const scoped = featureId ? explicit.filter((e) => !e.feature_id || e.feature_id === featureId) : explicit;
  if (scoped.length > 0) {
    return [...scoped].sort((a, b) => (a.raised_at < b.raised_at ? -1 : 1))[0];
  }
  const fromSmells = escalationsFromSmells(tddDir, featureId);
  return fromSmells.length > 0 ? fromSmells.sort((a, b) => (a.raised_at < b.raised_at ? -1 : 1))[0] : null;
}
