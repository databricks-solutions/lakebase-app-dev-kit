// Proxy-aware env builder for Node-side spawn / execFile / fork.
//
// The user's local environment routes npm + curl through a corporate
// proxy via HTTP_PROXY / HTTPS_PROXY / NO_PROXY (and their lowercase
// twins). The kit's bash test scaffolds (run-live-tests.sh /
// run-all-live-tests.sh) inherit shell env naturally, so the proxy
// flows through. Node test fixtures that spawn subprocesses can break
// that chain by constructing a minimal env, dropping the proxy keys,
// and producing a "works locally but mysteriously hangs in CI" or
// "works in CI but hangs locally" bug.
//
// USE THIS when:
//   - A Node test fixture spawns npm/npx/curl/git/gh as a subprocess
//   - The fixture sets `env:` on the spawn options (i.e. doesn't pass
//     `process.env` through unchanged)
//
// Don't roll your own. The bash scaffolds (run-live-tests.sh +
// run-all-live-tests.sh) already inherit shell env without needing a
// helper; this one is for the Node-side case only.

/** Proxy-related env var names; lower + upper case variants both. */
export const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "npm_config_proxy",
  "npm_config_https_proxy",
  "npm_config_no_proxy",
  "npm_config_registry",
] as const;

/**
 * Return ONLY the proxy-related env vars from `process.env` (or the
 * provided source), filtered to those actually set. Empty / undefined
 * values are omitted so callers don't accidentally overwrite an
 * inherited value with an empty string.
 */
export function proxyEnvSubset(
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of PROXY_ENV_KEYS) {
    const v = source[key];
    if (v !== undefined && v !== "") {
      out[key] = v;
    }
  }
  return out;
}

/**
 * Compose an env object that always includes the user's proxy env on
 * top of whatever the caller passes. Use when constructing a child
 * process's env from scratch in a test fixture:
 *
 * ```ts
 * spawnSync("npm", ["install"], {
 *   env: withProxyEnv({ FOO: "bar" }),  // proxy keys auto-included
 *   stdio: "inherit",
 * });
 * ```
 *
 * If `base` is `process.env`, this is a no-op (the keys are already
 * present). If `base` is a minimal object, the proxy keys are merged
 * in from process.env so the child still sees them.
 *
 * Caller-provided values take precedence over the inherited proxy
 * keys, so a test can deliberately override (e.g. tunnel through a
 * mock proxy) by setting the same key in `base`.
 */
export function withProxyEnv(
  base: Record<string, string | undefined> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  const inherited = proxyEnvSubset();
  for (const [k, v] of Object.entries(inherited)) {
    out[k] = v;
  }
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
