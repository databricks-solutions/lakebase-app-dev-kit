// Context-budget guard for the driver's warm-resume sessions.
//
// Resuming a role session (--resume) keeps its context + prompt cache warm, but
// an accumulating session eventually exceeds the model's context window ("Prompt
// is too long", which killed the F5 supersession build mid-turn). The driver
// applies this guard before each resume: if the prior turn's context would not
// leave the required free fraction of the window, it starts the turn FRESH
// instead (a cold turn is always correct under the artifact-as-API contract, it
// just reloads context from disk). Fresh-start is the safe default.

import type { TurnUsage } from "./claude-usage.js";

/** Require at least this fraction of the model window still free to RESUME. */
export const CONTEXT_FREE_FRACTION_REQUIRED = 0.4;

/** The model's usable context window (tokens). Defaults to the standard 200k; a
 *  `1m`-tagged model gets the 1M window. Unknown models take the safe floor so
 *  the guard errs toward starting fresh rather than overflowing. */
export function contextWindowFor(model: string): number {
  return /(^|[^0-9])1m([^0-9]|$)|\[1m\]/i.test(model) ? 1_000_000 : 200_000;
}

/** The total prompt tokens a turn carried = everything that counts against the
 *  window (fresh input + both cache tiers) plus the response it appended, which
 *  is what the NEXT resumed turn would start from. */
export function turnContextTokens(u: TurnUsage): number {
  return (
    (u.inputTokens || 0) +
    (u.cacheReadTokens || 0) +
    (u.cacheCreationTokens || 0) +
    (u.outputTokens || 0)
  );
}

/**
 * Whether a resume carrying `priorContextTokens` still leaves the required free
 * fraction of the model window. False => the driver starts the turn fresh.
 * priorContextTokens === 0 (no tracked size yet) always fits.
 */
export function resumeFitsBudget(priorContextTokens: number, model: string): boolean {
  const window = contextWindowFor(model);
  return priorContextTokens <= window * (1 - CONTEXT_FREE_FRACTION_REQUIRED);
}
