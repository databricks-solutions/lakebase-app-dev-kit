#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/sftdd/sftdd-paths.ts
var fs = __toESM(require("fs"), 1);
var import_node_path = require("path");
var ARTIFACT_ROOT = ".sftdd";
var LEGACY_ARTIFACT_ROOT = ".tdd";
function resolveSftddDir(projectDir = process.cwd()) {
  const next = (0, import_node_path.join)(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  const legacy = (0, import_node_path.join)(projectDir, LEGACY_ARTIFACT_ROOT);
  if (fs.existsSync(legacy)) return legacy;
  return next;
}
var featuresDir = (tdd) => (0, import_node_path.join)(tdd, "features");
var planningDir = (tdd) => (0, import_node_path.join)(tdd, "planning");
var sprintsDir = (tdd) => (0, import_node_path.join)(tdd, "sprints");
var featureDir = (tdd, featureId) => (0, import_node_path.join)(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var featureRequestMd = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "feature-request.md");
var sprintDir = (tdd, sprint) => (0, import_node_path.join)(sprintsDir(tdd), sprint);
var backlogJson = (tdd, sprint) => (0, import_node_path.join)(sprintDir(tdd, sprint), "backlog.json");
var sprintRequestedJson = (tdd, sprint) => (0, import_node_path.join)(sprintDir(tdd, sprint), "requested.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}
var hasFeatureRequest = (tdd, f) => fs.existsSync(featureRequestMd(tdd, f));
var TSHIRT_SIZES = /* @__PURE__ */ new Set(["XS", "S", "M", "L", "XL"]);
var isTshirtSize = (x) => typeof x === "string" && TSHIRT_SIZES.has(x);
var planningEstimatesJson = (tdd) => (0, import_node_path.join)(planningDir(tdd), "estimates.json");
function readEstimates(tdd) {
  const file = planningEstimatesJson(tdd);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(data.estimates)) return [];
    return data.estimates.flatMap((e) => {
      const id = e?.feature_id;
      const size = e?.size;
      if (typeof id !== "string" || !id || !isTshirtSize(size)) return [];
      const rationale = e?.rationale;
      return [{ feature_id: id, size, ...typeof rationale === "string" ? { rationale } : {} }];
    });
  } catch {
    return [];
  }
}
function writeBacklog(tdd, backlog2) {
  fs.mkdirSync(sprintDir(tdd, backlog2.sprint), { recursive: true });
  fs.writeFileSync(backlogJson(tdd, backlog2.sprint), JSON.stringify(backlog2, null, 2) + "\n", "utf8");
}
function readRequested(tdd, sprint) {
  const file = sprintRequestedJson(tdd, sprint);
  if (!fs.existsSync(file)) return void 0;
  try {
    const p2 = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(p2) ? p2.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeRequested(tdd, sprint, ids2) {
  const existing = readRequested(tdd, sprint) ?? [];
  const merged = [.../* @__PURE__ */ new Set([...existing, ...ids2])].sort();
  fs.mkdirSync(sprintDir(tdd, sprint), { recursive: true });
  fs.writeFileSync(sprintRequestedJson(tdd, sprint), JSON.stringify(merged, null, 2) + "\n", "utf8");
  return merged;
}
function syncBacklog(tdd, sprint) {
  const sizeOf = new Map(readEstimates(tdd).map((e) => [e.feature_id, e.size]));
  const root = featuresDir(tdd);
  const requested = readRequested(tdd, sprint);
  const scope = requested ? new Set(requested) : void 0;
  const committed = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => {
    try {
      if (!fs.statSync((0, import_node_path.join)(root, d)).isDirectory()) return false;
      if (!fs.existsSync((0, import_node_path.join)(root, d, "feature-request.md"))) return false;
      return scope ? scope.has(d) : true;
    } catch {
      return false;
    }
  }).sort() : [];
  const features = committed.map((id) => {
    const size = sizeOf.get(id);
    return { id, ...size ? { size } : {} };
  });
  const backlog2 = { sprint, features };
  writeBacklog(tdd, backlog2);
  return backlog2;
}

// scripts/sftdd/sync-backlog.cli.ts
function parse(argv) {
  const out = { projectDir: process.cwd(), features: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sprint" && i + 1 < argv.length) out.sprint = argv[++i];
    else if (a === "--project-dir" && i + 1 < argv.length) out.projectDir = argv[++i];
    else if (a === "--tdd-dir" && i + 1 < argv.length) out.tddDir = argv[++i];
    else if (a === "--features" && i + 1 < argv.length) {
      for (const id of argv[++i].split(",").map((s) => s.trim()).filter(Boolean)) out.features.push(id);
    } else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") help();
  }
  return out;
}
function help() {
  process.stdout.write(
    `lakebase-sftdd-sync-backlog , commit a sprint's backlog from authored feature-request.md files

Usage:
  lakebase-sftdd-sync-backlog --sprint <s> [--features F1,F2 ...] [--project-dir <path>] [--tdd-dir <path>] [--json]

--features declares this sprint's membership (recorded to sprints/<s>/requested.json); omit to re-project
from the existing requested.json. Projects backlog.json = requested features that have a feature-request.md.
Exit 0 = backlog committed; exit 2 = empty (author the feature-request.md files first).
`
  );
  process.exit(0);
}
var p = parse(process.argv.slice(2));
if (!p.sprint) {
  process.stderr.write(`lakebase-sftdd-sync-backlog: --sprint <name> is required.
`);
  process.exit(2);
}
var sftddDir = p.tddDir ?? resolveSftddDir(p.projectDir);
if (p.features.length > 0) {
  const missing = p.features.filter((id) => !hasFeatureRequest(sftddDir, id));
  writeRequested(sftddDir, p.sprint, p.features);
  for (const id of missing) {
    process.stderr.write(`sync-backlog: WARNING , ${id} has no feature-request.md yet; excluded until authored.
`);
  }
}
var backlog = syncBacklog(sftddDir, p.sprint);
var ids = backlog.features.map((f) => f.id);
if (p.json) {
  process.stdout.write(`${JSON.stringify(backlog)}
`);
} else if (ids.length > 0) {
  process.stdout.write(`sync-backlog: committed ${ids.length} feature(s) to sprint '${p.sprint}': ${ids.join(", ")}
`);
} else {
  process.stderr.write(
    `sync-backlog: no backlog committed for sprint '${p.sprint}' , no requested feature has a feature-request.md.
Author the PO's feature-request.md files (and pass --features to declare membership), then re-run.
`
  );
}
process.exit(ids.length > 0 ? 0 : 2);
//# sourceMappingURL=sync-backlog.cli.cjs.map