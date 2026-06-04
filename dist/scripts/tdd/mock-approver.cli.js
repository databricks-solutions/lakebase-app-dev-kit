#!/usr/bin/env node

// scripts/util/cli-entry.ts
import { realpathSync } from "fs";
import { fileURLToPath } from "url";
function isCliEntry(importMetaUrl) {
  const invokedRaw = process.argv[1];
  if (!invokedRaw) return false;
  let invokedResolved;
  let moduleResolved;
  try {
    invokedResolved = realpathSync(invokedRaw);
  } catch {
    return false;
  }
  try {
    moduleResolved = realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
  return invokedResolved === moduleResolved;
}

// scripts/tdd/mock-approver.ts
import { existsSync as existsSync4, readFileSync as readFileSync4 } from "fs";
import { join as join4 } from "path";

// scripts/tdd/approve-gate.ts
import { existsSync as existsSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "fs";
import { join as join3 } from "path";

// scripts/tdd/gate-hash.ts
import { createHash } from "crypto";
function normalizeForHash(content) {
  let normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  normalized = normalized.split("\n").map((line) => line.replace(/[ \t]+$/, "")).join("\n");
  normalized = normalized.replace(/\n{3,}/g, "\n\n");
  return normalized;
}
function hashArtifact(content) {
  return createHash("sha256").update(normalizeForHash(content), "utf8").digest("hex");
}

// scripts/tdd/gates-lock.ts
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
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
      const fd = openSync(lockPath, "wx");
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
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
      unlinkSync(lockPath);
    } catch {
    }
  }
}
function isEexist(err) {
  return typeof err === "object" && err !== null && err.code === "EEXIST";
}
function readHeldByPid(lockPath) {
  try {
    const text = readFileSync(lockPath, "utf8");
    const n = Number(text.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
function gatesLockFilePath(tddDir, featureId) {
  const dir = findFeatureDir(tddDir, featureId);
  mkdirSync(dir, { recursive: true });
  return join(dir, ".gates.lock");
}
function findFeatureDir(tddDir, featureId) {
  const featuresDir = join(tddDir, "features");
  if (!existsSync(featuresDir)) {
    throw new Error(`${featuresDir} does not exist`);
  }
  const candidates = readdirSync(featuresDir).filter((d) => d.startsWith(featureId));
  if (candidates.length === 0) {
    throw new Error(`feature ${featureId} not found under ${featuresDir}`);
  }
  return join(featuresDir, candidates[0]);
}
function defaultSleep(ms) {
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

// scripts/tdd/gates.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, readdirSync as readdirSync2, renameSync, unlinkSync as unlinkSync2, writeFileSync as writeFileSync2 } from "fs";
import { join as join2 } from "path";
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
  if (!existsSync2(file)) {
    return defaultGatesState(featureId);
  }
  const raw = readFileSync2(file, "utf8");
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
  writeFileSync2(tempFile, payload, "utf8");
  try {
    renameSync(tempFile, file);
  } catch (err) {
    try {
      unlinkSync2(tempFile);
    } catch {
    }
    throw err;
  }
}
function gatesFilePath(tddDir, featureId) {
  return join2(findFeatureDir2(tddDir, featureId), "gates.json");
}
function findFeatureDir2(tddDir, featureId) {
  const featuresDir = join2(tddDir, "features");
  if (!existsSync2(featuresDir)) {
    throw new Error(`${featuresDir} does not exist`);
  }
  const candidates = readdirSync2(featuresDir).filter((d) => d.startsWith(featureId));
  if (candidates.length === 0) {
    throw new Error(`feature ${featureId} not found under ${featuresDir}`);
  }
  return join2(featuresDir, candidates[0]);
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
  const logPath = join3(tddDir, "selection-log.md");
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
  if (existsSync3(logPath)) {
    writeFileSync3(logPath, readFileSync3(logPath, "utf8") + text);
  } else {
    writeFileSync3(logPath, text);
  }
}

// scripts/tdd/mock-approver.ts
var MOCK_APPROVER = "ci-mock-approver";
var PLACEHOLDER = "MOCK_APPROVED";
function featureDir(tddDir, featureId) {
  return join4(tddDir, "features", featureId);
}
function loadArtifactInputs(gate, tddDir, featureId, promoteRef) {
  const fdir = featureDir(tddDir, featureId);
  const read = (p) => {
    try {
      if (existsSync4(p)) return readFileSync4(p, "utf8");
    } catch {
    }
    return PLACEHOLDER;
  };
  switch (gate) {
    case "spec":
      return {
        "spec.md": read(join4(fdir, "spec.md")),
        "feature.md": read(join4(fdir, "feature.md")),
        "feature.json": read(join4(fdir, "feature.json"))
      };
    case "plan":
      return {
        "plan.json": read(join4(fdir, "plan.json"))
      };
    case "test_list":
      return {
        "test-list.json": read(join4(fdir, "test-list.json")),
        "test-list.md": read(join4(fdir, "test-list.md"))
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
if (isCliEntry(import.meta.url)) {
  process.exit(runMockApproverCli(process.argv.slice(2)));
}
export {
  runMockApproverCli
};
//# sourceMappingURL=mock-approver.cli.js.map