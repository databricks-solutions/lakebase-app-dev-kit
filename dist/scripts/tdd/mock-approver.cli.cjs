#!/usr/bin/env node
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/tdd/mock-approver.cli.ts
var mock_approver_cli_exports = {};
__export(mock_approver_cli_exports, {
  runMockApproverCli: () => runMockApproverCli
});
module.exports = __toCommonJS(mock_approver_cli_exports);

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// scripts/util/cli-entry.ts
var import_node_fs = require("fs");
var import_node_url = require("url");
function isCliEntry(importMetaUrl2) {
  const invokedRaw = process.argv[1];
  if (!invokedRaw) return false;
  let invokedResolved;
  let moduleResolved;
  try {
    invokedResolved = (0, import_node_fs.realpathSync)(invokedRaw);
  } catch {
    return false;
  }
  try {
    moduleResolved = (0, import_node_fs.realpathSync)((0, import_node_url.fileURLToPath)(importMetaUrl2));
  } catch {
    return false;
  }
  return invokedResolved === moduleResolved;
}

// scripts/tdd/mock-approver.ts
var import_node_fs2 = require("fs");
var import_node_path = require("path");

// scripts/tdd/approve-gate.ts
var import_fs3 = require("fs");
var import_path3 = require("path");

// scripts/tdd/gate-hash.ts
var import_crypto = require("crypto");
function normalizeForHash(content) {
  let normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  normalized = normalized.split("\n").map((line) => line.replace(/[ \t]+$/, "")).join("\n");
  normalized = normalized.replace(/\n{3,}/g, "\n\n");
  return normalized;
}
function hashArtifact(content) {
  return (0, import_crypto.createHash)("sha256").update(normalizeForHash(content), "utf8").digest("hex");
}

// scripts/tdd/gates-lock.ts
var import_fs = require("fs");
var import_path = require("path");
var GatesLockBusyError = class extends Error {
  constructor(featureId, heldByPid, retries) {
    super(
      `gates.json lock for ${featureId} is held by PID ${heldByPid ?? "unknown"} after ${retries} retries. If the holder has crashed, remove the lock file manually.`
    );
    this.featureId = featureId;
    this.heldByPid = heldByPid;
    this.retries = retries;
    this.name = "GatesLockBusyError";
  }
  featureId;
  heldByPid;
  retries;
};
function withGatesLock(featureId, fn, opts = {}) {
  const tddDir = opts.tddDir ?? "./.tdd";
  const maxRetries = opts.maxRetries ?? 5;
  const initialBackoffMs = opts.initialBackoffMs ?? 20;
  const sleep = opts.sleep ?? defaultSleep;
  const lockPath = gatesLockFilePath(tddDir, featureId);
  let acquired = false;
  let attempts = 0;
  while (!acquired && attempts <= maxRetries) {
    try {
      const fd = (0, import_fs.openSync)(lockPath, "wx");
      (0, import_fs.writeFileSync)(fd, String(process.pid));
      (0, import_fs.closeSync)(fd);
      acquired = true;
    } catch (err) {
      if (!isEexist(err)) throw err;
      attempts += 1;
      if (attempts > maxRetries) {
        const heldByPid = readHeldByPid(lockPath);
        throw new GatesLockBusyError(featureId, heldByPid, maxRetries);
      }
      sleep(initialBackoffMs * 2 ** (attempts - 1));
    }
  }
  try {
    return fn();
  } finally {
    try {
      (0, import_fs.unlinkSync)(lockPath);
    } catch {
    }
  }
}
function isEexist(err) {
  return typeof err === "object" && err !== null && err.code === "EEXIST";
}
function readHeldByPid(lockPath) {
  try {
    const text = (0, import_fs.readFileSync)(lockPath, "utf8");
    const n = Number(text.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
function gatesLockFilePath(tddDir, featureId) {
  const dir = findFeatureDir(tddDir, featureId);
  (0, import_fs.mkdirSync)(dir, { recursive: true });
  return (0, import_path.join)(dir, ".gates.lock");
}
function findFeatureDir(tddDir, featureId) {
  const featuresDir = (0, import_path.join)(tddDir, "features");
  if (!(0, import_fs.existsSync)(featuresDir)) {
    throw new Error(`${featuresDir} does not exist`);
  }
  const candidates = (0, import_fs.readdirSync)(featuresDir).filter((d) => d.startsWith(featureId));
  if (candidates.length === 0) {
    throw new Error(`feature ${featureId} not found under ${featuresDir}`);
  }
  return (0, import_path.join)(featuresDir, candidates[0]);
}
function defaultSleep(ms) {
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

// scripts/tdd/gates.ts
var import_fs2 = require("fs");
var import_path2 = require("path");
var GATES_SCHEMA_VERSION = 1;
var GATE_STATUSES = ["open", "approved", "superseded", "withdrawn"];
function defaultGatesState(featureId) {
  return {
    feature_id: featureId,
    schema_version: GATES_SCHEMA_VERSION,
    gates: {
      spec: { status: "open", history: [] },
      plan: { status: "open", history: [] },
      test_list: { status: "open", history: [] },
      promote: { status: "open", history: [] }
    }
  };
}
function readGates(featureId, opts = {}) {
  const tddDir = opts.tddDir ?? "./.tdd";
  const file = gatesFilePath(tddDir, featureId);
  if (!(0, import_fs2.existsSync)(file)) {
    return defaultGatesState(featureId);
  }
  const raw = (0, import_fs2.readFileSync)(file, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`gates.json at ${file} is not valid JSON: ${cause}`);
  }
  return validateGatesState(parsed, file);
}
function writeGates(state, opts = {}) {
  if (state.feature_id.length === 0) {
    throw new Error("writeGates: state.feature_id must not be empty");
  }
  const tddDir = opts.tddDir ?? "./.tdd";
  const file = gatesFilePath(tddDir, state.feature_id);
  const tempFile = `${file}.tmp.${process.pid}.${Date.now()}`;
  const payload = JSON.stringify(state, null, 2) + "\n";
  (0, import_fs2.writeFileSync)(tempFile, payload, "utf8");
  try {
    (0, import_fs2.renameSync)(tempFile, file);
  } catch (err) {
    try {
      (0, import_fs2.unlinkSync)(tempFile);
    } catch {
    }
    throw err;
  }
}
function gatesFilePath(tddDir, featureId) {
  return (0, import_path2.join)(findFeatureDir2(tddDir, featureId), "gates.json");
}
function findFeatureDir2(tddDir, featureId) {
  const featuresDir = (0, import_path2.join)(tddDir, "features");
  if (!(0, import_fs2.existsSync)(featuresDir)) {
    throw new Error(`${featuresDir} does not exist`);
  }
  const candidates = (0, import_fs2.readdirSync)(featuresDir).filter((d) => d.startsWith(featureId));
  if (candidates.length === 0) {
    throw new Error(`feature ${featureId} not found under ${featuresDir}`);
  }
  return (0, import_path2.join)(featuresDir, candidates[0]);
}
function validateGatesState(parsed, file) {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`gates.json at ${file} is not an object`);
  }
  const obj = parsed;
  if (typeof obj.feature_id !== "string" || obj.feature_id.length === 0) {
    throw new Error(`gates.json at ${file}: missing or invalid feature_id`);
  }
  if (typeof obj.schema_version !== "number") {
    throw new Error(`gates.json at ${file}: missing or invalid schema_version`);
  }
  if (typeof obj.gates !== "object" || obj.gates === null) {
    throw new Error(`gates.json at ${file}: missing or invalid gates`);
  }
  const gates = obj.gates;
  const out = {
    spec: validateGateRecord(gates.spec, "spec", file),
    plan: validateGateRecord(gates.plan, "plan", file),
    test_list: validateGateRecord(gates.test_list, "test_list", file),
    promote: validateGateRecord(gates.promote, "promote", file)
  };
  return {
    feature_id: obj.feature_id,
    schema_version: obj.schema_version,
    gates: out
  };
}
function validateGateRecord(parsed, gateName, file) {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`gates.json at ${file}: gate ${gateName} is not an object`);
  }
  const obj = parsed;
  const status = obj.status;
  if (typeof status !== "string" || !GATE_STATUSES.includes(status)) {
    throw new Error(
      `gates.json at ${file}: gate ${gateName} has invalid status (${String(status)}); expected one of ${GATE_STATUSES.join(", ")}`
    );
  }
  const history = obj.history;
  if (history !== void 0 && !Array.isArray(history)) {
    throw new Error(`gates.json at ${file}: gate ${gateName} history must be an array`);
  }
  return {
    status,
    approver: typeof obj.approver === "string" ? obj.approver : void 0,
    approved_at: typeof obj.approved_at === "string" ? obj.approved_at : void 0,
    artifact_hashes: obj.artifact_hashes && typeof obj.artifact_hashes === "object" ? obj.artifact_hashes : void 0,
    withdrawal_reason: typeof obj.withdrawal_reason === "string" ? obj.withdrawal_reason : void 0,
    history: history ?? []
  };
}

// scripts/tdd/approve-gate.ts
var GateAlreadyClosedError = class extends Error {
  constructor(gate, currentStatus) {
    super(
      `gate ${gate} is not open (current status: ${currentStatus}); withdraw or supersede before re-approving`
    );
    this.gate = gate;
    this.currentStatus = currentStatus;
    this.name = "GateAlreadyClosedError";
  }
  gate;
  currentStatus;
};
function approveGate(args) {
  if (!args.hitlApproved) {
    throw new Error("approveGate requires hitlApproved: true (HITL Gate)");
  }
  if (args.approver.length === 0) {
    throw new Error("approveGate: approver must not be empty");
  }
  const artifactNames = Object.keys(args.artifactInputs);
  if (artifactNames.length === 0) {
    throw new Error(
      `approveGate: gate ${args.gate} must capture at least one artifact (got empty artifactInputs)`
    );
  }
  const tddDir = args.tddDir ?? "./.tdd";
  const now = args.now ?? (() => /* @__PURE__ */ new Date());
  const writeLog = args.writeSelectionLog ?? true;
  return withGatesLock(
    args.featureId,
    () => {
      const state = readGates(args.featureId, { tddDir });
      const record = state.gates[args.gate];
      if (record.status !== "open") {
        throw new GateAlreadyClosedError(args.gate, record.status);
      }
      const capturedHashes = {};
      for (const name of artifactNames) {
        capturedHashes[name] = hashArtifact(args.artifactInputs[name]);
      }
      const ts = now().toISOString();
      const updatedState = {
        ...state,
        gates: {
          ...state.gates,
          [args.gate]: {
            status: "approved",
            approver: args.approver,
            approved_at: ts,
            artifact_hashes: capturedHashes,
            history: [
              ...record.history,
              {
                action: "approved",
                at: ts,
                approver: args.approver,
                artifact_hashes: capturedHashes
              }
            ]
          }
        }
      };
      writeGates(updatedState, { tddDir });
      if (writeLog) {
        appendSelectionLog(tddDir, {
          ts,
          gate: args.gate,
          featureId: args.featureId,
          approver: args.approver,
          capturedHashes
        });
      }
      return { state: updatedState, capturedHashes };
    },
    { tddDir }
  );
}
function appendSelectionLog(tddDir, entry) {
  const logPath = (0, import_path3.join)(tddDir, "selection-log.md");
  const hashList = Object.entries(entry.capturedHashes).map(([name, hash]) => `  - \`${name}\`: \`sha256:${hash}\``).join("\n");
  const lines = [
    "",
    `## ${entry.ts} \u2013 Approve ${entry.gate} for ${entry.featureId}`,
    `- **Approved by:** ${entry.approver}`,
    `- **Artifact hashes:**`,
    hashList,
    ""
  ];
  const text = lines.join("\n");
  if ((0, import_fs3.existsSync)(logPath)) {
    (0, import_fs3.writeFileSync)(logPath, (0, import_fs3.readFileSync)(logPath, "utf8") + text);
  } else {
    (0, import_fs3.writeFileSync)(logPath, text);
  }
}

// scripts/tdd/mock-approver.ts
var MOCK_APPROVER = "ci-mock-approver";
var PLACEHOLDER = "MOCK_APPROVED";
function featureDir(tddDir, featureId) {
  return (0, import_node_path.join)(tddDir, "features", featureId);
}
function loadArtifactInputs(gate, tddDir, featureId, promoteRef) {
  const fdir = featureDir(tddDir, featureId);
  const read = (p) => {
    try {
      if ((0, import_node_fs2.existsSync)(p)) return (0, import_node_fs2.readFileSync)(p, "utf8");
    } catch {
    }
    return PLACEHOLDER;
  };
  switch (gate) {
    case "spec":
      return {
        "spec.md": read((0, import_node_path.join)(fdir, "spec.md")),
        "feature.md": read((0, import_node_path.join)(fdir, "feature.md")),
        "feature.json": read((0, import_node_path.join)(fdir, "feature.json"))
      };
    case "plan":
      return {
        "plan.json": read((0, import_node_path.join)(fdir, "plan.json"))
      };
    case "test_list":
      return {
        "test-list.json": read((0, import_node_path.join)(fdir, "test-list.json")),
        "test-list.md": read((0, import_node_path.join)(fdir, "test-list.md"))
      };
    case "promote":
      return {
        promote_ref: promoteRef
      };
  }
}
function mockApproveOpenGates(args) {
  const tddDir = args.tddDir ?? "./.tdd";
  const approver = args.approver ?? MOCK_APPROVER;
  const promoteRef = args.promoteRef ?? "mock-promote-ref";
  const state = readGates(args.featureId, { tddDir });
  const approved = [];
  const skipped = [];
  const gates = args.onlyGate !== void 0 ? [args.onlyGate] : Object.keys(state.gates);
  let finalState = state;
  for (const gate of gates) {
    const record = state.gates[gate];
    if (record.status !== "open") {
      skipped.push({ gate, reason: `status=${record.status}` });
      continue;
    }
    const artifactInputs = loadArtifactInputs(
      gate,
      tddDir,
      args.featureId,
      promoteRef
    );
    const result = approveGate({
      featureId: args.featureId,
      gate,
      approver,
      hitlApproved: true,
      artifactInputs,
      tddDir
    });
    approved.push(gate);
    finalState = result.state;
  }
  return { approved, skipped, finalState };
}

// scripts/tdd/mock-approver.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--feature":
        out.feature = argv[++i];
        break;
      case "--gate":
        out.gate = argv[++i];
        break;
      case "--tdd-dir":
        out.tddDir = argv[++i];
        break;
      case "--approver":
        out.approver = argv[++i];
        break;
      case "--promote-ref":
        out.promoteRef = argv[++i];
        break;
      case "--json":
        out.json = true;
        break;
      case "--pretty":
        out.pretty = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
    }
  }
  return out;
}
var HELP = `lakebase-tdd-mock-approver

Mock HITL approver for automated smoke / headless test runs. Calls
approveGate on every open gate for a feature with hitlApproved=true,
default approver "ci-mock-approver". NOT for production use.

Usage:
  lakebase-tdd-mock-approver --feature <id> [flags]

Flags:
  --feature <id>          Feature id (required, e.g. F1-initial-domain)
  --gate <name>           Approve only one gate (spec | plan | test_list | promote)
  --tdd-dir <path>        .tdd/ root (default: ./.tdd)
  --approver <name>       Approver identity (default: ci-mock-approver)
  --promote-ref <str>     promote gate ref string (default: mock-promote-ref)
  --json                  Machine-readable JSON output
  --pretty                Pretty-print JSON
  -h, --help              Show this help
`;
function runMockApproverCli(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}
`);
    return 0;
  }
  if (!args.feature) {
    process.stderr.write(`Error: --feature is required.

${HELP}
`);
    return 2;
  }
  try {
    const result = mockApproveOpenGates({
      featureId: args.feature,
      tddDir: args.tddDir,
      approver: args.approver,
      onlyGate: args.gate,
      promoteRef: args.promoteRef
    });
    if (args.json) {
      process.stdout.write(
        `${JSON.stringify(
          { ok: true, ...result },
          null,
          args.pretty ? 2 : 0
        )}
`
      );
    } else {
      process.stdout.write(
        `mock-approver: approved ${result.approved.length} gate(s)${result.approved.length ? ": " + result.approved.join(", ") : ""}
`
      );
      if (result.skipped.length > 0) {
        process.stdout.write(
          `mock-approver: skipped ${result.skipped.length}: ${result.skipped.map((s) => `${s.gate} (${s.reason})`).join(", ")}
`
        );
      }
    }
    return 0;
  } catch (e) {
    const err = e;
    process.stderr.write(`mock-approver: ${err.message}
`);
    return 3;
  }
}
if (isCliEntry(importMetaUrl)) {
  process.exit(runMockApproverCli(process.argv.slice(2)));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runMockApproverCli
});
//# sourceMappingURL=mock-approver.cli.cjs.map