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

/** Require at least this fraction of the model window still free to RESUME
 *  (the default; a smaller warm window = a LARGER required free fraction, set via
 *  LAKEBASE_SFTDD_CONTEXT_FREE_FRACTION to tighten how early lighter roles reset). */
export const CONTEXT_FREE_FRACTION_REQUIRED = 0.4;

/** The required-free fraction in force, honoring the env override (clamped to a
 *  sane (0,1) range; a bad value falls back to the default). */
export function requiredFreeFraction(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.LAKEBASE_SFTDD_CONTEXT_FREE_FRACTION ?? env.SFTDD_CONTEXT_FREE_FRACTION;
  if (raw === undefined) return CONTEXT_FREE_FRACTION_REQUIRED;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : CONTEXT_FREE_FRACTION_REQUIRED;
}

/**
 * PROACTIVE per-turn context cap (companion to the reactive resumeFitsBudget
 * guard). The reactive guard only resets a session AFTER it has already grown too
 * big; a "heavy" role (the Driver writes code + runs the full suite, the Navigator
 * reads the whole diff + test output) accumulates so fast that even one warm turn
 * can carry a large, mostly-extraneous context into the next. For heavy roles we
 * therefore start EVERY turn fresh: each turn reloads only what it needs from the
 * on-disk artifacts (artifact-as-API makes a cold turn always correct), so no turn
 * inherits a prior turn's accumulation and each stays small + focused + fast.
 *
 * Default: NO proactive cap. The two builders (Navigator + Driver) warm-resume
 * across a story's cycles (buildSessionScope "story"), reusing the prompt cache,
 * which is far cheaper + faster than re-paying full fresh input every RED / GREEN
 * / REVIEW / REFACTOR. The REACTIVE guard is the backstop: `resumeFitsBudget`
 * starts a turn FRESH when the prior context would not leave the required free
 * window fraction, and the mid-turn prompt-too-long retry catches a turn that
 * balloons anyway , so context growth stays bounded without paying the fresh-start
 * tax on every turn. Set `LAKEBASE_SFTDD_HEAVY_ROLES=driver,navigator` (or any
 * comma list) to restore the proactive always-FRESH cap for those roles.
 */
export const DEFAULT_HEAVY_ROLES = [] as const;

export function heavyRoles(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = env.LAKEBASE_SFTDD_HEAVY_ROLES ?? env.SFTDD_HEAVY_ROLES;
  if (raw === undefined) return new Set<string>(DEFAULT_HEAVY_ROLES);
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/** Whether this role should start each turn on a FRESH session (proactive cap). */
export function startsFreshEachTurn(role: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return heavyRoles(env).has(role.toLowerCase());
}

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
export function resumeFitsBudget(
  priorContextTokens: number,
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const window = contextWindowFor(model);
  return priorContextTokens <= window * (1 - requiredFreeFraction(env));
}

/**
 * Signatures claude emits when a SINGLE turn overflows the model context window
 * (it ballooned within the turn, the failure the resume-time guard above cannot
 * pre-empt). The driver scans a failed turn's output for these and, when matched,
 * retries the turn on a FRESH session instead of aborting the drive , the
 * on-disk artifacts a failed attempt already wrote persist, so the retry resumes
 * from them with a clean context.
 */
export const PROMPT_TOO_LONG_RE =
  /prompt is too long|prompt too long|exceeds? the (?:maximum )?context|context (?:window|length) (?:exceeded|too long)/i;

/** True when a line of claude output signals a mid-turn context overflow. */
export function isPromptTooLongSignal(line: string): boolean {
  return PROMPT_TOO_LONG_RE.test(line);
}
