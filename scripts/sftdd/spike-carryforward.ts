// Spike learning carry-forward into the design-spec gate.
//
// `cutSpike` already preserves notes on disk after branch teardown
// (`.tdd/spikes/<slug>/notes.md`). When the related feature shows up
// for its design-spec gate, the orchestrator should not have to ask
// the human to remember the spike. This module scans for spikes that
// reference an upcoming feature and proposes attaching their notes
// onto the feature's `plan.json` under `rationale.spike_inputs[]`.
//
// Convention for tagging a spike with a feature:
//   1. YAML frontmatter at the top of `notes.md`:
//        ---
//        for_feature: F1-checkout
//        ---
//   2. A body line anywhere in `notes.md` that begins with one of:
//        For feature: F1-checkout
//        Feature: F1-checkout
//        feature_id: F1-checkout
//        for_feature: F1-checkout
//      (case-insensitive on the key; the feature id itself is matched
//      verbatim so `F1` does NOT match a spike tagged `F1-checkout`.)
//
// Neither tag is mandatory. Spikes left untagged remain on disk and
// the carry-forward primitive simply skips them.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { featurePlanJson } from "./sftdd-paths.js";

export interface SpikeInput {
  /** Spike directory name under `.tdd/spikes/`. */
  slug: string;
  /** Absolute path to the spike's notes.md. */
  notes_path: string;
  /** First non-blank lines of notes.md, capped at ~200 characters. */
  preview: string;
  /** Which tagging marker matched ("frontmatter" or one of the body-line keys). */
  matched_marker: string;
}

export interface CollectSpikeInputsArgs {
  tddDir: string;
  featureId: string;
}

/**
 * Scan `<tddDir>/spikes/` and return every spike that references
 * `featureId` via the documented tagging conventions. Results are
 * sorted by spike slug for deterministic output.
 *
 * Returns an empty array when no spikes match or the spikes/
 * directory does not exist; never throws on a per-spike parse error
 * (a malformed notes.md is treated as "untagged").
 */
export function collectSpikeInputs(args: CollectSpikeInputsArgs): SpikeInput[] {
  const spikesDir = join(args.tddDir, "spikes");
  if (!existsSync(spikesDir)) return [];
  const out: SpikeInput[] = [];
  for (const slug of readdirSync(spikesDir)) {
    const dir = join(spikesDir, slug);
    if (!statSync(dir).isDirectory()) continue;
    const notesPath = join(dir, "notes.md");
    if (!existsSync(notesPath)) continue;
    let content: string;
    try {
      content = readFileSync(notesPath, "utf8");
    } catch {
      continue;
    }
    const match = matchFeatureMarker(content, args.featureId);
    if (!match) continue;
    out.push({
      slug,
      notes_path: notesPath,
      preview: extractPreview(content),
      matched_marker: match,
    });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

const BODY_LINE_KEYS = ["for feature", "feature", "feature_id", "for_feature"];

function matchFeatureMarker(content: string, featureId: string): string | undefined {
  const frontmatter = extractFrontmatter(content);
  if (frontmatter) {
    for (const key of ["for_feature", "feature_id", "feature"]) {
      const re = new RegExp(`^\\s*${key}\\s*:\\s*(\\S+)\\s*$`, "im");
      const m = frontmatter.match(re);
      if (m && m[1] === featureId) return `frontmatter:${key}`;
    }
  }
  for (const key of BODY_LINE_KEYS) {
    // Allow leading and trailing markdown decoration (* _ > whitespace)
    // around the key and the value so `**For feature:** F1` matches.
    const re = new RegExp(
      `^[*_\\s>]*${escapeRegex(key)}[*_\\s]*:[*_\\s]*(\\S+)[*_\\s]*$`,
      "im"
    );
    const m = content.match(re);
    if (m && m[1] === featureId) return `body:${key}`;
  }
  return undefined;
}

function extractFrontmatter(content: string): string | undefined {
  if (!content.startsWith("---")) return undefined;
  const end = content.indexOf("\n---", 3);
  if (end < 0) return undefined;
  return content.slice(3, end);
}

function extractPreview(content: string): string {
  const body = content.replace(/^---[\s\S]*?\n---\s*\n?/, "").trim();
  const head = body.split("\n").filter((l) => l.trim().length > 0).slice(0, 3).join(" ");
  return head.length > 200 ? head.slice(0, 197) + "..." : head;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface AttachSpikeInputsArgs {
  tddDir: string;
  featureId: string;
  /**
   * Spike slugs to attach. Use `collectSpikeInputs` to discover
   * candidates and the orchestrator/PO to whittle the list down.
   */
  slugs: string[];
}

export interface AttachSpikeInputsResult {
  /** Spike inputs written to the plan. */
  attached: SpikeInput[];
  /** Slugs the caller passed that did not resolve to a tagged spike. */
  unresolved: string[];
}

/**
 * Persist `spike_inputs` onto `<tddDir>/features/<featureId>/plan.json`
 * under the existing `rationale` block. Re-running with the same slugs
 * is a no-op (idempotent); passing an empty slug list clears the field.
 * Throws if plan.json does not exist (the gate has not run yet).
 */
export function attachSpikeInputs(args: AttachSpikeInputsArgs): AttachSpikeInputsResult {
  const planPath = featurePlanJson(args.tddDir, args.featureId);
  if (!existsSync(planPath)) {
    throw new Error(
      `attachSpikeInputs: plan.json not found at ${planPath}. Run the design-spec gate first.`
    );
  }
  const candidates = collectSpikeInputs({ tddDir: args.tddDir, featureId: args.featureId });
  const bySlug = new Map(candidates.map((c) => [c.slug, c]));
  const attached: SpikeInput[] = [];
  const unresolved: string[] = [];
  for (const slug of args.slugs) {
    const hit = bySlug.get(slug);
    if (hit) {
      attached.push(hit);
    } else {
      unresolved.push(slug);
    }
  }
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as Record<string, unknown>;
  if (attached.length === 0) {
    delete plan.spike_inputs;
  } else {
    plan.spike_inputs = attached;
  }
  writeFileSync(planPath, JSON.stringify(plan, null, 2) + "\n");
  return { attached, unresolved };
}
