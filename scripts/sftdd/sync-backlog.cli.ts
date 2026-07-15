#!/usr/bin/env node
// lakebase-sftdd-sync-backlog: commit a sprint's backlog from the PO's authored
// feature-request.md files , the HUMAN-in-the-loop door that the Human Proxy takes
// headlessly at the planning `author-requests` step.
//
// Why this exists (FEIP-8002): in interactive `--plan-only` the driver stops
// BEFORE performing the author-requests effect, and that effect (supply-requests +
// sync-backlog) is the ONLY writer of backlog.json , from which `requestsAuthored`
// is derived. So a human PO who authors feature-request.md files could never flip
// the state or reach the plan gate; the loop was a dead-end. This CLI lets the PO
// commit the backlog out-of-band: after it runs, re-running the driver advances to
// the (interactive) plan gate.
//
// Membership: `--features` (repeatable or comma-separated) declares which features
// belong to THIS sprint, recorded to sprints/<sprint>/requested.json , the SAME
// one membership file the Human Proxy writes (writeRequested merges, never shrinks).
// Omit it to (re-)project from whatever requested.json already holds. syncBacklog
// then projects backlog.json = the requested features that have a feature-request.md.
//
// Usage:
//   lakebase-sftdd-sync-backlog --sprint <s> [--features F1,F2 ...]
//                               [--project-dir <path>] [--tdd-dir <path>] [--json]
// Exit 0 = backlog committed (>= 1 feature); exit 2 = empty backlog (author the
//          feature-request.md files first, or fix the declared membership).

import { resolveSftddDir, syncBacklog, writeRequested, hasFeatureRequest } from "./sftdd-paths.js";

interface Parsed {
  sprint?: string;
  projectDir: string;
  tddDir?: string;
  features: string[];
  json: boolean;
}

function parse(argv: string[]): Parsed {
  const out: Parsed = { projectDir: process.cwd(), features: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sprint" && i + 1 < argv.length) out.sprint = argv[++i];
    else if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--tdd-dir" && i + 1 < argv.length) out.tddDir = argv[++i];
    // Repeatable AND comma-separated: --features F1,F2 or --features F1 --features F2.
    else if (a === "--features" && i + 1 < argv.length) {
      for (const id of argv[++i].split(",").map((s) => s.trim()).filter(Boolean)) out.features.push(id);
    } else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}

function help(): never {
  process.stdout.write(
    `lakebase-sftdd-sync-backlog , commit a sprint's backlog from authored feature-request.md files\n\n` +
      `Usage:\n` +
      `  lakebase-sftdd-sync-backlog --sprint <s> [--features F1,F2 ...] [--project-dir <path>] [--tdd-dir <path>] [--json]\n\n` +
      `--features declares this sprint's membership (recorded to sprints/<s>/requested.json); omit to re-project\n` +
      `from the existing requested.json. Projects backlog.json = requested features that have a feature-request.md.\n` +
      `Exit 0 = backlog committed; exit 2 = empty (author the feature-request.md files first).\n`,
  );
  process.exit(0);
}

const p = parse(process.argv.slice(2));
if (!p.sprint) {
  process.stderr.write(`lakebase-sftdd-sync-backlog: --sprint <name> is required.\n`);
  process.exit(2);
}
const sftddDir = p.tddDir ?? resolveSftddDir(p.projectDir);

// Declare membership first (if given), warning about any declared feature that has
// no feature-request.md yet , it will be excluded from the backlog until authored.
if (p.features.length > 0) {
  const missing = p.features.filter((id) => !hasFeatureRequest(sftddDir, id));
  writeRequested(sftddDir, p.sprint, p.features);
  for (const id of missing) {
    process.stderr.write(`sync-backlog: WARNING , ${id} has no feature-request.md yet; excluded until authored.\n`);
  }
}

const backlog = syncBacklog(sftddDir, p.sprint);
const ids = backlog.features.map((f) => f.id);

if (p.json) {
  process.stdout.write(`${JSON.stringify(backlog)}\n`);
} else if (ids.length > 0) {
  process.stdout.write(`sync-backlog: committed ${ids.length} feature(s) to sprint '${p.sprint}': ${ids.join(", ")}\n`);
} else {
  process.stderr.write(
    `sync-backlog: no backlog committed for sprint '${p.sprint}' , no requested feature has a feature-request.md.\n` +
      `Author the PO's feature-request.md files (and pass --features to declare membership), then re-run.\n`,
  );
}

process.exit(ids.length > 0 ? 0 : 2);
