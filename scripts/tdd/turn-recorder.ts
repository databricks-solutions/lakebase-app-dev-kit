// Universal turn recorder: a first-class capture of EVERY state-machine turn the
// deterministic driver takes (design, gates, build, deploy, accept, promote),
// recording the artifacts that turn produced as a replayable timeline.
//
// This generalizes the build-only recorder (recordBuildTurn) to the whole
// machine , the design lane in particular had no recorder, so the design corpus
// used to be hand-assembled. Wired via `withTurnRecording` (drive.cli.ts), gated
// on LAKEBASE_TDD_RECORD_DIR, fired AFTER each turn's effect lands.
//
// Layout under recordDir (the answer to "record every step, replayably"):
//   turns/<NNNN>-<label>/turn.json   , manifest {step, kind, role, mode, story, ac, action, produced[], deleted[]}
//   turns/<NNNN>-<label>/files/<rel> , the .tdd + code DELTA this turn produced
//   turns/index.json                 , the ordered list of every recorded turn
//   recorded-artifacts/<rel under .tdd> , the CUMULATIVE .tdd mirror, so the
//                                          existing replayDesignTurn(replayDir=
//                                          recorded-artifacts) consumes it as-is
//   .recorder-state.json             , internal file-hash map for delta computation
//
// recorded-build/ (the per-turn code corpus replayBuildTurn reads) is populated
// by the existing recordBuildTurn, which `withTurnRecording` calls for build
// turns , so design + build replay both round-trip from one recordDir.

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { codeTreeFilter } from "./replay-build.js";
import type { WorkflowAction } from "./orchestrator-drive.js";

/** A relpath the recorder watches, keyed to its scan root (so the cumulative
 *  .tdd mirror can be re-rooted under recorded-artifacts). */
interface ScannedFile {
  /** Absolute path on disk. */
  abs: string;
  /** Path relative to projectDir (the stable key across turns). */
  rel: string;
  /** Whether this file lives under .tdd (-> mirrored into recorded-artifacts). */
  underTdd: boolean;
  /** Content hash. */
  sha: string;
}

export interface RecordTurnArgs {
  /** LAKEBASE_TDD_RECORD_DIR , the corpus root. */
  recordDir: string;
  /** Project working tree root (dirname of tddDir). */
  projectDir: string;
  /** The project .tdd dir. */
  tddDir: string;
  /** The action just performed. */
  action: WorkflowAction;
  /** The driver loop iteration (per-process; not globally unique , the recorder
   *  assigns its own monotonic ordinal from the on-disk index). */
  step: number;
}

export interface RecordedTurn {
  /** Globally monotonic ordinal across the whole run (index length at record time). */
  ordinal: number;
  /** turns/<NNNN>-<label> dir name. */
  dir: string;
  /** Relpaths produced (added/changed) this turn. */
  produced: string[];
  /** Relpaths deleted this turn. */
  deleted: string[];
}

/** Append-only log + recorder bookkeeping that must NOT count as a turn's
 *  produced artifact (they churn every turn / are the recorder's own state). */
const NON_ARTIFACT_TDD = new Set(["agent-log.jsonl"]);

/** Short, filesystem-safe label for a turn dir, derived from the action. */
export function labelForAction(action: WorkflowAction): string {
  const a = action as Record<string, unknown>;
  const kind = String(a.kind ?? "turn");
  if (kind === "invoke-role") {
    const role = String(a.role ?? "role");
    const mode = a.buildMode ?? a.mode;
    return mode ? `${role}-${mode}` : role;
  }
  if (kind === "approve-gate" || kind === "approve-plan-gate" || kind === "approve-promote-gate") {
    // approve-gate carries the per-story spec gate; the others name their gate.
    if (kind === "approve-plan-gate") return "gate-plan";
    if (kind === "approve-promote-gate") return "gate-promote";
    return "gate-spec";
  }
  if (kind === "approve-deploy-gate") return "gate-deploy";
  if (kind === "surface-gate") return "gate-surface";
  // cut-experiment, accept, deploy, prepare-pr, wait-ci, merge, dispatch,
  // feature-complete, deploy-complete, planning-complete, complete, ...
  return kind;
}

function sha1(abs: string): string {
  return createHash("sha1").update(readFileSync(abs)).digest("hex");
}

/** Recursively list files under a dir, applying an optional path filter. */
function walk(dir: string, keep?: (abs: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (keep && !keep(abs)) continue;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walk(abs, keep));
    else if (st.isFile()) out.push(abs);
  }
  return out;
}

/** Scan the watched roots (.tdd in full + the code tree via codeTreeFilter) into
 *  a stable relpath->ScannedFile map. The code filter also excludes .tdd, so the
 *  two roots never double-count. */
function scan(projectDir: string, tddDir: string): Map<string, ScannedFile> {
  const map = new Map<string, ScannedFile>();
  // .tdd in full (minus the recorder's own append-only log).
  for (const abs of walk(tddDir)) {
    const rel = relative(projectDir, abs);
    if (NON_ARTIFACT_TDD.has(relative(tddDir, abs))) continue;
    map.set(rel, { abs, rel, underTdd: true, sha: sha1(abs) });
  }
  // The code tree (app/, tests/, alembic/, etc.) via the shared filter, which
  // skips scaffold-owned dirs (.tdd/.git/scripts/...), junk, and secrets.
  const keep = codeTreeFilter(projectDir);
  for (const abs of walk(projectDir, keep)) {
    const rel = relative(projectDir, abs);
    if (map.has(rel)) continue;
    map.set(rel, { abs, rel, underTdd: false, sha: sha1(abs) });
  }
  return map;
}

interface RecorderState {
  /** relpath -> sha at the end of the previous turn. */
  files: Record<string, string>;
}

function writeRecorderState(recordDir: string, cur: Map<string, ScannedFile>): void {
  const files: Record<string, string> = {};
  for (const [rel, f] of cur) files[rel] = f.sha;
  mkdirSync(recordDir, { recursive: true });
  writeFileSync(join(recordDir, ".recorder-state.json"), JSON.stringify({ files }, null, 2) + "\n");
}

/**
 * Seed the delta baseline with the CURRENT project state, once, before the first
 * turn is recorded , so turn 0's delta reports only what that turn produced, not
 * the pre-existing scaffold + intake files. A no-op if a baseline already exists
 * (e.g. a later drive process in the same run, which must keep the running state
 * from the prior process). Call at recorder construction, after scaffold/intake.
 */
export function seedRecorderBaseline(args: { recordDir: string; projectDir: string; tddDir: string }): boolean {
  if (existsSync(join(args.recordDir, ".recorder-state.json"))) return false;
  writeRecorderState(args.recordDir, scan(args.projectDir, args.tddDir));
  return true;
}

function readState(recordDir: string): RecorderState {
  const f = join(recordDir, ".recorder-state.json");
  if (!existsSync(f)) return { files: {} };
  try {
    return JSON.parse(readFileSync(f, "utf8")) as RecorderState;
  } catch {
    return { files: {} };
  }
}

interface IndexEntry {
  ordinal: number;
  step: number;
  label: string;
  kind: string;
  role?: string;
  mode?: string;
  story?: string;
  ac?: string;
  dir: string;
  producedCount: number;
  deletedCount: number;
}

function readIndex(recordDir: string): IndexEntry[] {
  const f = join(recordDir, "turns", "index.json");
  if (!existsSync(f)) return [];
  try {
    const data = JSON.parse(readFileSync(f, "utf8")) as { turns?: IndexEntry[] };
    return Array.isArray(data.turns) ? data.turns : [];
  } catch {
    return [];
  }
}

function pad(n: number): string {
  return String(n).padStart(4, "0");
}

/**
 * Record one state-machine turn: write its manifest + the .tdd/code delta it
 * produced under turns/<NNNN>-<label>/, refresh the cumulative recorded-artifacts
 * .tdd mirror, and append to turns/index.json. The ordinal is monotonic across
 * the whole run (every drive process appends to the same on-disk index), so the
 * timeline is correct even though each feature/sprint is a separate process.
 */
export function recordTurn(args: RecordTurnArgs): RecordedTurn {
  const { recordDir, projectDir, tddDir, action, step } = args;
  const a = action as Record<string, unknown>;

  const prior = readState(recordDir);
  const cur = scan(projectDir, tddDir);

  const produced: string[] = [];
  for (const [rel, f] of cur) {
    if (prior.files[rel] !== f.sha) produced.push(rel);
  }
  const deleted: string[] = [];
  for (const rel of Object.keys(prior.files)) {
    if (!cur.has(rel)) deleted.push(rel);
  }
  produced.sort();
  deleted.sort();

  const ordinal = readIndex(recordDir).length;
  const label = labelForAction(action);
  const dirName = `${pad(ordinal)}-${label}`;
  const turnDir = join(recordDir, "turns", dirName);
  mkdirSync(join(turnDir, "files"), { recursive: true });

  const artifactsDir = join(recordDir, "recorded-artifacts");

  // Copy each produced file into the turn's delta, and mirror .tdd files into the
  // cumulative recorded-artifacts corpus (so replayDesignTurn reads it as-is).
  for (const rel of produced) {
    const f = cur.get(rel)!;
    const dst = join(turnDir, "files", rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(f.abs, dst);
    if (f.underTdd) {
      const mirror = join(artifactsDir, relative(tddDir, f.abs));
      mkdirSync(dirname(mirror), { recursive: true });
      cpSync(f.abs, mirror);
    }
  }
  // Remove cumulative-mirror entries for deleted .tdd files.
  for (const rel of deleted) {
    const abs = join(projectDir, rel);
    if (abs.startsWith(tddDir)) {
      const mirror = join(artifactsDir, relative(tddDir, abs));
      if (existsSync(mirror)) rmSync(mirror, { force: true });
    }
  }

  const manifest = {
    ordinal,
    step,
    label,
    kind: String(a.kind ?? "turn"),
    role: a.role as string | undefined,
    mode: (a.buildMode ?? a.mode) as string | undefined,
    story: a.story as string | undefined,
    ac: a.ac as string | undefined,
    action,
    produced,
    deleted,
  };
  writeFileSync(join(turnDir, "turn.json"), JSON.stringify(manifest, null, 2) + "\n");

  // Append to the ordered index.
  const index = readIndex(recordDir);
  const entry: IndexEntry = {
    ordinal,
    step,
    label,
    kind: manifest.kind,
    role: manifest.role,
    mode: manifest.mode,
    story: manifest.story,
    ac: manifest.ac,
    dir: dirName,
    producedCount: produced.length,
    deletedCount: deleted.length,
  };
  index.push(entry);
  mkdirSync(join(recordDir, "turns"), { recursive: true });
  writeFileSync(join(recordDir, "turns", "index.json"), JSON.stringify({ turns: index }, null, 2) + "\n");

  // Persist the new file-state for the next turn's delta.
  writeRecorderState(recordDir, cur);

  return { ordinal, dir: dirName, produced, deleted };
}
