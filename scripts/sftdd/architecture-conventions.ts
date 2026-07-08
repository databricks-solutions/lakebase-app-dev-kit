// Project-level architecture conventions: the canonical module layout the FIRST
// service-backed feature establishes, deterministically projected from its
// architecture.json and persisted under .tdd/architecture/conventions.json so
// every LATER feature inherits + hard-conforms to it.
//
// This is the architecture analogue of the project-level design-guide. Before
// it, the engineering *principles* lived in the canon (architectural-design-
// principles) and the *requirements* in nfrs.md, but the project's CHOSEN layout
// (boundary=app/routes, service=app/services, repository=app/repositories, and
// the UI's rendering framework) lived nowhere durable. So every feature's
// Architect Reviewer re-derived it from scratch and could legitimately diverge
// (F2 declaring app/handlers + app/logic), which then mismatches the code F2
// inherited from F1 and trips the layering gate's module-placement check.
//
// conventions.json is a DETERMINISTIC projection of architecture.json (written
// by code, not authored by an LLM), so it can never drift from the contract the
// layering gate already reads, and the establish/inherit decision is observable
// in the agent log without depending on a role remembering to emit.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { architectureConventionsJson, architectureJson } from "./sftdd-paths.js";

/** One layer of the established layout: a role pinned to a module path (and, for
 *  a UI boundary, the rendering framework). */
export interface ConventionLayer {
  role: string;
  module: string;
  renders_via?: string;
}

/** The project's persisted architecture conventions. */
export interface ArchitectureConventions {
  /** The feature whose architecture first established these conventions. */
  established_by: string;
  established_at: string;
  /** Always true: conventions are only established from a service-backed feature
   *  (a trivial feature declares no layout to pin). */
  service_backed: true;
  /** The canonical role -> module layout every later feature must reuse. */
  layers: ConventionLayer[];
}

interface ArchitectureLayer {
  role?: string;
  module?: string;
  renders_via?: string;
}
interface ArchitectureDoc {
  service_backed?: boolean;
  layers?: ArchitectureLayer[];
}

/** Trailing-slash-insensitive module comparison (app/services/ === app/services). */
function normModule(m: string): string {
  return m.replace(/\/+$/, "");
}

/** Read the persisted conventions, or undefined when none are established yet. */
export function readConventions(sftddDir: string): ArchitectureConventions | undefined {
  const f = architectureConventionsJson(sftddDir);
  if (!existsSync(f)) return undefined;
  try {
    return JSON.parse(readFileSync(f, "utf8")) as ArchitectureConventions;
  } catch {
    return undefined;
  }
}

/** True once the project conventions are on disk (the inherit/skip probe). */
export function conventionsReady(sftddDir: string): boolean {
  return existsSync(architectureConventionsJson(sftddDir));
}

/**
 * Project the persistable conventions from a feature's architecture.json.
 * Returns undefined when the feature is NOT service-backed or declares no
 * layers , a trivial feature pins no layout, so conventions wait for the first
 * service-backed feature. `established_by` is the feature id; `now` is injectable
 * for deterministic tests.
 */
export function deriveConventions(
  architectureJsonContent: string,
  featureId: string,
  now: () => Date = () => new Date(),
): ArchitectureConventions | undefined {
  let doc: ArchitectureDoc;
  try {
    doc = JSON.parse(architectureJsonContent) as ArchitectureDoc;
  } catch {
    return undefined;
  }
  if (doc.service_backed !== true) return undefined;
  const layers = (doc.layers ?? [])
    .filter((l): l is ArchitectureLayer & { role: string; module: string } =>
      typeof l.role === "string" && typeof l.module === "string",
    )
    .map((l) => ({
      role: l.role,
      module: normModule(l.module),
      ...(typeof l.renders_via === "string" ? { renders_via: l.renders_via } : {}),
    }));
  if (layers.length === 0) return undefined;
  return {
    established_by: featureId,
    established_at: now().toISOString(),
    service_backed: true,
    layers,
  };
}

export interface EstablishResult {
  /** A new conventions.json was written this call. */
  established: boolean;
  /** The conventions now on disk (whether just established or pre-existing). */
  conventions?: ArchitectureConventions;
}

/**
 * Establish the project conventions from a feature's architecture.json IF none
 * exist yet. Idempotent + deterministic: a no-op once conventions.json is on
 * disk (later features inherit, never overwrite), and a no-op when the feature
 * is not service-backed (nothing to pin). The first service-backed feature's
 * layout becomes the project canon.
 */
export function establishConventionsIfAbsent(
  sftddDir: string,
  featureId: string,
  now: () => Date = () => new Date(),
): EstablishResult {
  const existing = readConventions(sftddDir);
  if (existing) return { established: false, conventions: existing };

  const archFile = architectureJson(sftddDir, featureId);
  if (!existsSync(archFile)) return { established: false };
  let content: string;
  try {
    content = readFileSync(archFile, "utf8");
  } catch {
    return { established: false };
  }
  const conventions = deriveConventions(content, featureId, now);
  if (!conventions) return { established: false };

  const out = architectureConventionsJson(sftddDir);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(conventions, null, 2) + "\n");
  return { established: true, conventions };
}

/** A conformance verdict (mirrors artifact-conformance's shape). */
export type ConformanceResult = { ok: true } | { ok: false; violations: string[] };

/**
 * HARD conform: a later feature's architecture.json MUST realize every
 * established convention layer at the SAME module path (and the same rendering
 * framework, when the convention pins one). The feature MAY add layers; it may
 * NOT remap or drop an established role.
 *
 * Exempt (ok) when the feature is not service-backed or declares no layers (a
 * trivial feature inherits no layout obligation). The FIRST feature is exempt by
 * construction , there are no conventions to conform to until it establishes them.
 */
export function assertArchitectureConforms(
  conventions: ArchitectureConventions,
  architectureJsonContent: string,
): ConformanceResult {
  let doc: ArchitectureDoc;
  try {
    doc = JSON.parse(architectureJsonContent) as ArchitectureDoc;
  } catch (err) {
    return { ok: false, violations: [`architecture.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  // A trivial (non-service-backed / layerless) feature pins no layout.
  if (doc.service_backed !== true) return { ok: true };
  const featureLayers = (doc.layers ?? []).filter(
    (l): l is ArchitectureLayer & { role: string; module: string } =>
      typeof l.role === "string" && typeof l.module === "string",
  );
  if (featureLayers.length === 0) return { ok: true };

  const violations: string[] = [];
  for (const conv of conventions.layers) {
    const match = featureLayers.find((l) => l.role === conv.role);
    if (!match) {
      violations.push(
        `architecture.json does not realize the established ${conv.role} layer ` +
          `(project convention pins ${conv.role} -> ${conv.module}, set by ${conventions.established_by})`,
      );
      continue;
    }
    if (normModule(match.module) !== conv.module) {
      violations.push(
        `architecture.json remaps the ${conv.role} layer to "${normModule(match.module)}" but the project ` +
          `convention pins ${conv.role} -> "${conv.module}" (set by ${conventions.established_by}); ` +
          `reuse the established module path, do not diverge`,
      );
    }
    if (conv.renders_via && match.renders_via && match.renders_via !== conv.renders_via) {
      violations.push(
        `architecture.json renders the ${conv.role} layer via "${match.renders_via}" but the project ` +
          `convention pins "${conv.renders_via}" (set by ${conventions.established_by})`,
      );
    }
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
