// Runtime Lakebase credential minting for the app + knex migrations.
//
// No DB token is stored in .env. This module mints a short-lived Postgres
// credential ON DEMAND from the connection METADATA in the environment
// (LAKEBASE_PROJECT_ID, LAKEBASE_BRANCH_ID, LAKEBASE_ENDPOINT), caches it
// in-process, and re-mints before it expires. Mirrors the kit's
// get-connection.ts / mintCredential seam (the databricks CLI is the single
// credential source), so the pattern is identical across languages.

const { execFileSync } = require('node:child_process');

// Re-mint a token this many ms after it was minted. Lakebase database
// credentials live ~1h; 40 min keeps a comfortable margin so a pooled
// connection never presents an expired token.
const MINT_TTL_MS = 40 * 60 * 1000;
const DEFAULT_ENDPOINT = 'primary';

let cachedToken = null;
let mintedAt = 0;

// Build the Lakebase endpoint resource path from env METADATA, or null when the
// metadata needed to mint is absent (so a caller can fall back).
function endpointPathFromEnv() {
  const instance = process.env.LAKEBASE_PROJECT_ID;
  const branch = process.env.LAKEBASE_BRANCH_ID;
  if (!instance || !branch) return null;
  const endpoint = process.env.LAKEBASE_ENDPOINT || DEFAULT_ENDPOINT;
  return `projects/${instance}/branches/${branch}/endpoints/${endpoint}`;
}

function profileArgs() {
  const p = process.env.DATABRICKS_CONFIG_PROFILE;
  return p ? ['--profile', p] : [];
}

function runDatabricks(args) {
  return execFileSync('databricks', [...args, ...profileArgs()], { encoding: 'utf8' });
}

// Return a valid Lakebase DB token, minting a fresh one via the databricks CLI
// when the cache is empty or near expiry.
function mintToken() {
  const endpoint = endpointPathFromEnv();
  if (!endpoint) {
    throw new Error(
      'Cannot mint a Lakebase credential: LAKEBASE_PROJECT_ID / LAKEBASE_BRANCH_ID ' +
        'are not set. The post-checkout hook sets them; otherwise provide DATABASE_URL explicitly.'
    );
  }
  if (cachedToken && Date.now() - mintedAt < MINT_TTL_MS) return cachedToken;
  const raw = runDatabricks(['postgres', 'generate-database-credential', endpoint, '-o', 'json']);
  const token = (JSON.parse(raw) || {}).token;
  if (!token) throw new Error(`generate-database-credential returned no token for ${endpoint}`);
  cachedToken = token;
  mintedAt = Date.now();
  return token;
}

// The Lakebase user (email): prefer the DB_USERNAME metadata, else the CLI.
function currentUser() {
  const u = process.env.DB_USERNAME;
  if (u) return u;
  const raw = runDatabricks(['current-user', 'me', '-o', 'json']);
  const me = JSON.parse(raw) || {};
  return me.userName || (me.emails && me.emails[0] && me.emails[0].value) || '';
}

module.exports = { mintToken, endpointPathFromEnv, currentUser };
