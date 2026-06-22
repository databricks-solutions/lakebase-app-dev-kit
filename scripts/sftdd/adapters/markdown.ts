import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import type { SpecAdapter, AdapterContext, SpecEntity } from "./types";
import type { Feature, Story, AC } from "../spec-sync";
import { featuresDir as featuresDirOf } from "../sftdd-paths.js";

/**
 * Typed external_id encoding. push* methods emit these so pull can
 * resolve in O(1) lookup time without a tree scan. Format:
 *   markdown:feature:<F>
 *   markdown:story:<F>:<S>
 *   markdown:ac:<F>:<S>:<AC>
 *
 * pull also accepts the legacy `markdown:<id>` form (anything without
 * the second segment) by falling back to a directory walk. That keeps
 * external_refs that were stamped by older versions of this adapter
 * readable after the upgrade.
 */
type ParsedRef =
  | { kind: "feature"; featureId: string }
  | { kind: "story"; featureId: string; storyId: string }
  | { kind: "ac"; featureId: string; storyId: string; acId: string }
  | { kind: "legacy"; id: string };

function parseExternalId(externalId: string): ParsedRef {
  if (!externalId.startsWith("markdown:")) {
    throw new Error(`MarkdownAdapter.pull: not a markdown external_id: ${externalId}`);
  }
  const rest = externalId.slice("markdown:".length);
  const parts = rest.split(":");
  if (parts[0] === "feature" && parts.length === 2) {
    return { kind: "feature", featureId: parts[1] };
  }
  if (parts[0] === "story" && parts.length === 3) {
    return { kind: "story", featureId: parts[1], storyId: parts[2] };
  }
  if (parts[0] === "ac" && parts.length === 4) {
    return { kind: "ac", featureId: parts[1], storyId: parts[2], acId: parts[3] };
  }
  // Anything else is treated as a legacy markdown:<id> external_ref.
  return { kind: "legacy", id: rest };
}

function findFeatureDirById(tddDir: string, featureId: string): string {
  const featuresDir = featuresDirOf(tddDir);
  if (!existsSync(featuresDir)) {
    throw new Error(
      `MarkdownAdapter.pull: feature ${featureId} not found (no features directory at ${featuresDir})`
    );
  }
  for (const entry of readdirSync(featuresDir)) {
    const dir = join(featuresDir, entry);
    if (!statSync(dir).isDirectory()) continue;
    const jsonPath = join(dir, "feature-spec.json");
    if (!existsSync(jsonPath)) continue;
    const json = JSON.parse(readFileSync(jsonPath, "utf8")) as Feature;
    if (json.id === featureId) return dir;
  }
  throw new Error(`MarkdownAdapter.pull: feature ${featureId} not found under ${featuresDir}`);
}

function findStoryDirById(tddDir: string, featureId: string, storyId: string): string {
  const featureDir = findFeatureDirById(tddDir, featureId);
  const storiesDir = join(featureDir, "stories");
  if (!existsSync(storiesDir)) {
    throw new Error(
      `MarkdownAdapter.pull: story ${storyId} not found (no stories directory at ${storiesDir})`
    );
  }
  for (const entry of readdirSync(storiesDir)) {
    const dir = join(storiesDir, entry);
    if (!statSync(dir).isDirectory()) continue;
    const jsonPath = join(dir, "story.json");
    if (!existsSync(jsonPath)) continue;
    const json = JSON.parse(readFileSync(jsonPath, "utf8")) as Story;
    if (json.id === storyId) return dir;
  }
  throw new Error(
    `MarkdownAdapter.pull: story ${storyId} not found under feature ${featureId}`
  );
}

function findAcFile(tddDir: string, featureId: string, storyId: string, acId: string): string {
  const storyDir = findStoryDirById(tddDir, featureId, storyId);
  const acsDir = join(storyDir, "acs");
  const acFile = join(acsDir, `${acId}.json`);
  if (!existsSync(acFile)) {
    throw new Error(
      `MarkdownAdapter.pull: AC ${acId} not found under feature ${featureId} / story ${storyId}`
    );
  }
  return acFile;
}

function scanForLegacyId(tddDir: string, id: string): SpecEntity {
  const featuresDir = featuresDirOf(tddDir);
  if (!existsSync(featuresDir)) {
    throw new Error(`MarkdownAdapter.pull: no features directory at ${featuresDir}`);
  }
  for (const featureEntry of readdirSync(featuresDir)) {
    const featureDir = join(featuresDir, featureEntry);
    if (!statSync(featureDir).isDirectory()) continue;
    const featureJson = join(featureDir, "feature-spec.json");
    if (existsSync(featureJson)) {
      const feature = JSON.parse(readFileSync(featureJson, "utf8")) as Feature;
      if (feature.id === id) return feature;
    }
    const storiesDir = join(featureDir, "stories");
    if (!existsSync(storiesDir)) continue;
    for (const storyEntry of readdirSync(storiesDir)) {
      const storyDir = join(storiesDir, storyEntry);
      if (!statSync(storyDir).isDirectory()) continue;
      const storyJson = join(storyDir, "story.json");
      if (existsSync(storyJson)) {
        const story = JSON.parse(readFileSync(storyJson, "utf8")) as Story;
        if (story.id === id) return story;
      }
      const acsDir = join(storyDir, "acs");
      if (!existsSync(acsDir)) continue;
      for (const acEntry of readdirSync(acsDir)) {
        if (!acEntry.endsWith(".json")) continue;
        const ac = JSON.parse(readFileSync(join(acsDir, acEntry), "utf8")) as AC;
        if (ac.id === id) return ac;
      }
    }
  }
  throw new Error(`MarkdownAdapter.pull: no entity with id "${id}" found under ${featuresDir}`);
}

export class MarkdownAdapter implements SpecAdapter {
  readonly name = "markdown";

  async pushFeature(feature: Feature, _ctx: AdapterContext): Promise<{ externalId: string }> {
    return { externalId: `markdown:feature:${feature.id}` };
  }

  async pushStory(story: Story, _ctx: AdapterContext): Promise<{ externalId: string }> {
    const featureId = story.feature_id ?? "_";
    return { externalId: `markdown:story:${featureId}:${story.id}` };
  }

  async pushAC(ac: AC, _ctx: AdapterContext): Promise<{ externalId: string }> {
    const storyId = ac.story_id ?? "_";
    // AC.story_id alone doesn't give us the feature id; the caller's
    // AdapterContext config can supply it but the simplest contract is
    // to scope by story id and let pull walk up.
    return { externalId: `markdown:ac:_:${storyId}:${ac.id}` };
  }

  async updateStatus(_externalId: string, _status: string, _ctx: AdapterContext): Promise<void> {
    return;
  }

  /**
   * Read the on-disk entity referenced by `externalId`. Returns the
   * fully-parsed Feature / Story / AC JSON. Throws when the encoded
   * entity cannot be resolved (feature missing, story missing, AC
   * file missing, or - for the legacy `markdown:<id>` form - the id
   * does not match anything under `<tddDir>/features/`).
   */
  async pull(externalId: string, ctx: AdapterContext): Promise<SpecEntity> {
    const ref = parseExternalId(externalId);
    switch (ref.kind) {
      case "feature": {
        const dir = findFeatureDirById(ctx.tddDir, ref.featureId);
        return JSON.parse(readFileSync(join(dir, "feature-spec.json"), "utf8")) as Feature;
      }
      case "story": {
        const dir = findStoryDirById(ctx.tddDir, ref.featureId, ref.storyId);
        return JSON.parse(readFileSync(join(dir, "story.json"), "utf8")) as Story;
      }
      case "ac": {
        // The push form encodes feature id as "_" because the AC
        // record itself only carries story_id. Walk every feature
        // looking for the story when the encoded feature id is "_";
        // honor an explicit feature id when provided.
        if (ref.featureId === "_") {
          return scanForAcByStory(ctx.tddDir, ref.storyId, ref.acId);
        }
        const acFile = findAcFile(ctx.tddDir, ref.featureId, ref.storyId, ref.acId);
        return JSON.parse(readFileSync(acFile, "utf8")) as AC;
      }
      case "legacy":
        return scanForLegacyId(ctx.tddDir, ref.id);
    }
  }
}

function scanForAcByStory(tddDir: string, storyId: string, acId: string): AC {
  const featuresDir = featuresDirOf(tddDir);
  if (!existsSync(featuresDir)) {
    throw new Error(`MarkdownAdapter.pull: no features directory at ${featuresDir}`);
  }
  for (const featureEntry of readdirSync(featuresDir)) {
    const featureDir = join(featuresDir, featureEntry);
    if (!statSync(featureDir).isDirectory()) continue;
    const storiesDir = join(featureDir, "stories");
    if (!existsSync(storiesDir)) continue;
    for (const storyEntry of readdirSync(storiesDir)) {
      const storyDir = join(storiesDir, storyEntry);
      if (!statSync(storyDir).isDirectory()) continue;
      const storyJson = join(storyDir, "story.json");
      if (!existsSync(storyJson)) continue;
      const story = JSON.parse(readFileSync(storyJson, "utf8")) as Story;
      if (story.id !== storyId) continue;
      const acFile = join(storyDir, "acs", `${acId}.json`);
      if (!existsSync(acFile)) {
        throw new Error(
          `MarkdownAdapter.pull: AC ${acId} not found under story ${storyId}`
        );
      }
      return JSON.parse(readFileSync(acFile, "utf8")) as AC;
    }
  }
  throw new Error(`MarkdownAdapter.pull: story ${storyId} not found under any feature`);
}

export const markdownAdapter: SpecAdapter = new MarkdownAdapter();
