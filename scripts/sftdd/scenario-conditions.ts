// The RUN CONDITIONS a recorded scenario must be captured/replayed under, read
// from its scenario.json manifest (schema: scripts/sftdd/schemas/scenario.schema.json).
//
// Why this exists: the manifest is the SOURCE OF TRUTH for a scenario's
// conditions, but the capture harness used to ignore it and rely on the `--ui`
// CLI flag alone, which wired only the e2e test harness (--enable-e2e) and left
// the drive's UX design lane OFF (uiTrack=false). A UI scenario then built its
// UI stories with no design guide / IA / adherence gate, silently. Reading the
// manifest here, and having the harness UNION + ENFORCE these, makes that class
// of silent condition-drop impossible: a scenario that declares uiTrack:true
// can never be run without the UX lane.
//
// Defaults mirror scenario.schema.json so an absent/partial manifest resolves to
// the same values the schema documents.

import { existsSync, readFileSync } from "fs";

export interface ScenarioConditions {
  /** Whether the scenario has a user-facing UI: drives the UX Designer + design
   *  guide/IA + design-adherence gate (the drive's uiTrack) AND the e2e harness. */
  uiTrack: boolean;
  /** SCM tier count to scaffold (1=prod, 2=prod+staging, 3=prod+staging+dev). */
  tiers: number;
  /** Handoff the live replay/capture drives to. */
  pauseBefore: string;
  /** Project language stack to scaffold. Undefined = not declared; the caller
   *  omits the create flag and create-project applies its own default. */
  language?: string;
  /** CI runner type to scaffold. Undefined = not declared (caller omits). */
  runner?: string;
}

/** Schema-documented defaults for an absent or partial manifest. */
export const SCENARIO_CONDITION_DEFAULTS: ScenarioConditions = {
  uiTrack: false,
  tiers: 2,
  pauseBefore: "release-engineer",
};

/**
 * Resolve a scenario's run conditions from its manifest path. A missing or
 * malformed manifest yields the schema defaults (never throws): callers treat
 * "no manifest" as "no declared conditions" and fall back to their CLI flags.
 */
export function readScenarioConditions(manifestPath: string): ScenarioConditions {
  if (!existsSync(manifestPath)) return { ...SCENARIO_CONDITION_DEFAULTS };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { ...SCENARIO_CONDITION_DEFAULTS };
  }
  const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    uiTrack: m.uiTrack === true,
    tiers: typeof m.tiers === "number" ? m.tiers : SCENARIO_CONDITION_DEFAULTS.tiers,
    pauseBefore: typeof m.pauseBefore === "string" ? m.pauseBefore : SCENARIO_CONDITION_DEFAULTS.pauseBefore,
    language: typeof m.language === "string" ? m.language : undefined,
    runner: typeof m.runner === "string" ? m.runner : undefined,
  };
}

/** The condition field names a caller may request (the `--field` values). */
export type ScenarioConditionField = keyof ScenarioConditions;

/** Render one field as a shell-friendly scalar: "true"/"false" for booleans, and
 *  the empty string for an absent optional (so a shell `[[ -n ]]` guard skips it). */
export function formatScenarioConditionField(c: ScenarioConditions, field: ScenarioConditionField): string {
  const v = c[field];
  if (v === undefined) return "";
  return typeof v === "boolean" ? (v ? "true" : "false") : String(v);
}
