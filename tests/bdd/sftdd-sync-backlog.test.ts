// sync-backlog: the human-in-the-loop door that commits a sprint backlog from
// authored feature-request.md files, breaking the interactive planning deadlock
// (FEIP-8002). requested.json (writeRequested/readRequested) is the single sprint
// membership declaration; syncBacklog projects backlog.json from it; and
// deriveSprintPlanningState derives requestsAuthored from that backlog , so after
// a human authors requests + runs sync-backlog, requestsAuthored flips true and
// the driver can advance to the plan gate.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  featureRequestMd,
  sprintRequestedJson,
  readRequested,
  writeRequested,
  syncBacklog,
  backlogFeatureIds,
} from "../../scripts/sftdd/sftdd-paths.js";
import { deriveSprintPlanningState } from "../../scripts/sftdd/orchestrator-sprint.js";

const SPRINT = "s1";
let tdd: string;

/** Author a feature's PO request (the human's out-of-band artifact). */
function authorRequest(id: string): void {
  const f = featureRequestMd(tdd, id);
  mkdirSync(join(f, ".."), { recursive: true });
  writeFileSync(f, `# ${id}\n\nAs a user I want ${id}.\n`);
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "syncbacklog-"));
});
afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("requested.json membership (readRequested / writeRequested)", () => {
  it("absent => undefined (unscoped); present => the ids", () => {
    expect(readRequested(tdd, SPRINT)).toBeUndefined();
    writeRequested(tdd, SPRINT, ["F2", "F1"]);
    expect(readRequested(tdd, SPRINT)).toEqual(["F1", "F2"]); // dedup + sort
    expect(existsSync(sprintRequestedJson(tdd, SPRINT))).toBe(true);
  });

  it("MERGES with the existing set (a resume never shrinks membership)", () => {
    writeRequested(tdd, SPRINT, ["F1"]);
    const merged = writeRequested(tdd, SPRINT, ["F2", "F1"]);
    expect(merged).toEqual(["F1", "F2"]);
    expect(readRequested(tdd, SPRINT)).toEqual(["F1", "F2"]);
  });
});

describe("syncBacklog: projects backlog.json from requested.json + authored requests", () => {
  it("includes only REQUESTED features that have a feature-request.md", () => {
    authorRequest("F1");
    authorRequest("F2"); // authored but NOT requested for this sprint
    authorRequest("F3"); // requested but no request authored below? (it is authored) , keep as requested+authored
    writeRequested(tdd, SPRINT, ["F1", "F3", "F4"]); // F4 requested but never authored

    const backlog = syncBacklog(tdd, SPRINT);
    // F1, F3 = requested AND authored; F2 not requested; F4 requested but unauthored.
    expect(backlogFeatureIds(backlog).sort()).toEqual(["F1", "F3"]);
  });
});

describe("the deadlock break: requestsAuthored flips true after authoring + sync", () => {
  it("author feature-request.md + writeRequested + syncBacklog => requestsAuthored true", () => {
    authorRequest("F1");
    // Before: no backlog.json, so planning.requestsAuthored is false (the deadlock).
    expect(deriveSprintPlanningState(tdd, SPRINT, { skipSizing: true }).planning?.requestsAuthored).toBe(false);

    // The human-in-the-loop door: declare membership + commit the backlog.
    writeRequested(tdd, SPRINT, ["F1"]);
    syncBacklog(tdd, SPRINT);

    // After: backlog.json exists with F1 (which has a request) => requestsAuthored true,
    // so the driver's next planning action becomes the (interactive) plan gate.
    expect(deriveSprintPlanningState(tdd, SPRINT, { skipSizing: true }).planning?.requestsAuthored).toBe(true);
  });

  it("empty/unauthored membership keeps requestsAuthored false (nothing to commit)", () => {
    writeRequested(tdd, SPRINT, ["F1"]); // declared, but no feature-request.md authored
    syncBacklog(tdd, SPRINT);
    expect(deriveSprintPlanningState(tdd, SPRINT, { skipSizing: true }).planning?.requestsAuthored).toBe(false);
  });
});
