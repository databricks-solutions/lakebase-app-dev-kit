// FEIP-7510/7422: make design-phase observability STRUCTURAL, not dependent on
// each role model remembering to emit `lakebase-tdd-log` events.
//
// Per-role logging is prose-instructed, so a role can do the substantive work
// (write story stubs + ACs) while emitting nothing, exactly what happened when
// the spec-author was tiered to sonnet (5 ACs on disk, zero log events).
// reconcileArtifactLog scans the feature's artifacts on disk and emits an
// `artifact.written` event for every one the log does not already cover. The
// orchestrator (and the smoke) call it after each phase so the log always
// reflects what was produced, regardless of which model a role ran on.
// Deterministic + idempotent.

import { existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import {
  emitAgentLogEvent,
  readAgentLog,
  type AgentLogEvent,
  type AgentRole,
} from "./agent-log.js";

export interface ReconcileOpts {
  /** Path to the .tdd/ root. Default: "./.tdd". */
  tddDir?: string;
  featureId: string;
  /** Test seam for a deterministic clock. */
  now?: () => Date;
}

interface ArtifactSpec {
  /** Path relative to tddDir (the form the reconciled event records). */
  path: string;
  role: AgentRole;
  message: string;
}

/** The design artifacts a feature produces, attributed to their owning role. */
function discoverArtifacts(tddDir: string, featureId: string): ArtifactSpec[] {
  const out: ArtifactSpec[] = [];
  const fdir = join(tddDir, "features", featureId);
  if (!existsSync(fdir)) return out;
  const add = (abs: string, role: AgentRole, message: string) => {
    if (existsSync(abs)) out.push({ path: relative(tddDir, abs), role, message });
  };

  // Feature-level artifacts.
  add(join(fdir, "feature-spec.json"), "spec-author", "feature-spec.json");
  add(join(fdir, "architecture.json"), "architect-reviewer", "architecture.json");
  add(join(fdir, "test-list.json"), "test-strategist", "test-list.json");
  add(join(fdir, "design-guide.json"), "ux-designer", "design-guide.json");
  add(join(fdir, "ia.md"), "ux-designer", "ia.md");

  // Per-story artifacts, in story order.
  const sdir = join(fdir, "stories");
  if (existsSync(sdir)) {
    for (const s of readdirSync(sdir).sort()) {
      const storyDir = join(sdir, s);
      if (!statSync(storyDir).isDirectory()) continue;
      add(join(storyDir, "story.json"), "spec-author", `story stub ${s}`);
      const acsDir = join(storyDir, "acs");
      if (existsSync(acsDir)) {
        for (const ac of readdirSync(acsDir).sort()) {
          if (ac.endsWith(".json")) {
            add(join(acsDir, ac), "spec-author", `AC ${ac.replace(/\.json$/, "")} for story ${s}`);
          }
        }
      }
      add(join(storyDir, "test-list-per-story.json"), "test-strategist", `per-story test list for ${s}`);
    }
  }
  return out;
}

/** True when some existing event already records this artifact's path. Lenient
 *  on the path form a role used (bare name / project-relative / absolute) by
 *  matching either direction's suffix, so a role's own emit is never duplicated. */
function alreadyLogged(events: AgentLogEvent[], relPath: string): boolean {
  return events.some((e) => {
    if (e.event !== "artifact.written") return false;
    const p = e.data?.path;
    if (typeof p !== "string") return false;
    return p === relPath || p.endsWith(`/${relPath}`) || (p.includes("/") && relPath.endsWith(p));
  });
}

/**
 * Emit an `artifact.written` event (tagged `reconciled: true`) for every
 * on-disk design artifact the log does not already cover. Returns the events
 * emitted (empty when the log is already complete). Idempotent.
 */
export function reconcileArtifactLog(opts: ReconcileOpts): AgentLogEvent[] {
  const tddDir = opts.tddDir ?? "./.tdd";
  const existing = readAgentLog({ tddDir, featureId: opts.featureId });
  const emitted: AgentLogEvent[] = [];
  for (const art of discoverArtifacts(tddDir, opts.featureId)) {
    if (alreadyLogged(existing, art.path)) continue;
    const ev = emitAgentLogEvent(
      {
        role: art.role,
        level: "info",
        event: "artifact.written",
        message: art.message,
        feature_id: opts.featureId,
        data: { path: art.path, reconciled: true },
      },
      { tddDir, now: opts.now },
    );
    existing.push(ev); // so a duplicate within this same pass is also deduped
    emitted.push(ev);
  }
  return emitted;
}
