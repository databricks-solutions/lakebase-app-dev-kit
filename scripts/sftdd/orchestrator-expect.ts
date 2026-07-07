// Handoff EXPECTATION protocol for the deterministic driver.
//
// Every time the orchestrator hands off to a role (an invoke-role "call"), it
// knows precisely who must respond and WHAT that responder must return , a
// non-null, conformant artifact. This module makes that contract explicit and
// enforceable in code, not on paper:
//
//   - expectationFor(action) maps each role handoff to a Handoff carrying the
//     responder + a `satisfiedBy(state)` predicate (the non-null return
//     contract). A null / empty / nonconformant return leaves the state field
//     false, so the contract is UNMET.
//   - ExpectationLedger holds the outstanding expectations. reconcile(state) is
//     the in-order head fast-path (single-threaded driver); processCallback(from,
//     state) is the general intake , it matches a callback to the outstanding
//     entry by RESPONDER IDENTITY (+ scope) and removes it from any position, so
//     concurrent callbacks discharge out of order. A null / nonconformant return
//     is a PROTOCOL VIOLATION; a callback from a role we do not await is an
//     UnexpectedCallbackError. Both abort (after the one informed retry).
//
// The deterministic driver is single-threaded, so the queue depth is 1 in
// practice (one outstanding handoff at a time) and the responder is always the
// role just dispatched. The queue + responder identity are modeled explicitly
// anyway: they give precise, attributed abort messages (which role failed to
// return what) instead of a generic "stalled", and they are the contract a
// future async multi-agent runtime enforces directly (a callback from anyone
// other than the head's responder is a violation).

import type { DriveState, WorkflowAction } from "./orchestrator-drive.js";
import type { AgentRole } from "./agent-log.js";

/** One outstanding handoff: who must respond + the non-null return they owe. */
export interface Handoff {
  /** Stable signature of the dispatching action (the "call id"). */
  signature: string;
  /** The role that must deliver the callback. */
  responder: AgentRole;
  /** Story scope, when the handoff is per-story. */
  story?: string;
  /** AC scope, when the handoff is per-AC (review / refactor). */
  ac?: string;
  /** Human-readable description of the artifact the responder owes (the return). */
  expected: string;
  /** The non-null contract: true once the responder delivered its artifact. A
   *  null/empty/nonconformant return leaves this false (the violation signal). */
  satisfiedBy(state: DriveState): boolean;
  /** Optional concrete, filesystem-grounded directive appended to the retry
   *  hand-back: the exact file(s) the responder must write. Removes the room a
   *  role has to rationalize "it already exists" by naming what is actually
   *  missing on disk (the F4-draft-recipes breakdown failure). */
  remediation?: string;
}

/** Raised when a handoff's contract is not met: the expected responder returned
 *  nothing/null/nonconformant, or the workflow tried to advance past it. Aborts
 *  the driver (caught by the runner, which records it + halts). */
export class ProtocolViolationError extends Error {
  constructor(
    readonly handoff: Handoff,
    readonly detail: string,
  ) {
    super(
      `PROTOCOL VIOLATION: expected ${handoff.responder}${handoff.story ? ` (story ${handoff.story}${handoff.ac ? `/${handoff.ac}` : ""})` : ""} ` +
        `to return ${handoff.expected}, but ${detail}. Aborting workflow.`,
    );
    this.name = "ProtocolViolationError";
  }
}

/** Raised when a callback arrives from a role we are NOT awaiting , a wrong /
 *  unexpected caller (or a callback when nothing is outstanding). Under
 *  concurrency this is the "call back from someone other than the expected
 *  caller" abort: pop the queue to find who we expect; no match => abort. */
export class UnexpectedCallbackError extends Error {
  constructor(
    readonly from: string,
    readonly scope: { story?: string; ac?: string },
    readonly expected: string[],
  ) {
    const where = scope.story ? ` (story ${scope.story}${scope.ac ? `/${scope.ac}` : ""})` : "";
    super(
      `PROTOCOL VIOLATION: unexpected callback from ${from}${where} , no outstanding handoff awaits it ` +
        `(awaiting: ${expected.length ? expected.join(", ") : "nothing"}). Aborting workflow.`,
    );
    this.name = "UnexpectedCallbackError";
  }
}

function sig(action: WorkflowAction): string {
  return JSON.stringify(action);
}

/** The story a per-story / per-AC handoff targets, if any. */
function storyOf(action: WorkflowAction): string | undefined {
  return "story" in action ? (action as { story?: string }).story : undefined;
}

/**
 * The expected return contract for a role handoff, or null for actions that are
 * NOT external calls (gate surfaces, experiment cut, deploy, accept, complete ,
 * the driver's own deterministic substrate, which has no separate responder to
 * wait on). For invoke-role, the predicate is the SAME state advance the
 * transition requires to move past this role , so an unmet contract is exactly
 * the case where the driver would otherwise silently re-dispatch the same role.
 */
export function expectationFor(action: WorkflowAction): Handoff | null {
  if (action.kind !== "invoke-role") return null;
  const responder = action.role as AgentRole;
  const story = storyOf(action);
  const signature = sig(action);
  const base = { signature, responder, ...(story ? { story } : {}) };
  const storyView = (s: DriveState) => (story ? s.stories[story] : undefined);

  // Planning + design-lane roles: the contract is the explicit DriveState field
  // the transition checks to advance past the role. False = null/empty return.
  if (responder === "spec-author" && "mode" in action && action.mode === "breakdown") {
    return {
      ...base,
      expected: "a feature breakdown (≥1 story)",
      satisfiedBy: (s) => s.breakdownDone === true,
      remediation:
        "Write feature-spec.json with a NON-EMPTY `stories[]` array and create the story stub dirs under the artifact root's features/<feature>/stories/. The feature dir currently holds only feature-request.md; a prose list of stories in your reply is NOT the breakdown.",
    };
  }
  if (responder === "spec-author" && "mode" in action && action.mode === "propose") {
    return { ...base, expected: "feature proposals", satisfiedBy: (s) => s.planning?.proposed === true };
  }
  if (responder === "ux-designer") {
    return { ...base, expected: "a design guide", satisfiedBy: (s) => s.designGuideReady === true };
  }
  if (responder === "spec-author") {
    return { ...base, expected: "drafted acceptance criteria (non-empty)", satisfiedBy: (s) => storyView(s)?.design.hasAcs === true };
  }
  if (responder === "architect-reviewer" && "mode" in action && action.mode === "estimate") {
    return { ...base, expected: "a t-shirt size estimate", satisfiedBy: (s) => s.planning?.estimated === true };
  }
  if (responder === "architect-reviewer") {
    return {
      ...base,
      expected: "layer/NFR-annotated ACs",
      satisfiedBy: (s) => storyView(s)?.design.architectAnnotated === true,
      remediation:
        "Write a non-empty `architectural_notes` field into EVERY one of this story's acs/<AC>.json files (your distinctive per-AC product, the gate checks each AC carries it), AND ensure the feature architecture.json exists. architectural_notes are PER-AC: a prior story populating the feature-level architecture.json does NOT annotate this story's ACs, so annotate them now even if architecture.json already exists.",
    };
  }
  if (responder === "test-strategist") {
    // The S2 stall: a malformed/empty per-story test list leaves testListReady
    // false. The contract makes that a loud, attributed abort, not a spin.
    return { ...base, expected: "a non-empty per-story test list mapped to the story's ACs", satisfiedBy: (s) => storyView(s)?.design.testListReady === true };
  }

  // Build-lane roles (navigator / driver). ONLY the per-AC review/refactor turns
  // get a contract here , their predicates (reviewAc / refactorAc) are precise
  // per-AC DriveState fields. The per-CYCLE RED (navigator) + GREEN (driver) turns
  // are deliberately NOT enforced by the ledger: DriveState only carries the
  // coarse, story-level booleans testsWritten / codeWritten (true once the WHOLE
  // story is written / all-green), so a single RED/GREEN turn mid-story cannot be
  // expressed , codeWritten stays false while T2..Tn are pending, which would
  // false-abort a healthy build right after the first GREEN. The tight RED/GREEN
  // loop is covered by the generic stall detector (a truly stuck turn repeats its
  // signature) + the honest-green runner contract; the ledger stays precise.
  const buildMode = "buildMode" in action ? (action as { buildMode?: string }).buildMode : undefined;
  const ac = "ac" in action ? (action as { ac?: string }).ac : undefined;
  const withAc = { ...base, ...(ac ? { ac } : {}) };
  if (responder === "navigator" && buildMode === "review") {
    return { ...withAc, expected: `a REVIEW verdict for ${ac}`, satisfiedBy: (s) => storyView(s)?.build.reviewAc !== ac };
  }
  if (responder === "driver" && buildMode === "refactor") {
    return { ...withAc, expected: `a completed REFACTOR for ${ac}`, satisfiedBy: (s) => storyView(s)?.build.refactorAc !== ac };
  }
  // navigator (RED) / driver (GREEN) per-cycle turns: not ledger-enforced (see above).
  return null;
}

/** The outcome of reconciling the realized state against the head expectation. */
export type ReconcileResult =
  /** Nothing outstanding. */
  | { kind: "idle" }
  /** The head's contract was met (the responder delivered); it was popped. */
  | { kind: "met"; handoff: Handoff }
  /** The head's contract is UNMET but a retry remains: hand `detail` back to the
   *  responder and re-dispatch it. The head stays outstanding. */
  | { kind: "retry"; handoff: Handoff; detail: string; attempt: number };

/** The hand-back message: what the responder failed to return + the directive
 *  to fix it. Threaded into the role's next prompt so the retry is informed, not
 *  a blind re-run. */
export function handbackMessage(h: Handoff, attempt: number): string {
  return [
    `HANDBACK (attempt ${attempt}): your previous turn did not return ${h.expected}` +
      `${h.story ? ` for story ${h.story}${h.ac ? `/${h.ac}` : ""}` : ""}.`,
    `The expected artifact is absent / null / empty / nonconformant ON DISK (the orchestrator verified it).`,
    `Do NOT claim it "already exists" or that "no further artifacts are needed": prose describing the artifact is NOT the artifact.`,
    `Re-inspect the filesystem yourself, then WRITE the artifact this turn.`,
    ...(h.remediation ? [h.remediation] : []),
    `This is a retry; the workflow aborts if it is still missing.`,
  ].join(" ");
}

/**
 * LEDGER of outstanding handoff expectations. Not a strict FIFO queue: handoffs
 * arrive in order (push) but are discharged by IDENTITY MATCH (processCallback
 * finds + removes the entry whose responder/scope match the callback, from any
 * position), so concurrent stories' callbacks can complete out of order. The
 * deterministic single-threaded driver only ever has one entry outstanding and
 * uses the in-order head fast-path (reconcile), which is why a queue was the
 * original mental model; under concurrency it is a match-and-remove ledger.
 * An unmet contract is RETRIED `maxRetries` times (handing the violation back to
 * the responder) before aborting , one informed second chance, not a silent
 * re-dispatch nor an instant abort.
 */
export class ExpectationLedger {
  private readonly outstanding: Handoff[] = [];
  /** Unmet-callback count per outstanding handoff signature. */
  private readonly attempts = new Map<string, number>();

  constructor(private readonly maxRetries = 1) {}

  /** Record a new outstanding handoff (the call we are waiting on). */
  push(h: Handoff): void {
    this.outstanding.push(h);
  }

  /** Whether anything is outstanding. */
  get pending(): boolean {
    return this.outstanding.length > 0;
  }

  /** The head expectation (next expected callback), or undefined. */
  head(): Handoff | undefined {
    return this.outstanding[0];
  }

  /** The responders currently awaited (for diagnostics / wrong-caller messages). */
  awaiting(): string[] {
    return this.outstanding.map((h) => h.responder);
  }

  /**
   * INTAKE PROCESSOR , process a callback from a SPECIFIC responder against the
   * outstanding expectations (the caller-identity half of the protocol; the part
   * that becomes load-bearing once dispatch is concurrent / multi-threaded):
   *   - find the first outstanding handoff whose responder === `from` (and, when
   *     given, whose story/ac match the callback's scope). NO match => the caller
   *     is wrong / unexpected => throw UnexpectedCallbackError (abort).
   *   - matched + contract met -> remove it (the right caller delivered).
   *   - matched + unmet, retry budget remains -> `retry` (hand back + re-dispatch).
   *   - matched + unmet, no budget -> throw ProtocolViolationError (abort).
   * Matching the responder (not blindly the head) lets concurrent stories' build
   * callbacks arrive interleaved while still rejecting a callback from a role we
   * are not awaiting at all.
   */
  processCallback(from: string, state: DriveState, scope: { story?: string; ac?: string } = {}): ReconcileResult {
    const idx = this.outstanding.findIndex(
      (h) =>
        h.responder === from &&
        (scope.story === undefined || h.story === scope.story) &&
        (scope.ac === undefined || h.ac === scope.ac),
    );
    if (idx === -1) {
      throw new UnexpectedCallbackError(from, scope, this.awaiting());
    }
    const h = this.outstanding[idx];
    if (h.satisfiedBy(state)) {
      this.outstanding.splice(idx, 1);
      this.attempts.delete(h.signature);
      return { kind: "met", handoff: h };
    }
    const attempt = (this.attempts.get(h.signature) ?? 0) + 1;
    this.attempts.set(h.signature, attempt);
    if (attempt > this.maxRetries) {
      throw new ProtocolViolationError(
        h,
        `it returned nothing across ${attempt} attempts (the expected artifact is absent / null / empty)`,
      );
    }
    return { kind: "retry", handoff: h, detail: handbackMessage(h, attempt), attempt };
  }

  /**
   * Reconcile the realized state against the HEAD expectation , the deterministic
   * (single-outstanding, in-order) specialization of processCallback. The
   * single-threaded driver dispatches one role at a time, so the only possible
   * responder IS the head's, and reconcile delegates with that identity:
   *   - met   -> pop it.
   *   - unmet, retry budget remains -> `retry` (hand-back + re-dispatch).
   *   - unmet, no budget -> throw ProtocolViolationError.
   * A no-op (`idle`) when nothing is outstanding.
   */
  reconcile(state: DriveState): ReconcileResult {
    const head = this.outstanding[0];
    if (!head) return { kind: "idle" };
    return this.processCallback(head.responder, state, { ...(head.story ? { story: head.story } : {}), ...(head.ac ? { ac: head.ac } : {}) });
  }
}
