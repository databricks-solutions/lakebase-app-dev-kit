import { readFileSync, existsSync, readdirSync, writeFileSync, statSync } from "fs";
import { join, basename } from "path";
import type Ajv from "ajv";
import { getValidator } from "./schema-loader";
import { requireFeatureDir as findFeatureDir, featuresDir as featuresDirOf } from "./tdd-paths.js";

type Phase =
  | "discovery"
  | "architectural-review"
  | "test-list-construction"
  | "design-spec-gate"
  | "implementation"
  | "synthesis"
  | "review"
  | "shipped"
  | "abandoned";

/**
 * Non-functional requirement. NFRs are owned by the Architect and live in
 * architecture.json (HIL-adjudicated at Gate 2), NOT on the spec-author-owned
 * feature-spec.json/story.json, putting them there drifted the spec gate (FEIP-7508).
 */
export interface Nfr {
  category: string;
  requirement: string;
  notes?: string;
}

export interface Feature {
  id: string;
  name: string;
  status: string;
  tdd_mode: "N=1" | "N>=2";
  success_metrics?: string[];
  stories?: string[];
  experiment_count_default?: number;
  owner?: string;
  external_ref?: { adapter: string; external_id: string };
}

export interface Story {
  id: string;
  asA: string;
  iWantTo: string;
  soThat: string;
  acs?: string[];
  feature_id?: string;
  external_ref?: Feature["external_ref"];
}

export interface AC {
  id: string;
  layer: "API" | "E2E" | "Infra";
  given: string;
  when: string;
  then: string;
  status: string;
  scenarios?: string[];
  nfrs?: Nfr[];
  architectural_notes?: string;
  story_id?: string;
  external_ref?: Feature["external_ref"];
}

export interface WorkflowState {
  phase: Phase;
  started_at: string;
  feature_id?: string | null;
  story_id?: string | null;
  ac_id?: string | null;
  cycle_id?: string | null;
  experiment_id?: string | null;
  last_transition_at?: string;
  last_transition_by?: string;
}

export interface DriftReport {
  file: string;
  kind: "schema" | "pair-missing" | "id-mismatch" | "narrative-empty";
  detail: string;
}

function makeValidator() {
  // Validators come from the shared schema-loader cache so spec-sync and
  // artifact-conformance validate against the identical compiled schemas.
  return {
    feature: getValidator("feature.schema.json"),
    story: getValidator("story.schema.json"),
    ac: getValidator("ac.schema.json"),
    testList: getValidator("test-list.schema.json"),
    workflowState: getValidator("workflow-state.schema.json"),
  };
}

export function readFeature(tddDir: string, featureId: string): Feature {
  const dir = findFeatureDir(tddDir, featureId);
  const jsonPath = join(dir, "feature-spec.json");
  return JSON.parse(readFileSync(jsonPath, "utf8"));
}

export function writeFeature(tddDir: string, feature: Feature): void {
  const dir = findFeatureDir(tddDir, feature.id);
  const jsonPath = join(dir, "feature-spec.json");
  writeFileSync(jsonPath, JSON.stringify(feature, null, 2) + "\n");
}

export function readWorkflowState(tddDir: string): WorkflowState | null {
  const file = join(tddDir, "workflow-state.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeWorkflowState(tddDir: string, state: WorkflowState): void {
  const file = join(tddDir, "workflow-state.json");
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}

export function validateSpec(tddDir: string): DriftReport[] {
  const reports: DriftReport[] = [];
  const v = makeValidator();

  // Workflow state
  const wsPath = join(tddDir, "workflow-state.json");
  if (existsSync(wsPath)) {
    const ws = JSON.parse(readFileSync(wsPath, "utf8"));
    if (!v.workflowState(ws)) {
      reports.push({ file: wsPath, kind: "schema", detail: JSON.stringify(v.workflowState.errors) });
    }
  }

  // Features
  const featuresDir = featuresDirOf(tddDir);
  if (!existsSync(featuresDir)) return reports;
  for (const featureDirName of readdirSync(featuresDir)) {
    const featureDir = join(featuresDir, featureDirName);
    if (!statSync(featureDir).isDirectory()) continue;
    checkPair(featureDir, "feature", v.feature, reports);

    const storiesDir = join(featureDir, "stories");
    if (!existsSync(storiesDir)) continue;
    for (const storyDirName of readdirSync(storiesDir)) {
      const storyDir = join(storiesDir, storyDirName);
      if (!statSync(storyDir).isDirectory()) continue;
      checkPair(storyDir, "story", v.story, reports);

      const acsDir = join(storyDir, "acs");
      if (existsSync(acsDir)) {
        for (const acFile of readdirSync(acsDir).filter((f) => f.endsWith(".json"))) {
          const acJsonPath = join(acsDir, acFile);
          const ac = JSON.parse(readFileSync(acJsonPath, "utf8"));
          if (!v.ac(ac)) {
            reports.push({ file: acJsonPath, kind: "schema", detail: JSON.stringify(v.ac.errors) });
          }
          const mdPath = acJsonPath.replace(/\.json$/, ".md");
          if (!existsSync(mdPath)) {
            reports.push({ file: mdPath, kind: "pair-missing", detail: "AC .md narrative missing" });
          }
        }
      }
    }

    const testListJson = join(featureDir, "test-list.json");
    if (existsSync(testListJson)) {
      const list = JSON.parse(readFileSync(testListJson, "utf8"));
      if (!v.testList(list)) {
        reports.push({ file: testListJson, kind: "schema", detail: JSON.stringify(v.testList.errors) });
      }
    }
  }
  return reports;
}

function checkPair(
  dir: string,
  kind: "feature" | "story",
  validator: ReturnType<Ajv["compile"]>,
  reports: DriftReport[]
): void {
  // The feature pair is feature-spec.json + feature-spec.md (Spec Author's
  // structured spec); story stays story.json + story.md.
  const stem = kind === "feature" ? "feature-spec" : kind;
  const jsonPath = join(dir, `${stem}.json`);
  const mdPath = join(dir, `${stem}.md`);
  if (!existsSync(jsonPath)) {
    reports.push({ file: jsonPath, kind: "pair-missing", detail: `${stem}.json missing` });
    return;
  }
  if (!existsSync(mdPath)) {
    reports.push({ file: mdPath, kind: "pair-missing", detail: `${stem}.md missing` });
  } else if (statSync(mdPath).size < 20) {
    reports.push({ file: mdPath, kind: "narrative-empty", detail: `${stem}.md narrative empty` });
  }
  const obj = JSON.parse(readFileSync(jsonPath, "utf8"));
  if (!validator(obj)) {
    reports.push({ file: jsonPath, kind: "schema", detail: JSON.stringify(validator.errors) });
  }
  if (obj.id && !basename(dir).startsWith(obj.id)) {
    reports.push({
      file: jsonPath,
      kind: "id-mismatch",
      detail: `dir name ${basename(dir)} does not start with id ${obj.id}`,
    });
  }
}
