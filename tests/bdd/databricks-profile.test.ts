import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  normalizeHost,
  selectProfileForHost,
  ensureProfilePinned,
} from "../../scripts/lakebase/databricks-profile";

const HOST = "https://fevm-serverless-stable-ecparr.cloud.databricks.com";

function profilesJson(profiles: Array<Record<string, unknown>>): string {
  return JSON.stringify({ profiles });
}

describe("normalizeHost", () => {
  it("strips trailing slashes and lowercases", () => {
    expect(normalizeHost("https://EXAMPLE.cloud.databricks.com///")).toBe(
      "https://example.cloud.databricks.com",
    );
  });
  it("trims surrounding whitespace", () => {
    expect(normalizeHost("  https://example.cloud.databricks.com  ")).toBe(
      "https://example.cloud.databricks.com",
    );
  });
});

describe("selectProfileForHost: pure selector", () => {
  it("returns the unique valid profile whose host matches", () => {
    const json = profilesJson([
      { name: "DEFAULT", host: "https://adb-123.azuredatabricks.net", valid: true },
      { name: "ecparr", host: HOST, valid: true },
    ]);
    expect(selectProfileForHost(json, HOST)).toBe("ecparr");
  });

  it("ignores the DEFAULT profile when it points at a different host", () => {
    // This is the exact failure case: DEFAULT is valid but a different host.
    const json = profilesJson([
      { name: "DEFAULT", host: "https://adb-123.azuredatabricks.net", valid: true },
    ]);
    expect(selectProfileForHost(json, HOST)).toBeUndefined();
  });

  it("normalizes trailing slashes on both sides when matching", () => {
    const json = profilesJson([{ name: "ecparr", host: `${HOST}/`, valid: true }]);
    expect(selectProfileForHost(json, `${HOST}///`)).toBe("ecparr");
  });

  it("excludes invalid profiles even when the host matches", () => {
    const json = profilesJson([
      { name: "stale", host: HOST, valid: false },
      { name: "good", host: HOST, valid: true },
    ]);
    expect(selectProfileForHost(json, HOST)).toBe("good");
  });

  it("returns undefined when the only host match is invalid", () => {
    const json = profilesJson([{ name: "stale", host: HOST, valid: false }]);
    expect(selectProfileForHost(json, HOST)).toBeUndefined();
  });

  it("returns undefined when more than one distinct valid profile matches (ambiguous, never guess)", () => {
    const json = profilesJson([
      { name: "ecparr-a", host: HOST, valid: true },
      { name: "ecparr-b", host: HOST, valid: true },
    ]);
    expect(selectProfileForHost(json, HOST)).toBeUndefined();
  });

  it("collapses the same profile name listed twice into a unique match", () => {
    const json = profilesJson([
      { name: "ecparr", host: HOST, valid: true },
      { name: "ecparr", host: `${HOST}/`, valid: true },
    ]);
    expect(selectProfileForHost(json, HOST)).toBe("ecparr");
  });

  it("tolerates a non-JSON preamble before the payload", () => {
    const json =
      "Warn: [hostmetadata] failed to fetch host metadata, will skip\n" +
      profilesJson([{ name: "ecparr", host: HOST, valid: true }]);
    expect(selectProfileForHost(json, HOST)).toBe("ecparr");
  });

  it("returns undefined for malformed / empty input or empty host", () => {
    expect(selectProfileForHost("not json", HOST)).toBeUndefined();
    expect(selectProfileForHost("", HOST)).toBeUndefined();
    expect(selectProfileForHost(profilesJson([]), "")).toBeUndefined();
    expect(selectProfileForHost(JSON.stringify({ no: "profiles" }), HOST)).toBeUndefined();
  });
});

describe("ensureProfilePinned: .env heal", () => {
  let dir: string;
  let envPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "profile-pin-"));
    envPath = path.join(dir, ".env");
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const resolveTo = (name: string | undefined) => async () => name;

  it("injects DATABRICKS_CONFIG_PROFILE right after DATABRICKS_HOST", async () => {
    fs.writeFileSync(envPath, `DATABRICKS_HOST=${HOST}\nLAKEBASE_PROJECT_ID=demo\n`);
    const res = await ensureProfilePinned({ envPath, resolve: resolveTo("ecparr") });
    expect(res.pinned).toBe("ecparr");
    const out = fs.readFileSync(envPath, "utf-8");
    expect(out).toBe(
      `DATABRICKS_HOST=${HOST}\nDATABRICKS_CONFIG_PROFILE=ecparr\nLAKEBASE_PROJECT_ID=demo\n`,
    );
  });

  it("is idempotent: no-op when already pinned", async () => {
    const original = `DATABRICKS_HOST=${HOST}\nDATABRICKS_CONFIG_PROFILE=existing\n`;
    fs.writeFileSync(envPath, original);
    const res = await ensureProfilePinned({ envPath, resolve: resolveTo("ecparr") });
    expect(res.reason).toBe("already-pinned");
    expect(fs.readFileSync(envPath, "utf-8")).toBe(original);
  });

  it("no-op when no host line is present", async () => {
    fs.writeFileSync(envPath, "LAKEBASE_PROJECT_ID=demo\n");
    const res = await ensureProfilePinned({ envPath, resolve: resolveTo("ecparr") });
    expect(res.reason).toBe("no-host");
  });

  it("no-op when the resolver finds no unique match (leaves bare host)", async () => {
    const original = `DATABRICKS_HOST=${HOST}\n`;
    fs.writeFileSync(envPath, original);
    const res = await ensureProfilePinned({ envPath, resolve: resolveTo(undefined) });
    expect(res.reason).toBe("no-match");
    expect(fs.readFileSync(envPath, "utf-8")).toBe(original);
  });

  it("no-op when the .env file does not exist", async () => {
    const res = await ensureProfilePinned({ envPath, resolve: resolveTo("ecparr") });
    expect(res.reason).toBe("no-env");
  });
});
