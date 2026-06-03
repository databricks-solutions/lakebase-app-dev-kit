// Unit tests for the proxy-env helper.
//
// Pins the rule that integration tests preserve the user's local
// proxy env vars when constructing a subprocess env. The Node-side
// helper sits next to the bash scaffolds (run-live-tests.sh + run-
// all-live-tests.sh) which inherit shell env naturally.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  PROXY_ENV_KEYS,
  proxyEnvSubset,
  withProxyEnv,
} from "../../scripts/util/proxy-env";

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of PROXY_ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of PROXY_ENV_KEYS) {
    const v = savedEnv[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("proxyEnvSubset", () => {
  it("returns empty when no proxy env is set", () => {
    expect(proxyEnvSubset()).toEqual({});
  });

  it("collects upper + lower case proxy variants that are set", () => {
    process.env.HTTP_PROXY = "http://proxy.corp:3128";
    process.env.https_proxy = "http://proxy.corp:3128";
    process.env.NO_PROXY = "localhost,*.databricks.com";
    expect(proxyEnvSubset()).toEqual({
      HTTP_PROXY: "http://proxy.corp:3128",
      https_proxy: "http://proxy.corp:3128",
      NO_PROXY: "localhost,*.databricks.com",
    });
  });

  it("omits empty-string env values", () => {
    process.env.HTTP_PROXY = "";
    process.env.HTTPS_PROXY = "http://proxy.corp:3128";
    expect(proxyEnvSubset()).toEqual({
      HTTPS_PROXY: "http://proxy.corp:3128",
    });
  });

  it("collects npm_config_* variants too", () => {
    process.env.npm_config_proxy = "http://proxy.corp:3128";
    process.env.npm_config_registry = "https://corp.registry/npm/";
    expect(proxyEnvSubset()).toEqual({
      npm_config_proxy: "http://proxy.corp:3128",
      npm_config_registry: "https://corp.registry/npm/",
    });
  });
});

describe("withProxyEnv", () => {
  it("merges proxy env on top of a caller-supplied base", () => {
    process.env.HTTP_PROXY = "http://proxy.corp:3128";
    expect(withProxyEnv({ FOO: "bar" })).toEqual({
      FOO: "bar",
      HTTP_PROXY: "http://proxy.corp:3128",
    });
  });

  it("caller-supplied values take precedence over inherited proxy keys", () => {
    process.env.HTTP_PROXY = "http://proxy.corp:3128";
    expect(withProxyEnv({ HTTP_PROXY: "http://mock-proxy:9999" })).toEqual({
      HTTP_PROXY: "http://mock-proxy:9999",
    });
  });

  it("returns proxy env even when base is empty", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp:3128";
    expect(withProxyEnv()).toEqual({
      HTTPS_PROXY: "http://proxy.corp:3128",
    });
  });

  it("skips undefined base entries", () => {
    process.env.HTTP_PROXY = "http://proxy.corp:3128";
    expect(withProxyEnv({ FOO: undefined, BAR: "baz" })).toEqual({
      BAR: "baz",
      HTTP_PROXY: "http://proxy.corp:3128",
    });
  });
});
