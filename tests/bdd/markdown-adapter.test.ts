// BDD coverage for MarkdownAdapter. push* round-trips via pull, and
// the legacy `markdown:<id>` form still resolves by tree scan.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { MarkdownAdapter, markdownAdapter } from "../../scripts/tdd/adapters/markdown";
import type { AdapterContext } from "../../scripts/tdd/adapters/types";
import type { Feature, Story, AC } from "../../scripts/tdd/spec-sync";

function mkTempTdd(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `markdown-adapter-${prefix}-`));
}

function rm(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

function seedFeature(tddDir: string, feature: Feature): void {
  const dir = path.join(tddDir, "features", `${feature.id}-canonical`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "feature.json"), JSON.stringify(feature, null, 2));
}

function seedStory(tddDir: string, featureId: string, story: Story): void {
  const featureDir = path.join(tddDir, "features", `${featureId}-canonical`);
  const storyDir = path.join(featureDir, "stories", `${story.id}-canonical`);
  fs.mkdirSync(storyDir, { recursive: true });
  fs.writeFileSync(path.join(storyDir, "story.json"), JSON.stringify(story, null, 2));
}

function seedAc(tddDir: string, featureId: string, storyId: string, ac: AC): void {
  const acsDir = path.join(
    tddDir,
    "features",
    `${featureId}-canonical`,
    "stories",
    `${storyId}-canonical`,
    "acs"
  );
  fs.mkdirSync(acsDir, { recursive: true });
  fs.writeFileSync(path.join(acsDir, `${ac.id}.json`), JSON.stringify(ac, null, 2));
}

function mkFeature(overrides: Partial<Feature>): Feature {
  return {
    id: overrides.id ?? "F1",
    name: overrides.name ?? "Checkout",
    status: overrides.status ?? "draft",
    tdd_mode: overrides.tdd_mode ?? "N=1",
    ...overrides,
  };
}

function mkStory(overrides: Partial<Story>): Story {
  return {
    id: overrides.id ?? "S1",
    asA: overrides.asA ?? "shopper",
    iWantTo: overrides.iWantTo ?? "place an order",
    soThat: overrides.soThat ?? "get the goods",
    feature_id: overrides.feature_id ?? "F1",
    ...overrides,
  };
}

function mkAc(overrides: Partial<AC>): AC {
  return {
    id: overrides.id ?? "AC1",
    layer: overrides.layer ?? "API",
    given: overrides.given ?? "valid cart",
    when: overrides.when ?? "POST /orders",
    then: overrides.then ?? "201 with order id",
    status: overrides.status ?? "draft",
    story_id: overrides.story_id ?? "S1",
    ...overrides,
  };
}

describe("MarkdownAdapter: push emits typed external_ids", () => {
  let adapter: MarkdownAdapter;
  let ctx: AdapterContext;
  let tddDir: string;
  beforeEach(() => {
    adapter = new MarkdownAdapter();
    tddDir = mkTempTdd("push");
    ctx = { tddDir };
  });
  afterEach(() => rm(tddDir));

  it("pushFeature emits markdown:feature:<id>", async () => {
    const result = await adapter.pushFeature(mkFeature({ id: "F1-checkout" }), ctx);
    expect(result.externalId).toBe("markdown:feature:F1-checkout");
  });

  it("pushStory emits markdown:story:<feature_id>:<id>", async () => {
    const result = await adapter.pushStory(
      mkStory({ id: "S1-place-order", feature_id: "F1-checkout" }),
      ctx
    );
    expect(result.externalId).toBe("markdown:story:F1-checkout:S1-place-order");
  });

  it("pushStory falls back to '_' when feature_id is missing", async () => {
    const result = await adapter.pushStory(
      mkStory({ id: "S1-orphan", feature_id: undefined }),
      ctx
    );
    expect(result.externalId).toBe("markdown:story:_:S1-orphan");
  });

  it("pushAC emits markdown:ac:_:<story_id>:<id> (feature scoped via story)", async () => {
    const result = await adapter.pushAC(
      mkAc({ id: "AC1-orders", story_id: "S1-place-order" }),
      ctx
    );
    expect(result.externalId).toBe("markdown:ac:_:S1-place-order:AC1-orders");
  });
});

describe("MarkdownAdapter: pull resolves typed external_ids from disk", () => {
  let adapter: MarkdownAdapter;
  let ctx: AdapterContext;
  let tddDir: string;
  beforeEach(() => {
    adapter = new MarkdownAdapter();
    tddDir = mkTempTdd("pull");
    ctx = { tddDir };
  });
  afterEach(() => rm(tddDir));

  it("pulls a Feature by its typed external_id", async () => {
    const feature = mkFeature({ id: "F1-checkout", name: "Cart checkout" });
    seedFeature(tddDir, feature);
    const result = await adapter.pull("markdown:feature:F1-checkout", ctx);
    expect((result as Feature).id).toBe("F1-checkout");
    expect((result as Feature).name).toBe("Cart checkout");
  });

  it("pulls a Story by its typed external_id", async () => {
    seedFeature(tddDir, mkFeature({ id: "F1" }));
    seedStory(tddDir, "F1", mkStory({ id: "S1", iWantTo: "checkout fast" }));
    const result = await adapter.pull("markdown:story:F1:S1", ctx);
    expect((result as Story).id).toBe("S1");
    expect((result as Story).iWantTo).toBe("checkout fast");
  });

  it("pulls an AC by its typed external_id (walks features when feature id is '_')", async () => {
    seedFeature(tddDir, mkFeature({ id: "F1" }));
    seedStory(tddDir, "F1", mkStory({ id: "S1" }));
    seedAc(tddDir, "F1", "S1", mkAc({ id: "AC1", then: "201 returned" }));
    const result = await adapter.pull("markdown:ac:_:S1:AC1", ctx);
    expect((result as AC).id).toBe("AC1");
    expect((result as AC).then).toBe("201 returned");
  });

  it("pull round-trips through push for a Feature", async () => {
    const feature = mkFeature({ id: "F1-roundtrip", name: "Round trip" });
    seedFeature(tddDir, feature);
    const { externalId } = await adapter.pushFeature(feature, ctx);
    const pulled = await adapter.pull(externalId, ctx);
    expect((pulled as Feature).id).toBe(feature.id);
    expect((pulled as Feature).name).toBe(feature.name);
  });

  it("pull round-trips through push for a Story", async () => {
    seedFeature(tddDir, mkFeature({ id: "F1" }));
    const story = mkStory({ id: "S1-roundtrip", feature_id: "F1" });
    seedStory(tddDir, "F1", story);
    const { externalId } = await adapter.pushStory(story, ctx);
    const pulled = await adapter.pull(externalId, ctx);
    expect((pulled as Story).id).toBe(story.id);
  });

  it("pull round-trips through push for an AC", async () => {
    seedFeature(tddDir, mkFeature({ id: "F1" }));
    seedStory(tddDir, "F1", mkStory({ id: "S1" }));
    const ac = mkAc({ id: "AC1-roundtrip", story_id: "S1" });
    seedAc(tddDir, "F1", "S1", ac);
    const { externalId } = await adapter.pushAC(ac, ctx);
    const pulled = await adapter.pull(externalId, ctx);
    expect((pulled as AC).id).toBe(ac.id);
  });
});

describe("MarkdownAdapter: legacy markdown:<id> form", () => {
  let adapter: MarkdownAdapter;
  let ctx: AdapterContext;
  let tddDir: string;
  beforeEach(() => {
    adapter = new MarkdownAdapter();
    tddDir = mkTempTdd("legacy");
    ctx = { tddDir };
  });
  afterEach(() => rm(tddDir));

  it("resolves a Feature from a legacy markdown:<feature-id> external_id", async () => {
    seedFeature(tddDir, mkFeature({ id: "F1-legacy", name: "Legacy" }));
    const pulled = await adapter.pull("markdown:F1-legacy", ctx);
    expect((pulled as Feature).id).toBe("F1-legacy");
  });

  it("resolves a Story from a legacy markdown:<story-id> external_id", async () => {
    seedFeature(tddDir, mkFeature({ id: "F1" }));
    seedStory(tddDir, "F1", mkStory({ id: "S1-legacy" }));
    const pulled = await adapter.pull("markdown:S1-legacy", ctx);
    expect((pulled as Story).id).toBe("S1-legacy");
  });

  it("resolves an AC from a legacy markdown:<ac-id> external_id", async () => {
    seedFeature(tddDir, mkFeature({ id: "F1" }));
    seedStory(tddDir, "F1", mkStory({ id: "S1" }));
    seedAc(tddDir, "F1", "S1", mkAc({ id: "AC1-legacy" }));
    const pulled = await adapter.pull("markdown:AC1-legacy", ctx);
    expect((pulled as AC).id).toBe("AC1-legacy");
  });

  it("throws when the legacy id matches no entity under the .tdd tree", async () => {
    seedFeature(tddDir, mkFeature({ id: "F1" }));
    await expect(adapter.pull("markdown:does-not-exist", ctx)).rejects.toThrow(
      /no entity with id "does-not-exist" found/
    );
  });
});

describe("MarkdownAdapter: error contract", () => {
  let adapter: MarkdownAdapter;
  let ctx: AdapterContext;
  let tddDir: string;
  beforeEach(() => {
    adapter = new MarkdownAdapter();
    tddDir = mkTempTdd("err");
    ctx = { tddDir };
  });
  afterEach(() => rm(tddDir));

  it("rejects non-markdown external_ids loudly", async () => {
    await expect(adapter.pull("jira:JIRA-123", ctx)).rejects.toThrow(
      /not a markdown external_id/i
    );
  });

  it("throws a clear message when the feature is missing", async () => {
    await expect(adapter.pull("markdown:feature:F-missing", ctx)).rejects.toThrow(
      /feature F-missing not found/
    );
  });

  it("throws a clear message when the story is missing under an existing feature", async () => {
    seedFeature(tddDir, mkFeature({ id: "F1" }));
    await expect(adapter.pull("markdown:story:F1:S-missing", ctx)).rejects.toThrow(
      /story S-missing not found/
    );
  });

  it("module-level markdownAdapter is the same shape", () => {
    expect(markdownAdapter.name).toBe("markdown");
    expect(typeof markdownAdapter.pull).toBe("function");
    expect(typeof markdownAdapter.pushFeature).toBe("function");
  });
});

describe("MarkdownAdapter: updateStatus is still a no-op", () => {
  it("returns undefined without throwing", async () => {
    const tddDir = mkTempTdd("status");
    try {
      const result = await new MarkdownAdapter().updateStatus(
        "markdown:feature:F1",
        "in-progress",
        { tddDir }
      );
      expect(result).toBeUndefined();
    } finally {
      rm(tddDir);
    }
  });
});
