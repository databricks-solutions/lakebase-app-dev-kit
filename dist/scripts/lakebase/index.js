// node_modules/tsup/assets/esm_shims.js
import path from "path";
import { fileURLToPath } from "url";
var getFilename = () => fileURLToPath(import.meta.url);
var getDirname = () => path.dirname(getFilename());
var __dirname = /* @__PURE__ */ getDirname();

// scripts/lakebase/adopt-lakebase-project.ts
import * as cp3 from "child_process";
import * as fs11 from "fs";
import * as path11 from "path";

// scripts/lakebase/lakebase-project.ts
import { execFile } from "child_process";
import { promisify } from "util";

// scripts/lakebase/branch-id.ts
var UID_PATTERN = /^br-[a-z0-9-]+$/;
function looksLikeBranchUid(s) {
  return UID_PATTERN.test(s);
}
function asBranchName(s) {
  if (!s) throw new TypeError("BranchName cannot be empty");
  if (looksLikeBranchUid(s)) {
    throw new TypeError(
      `'${s}' looks like a BranchUid (br-\u2026 pattern), not a BranchName. BranchName is the resource-path leaf (e.g. 'production', 'staging', 'feature-add-orders'); BranchUid is the system identifier returned by list-branches as the 'uid' field. The Lakebase API rejects a BranchUid in any path-shaped field. If you really mean a BranchUid, use asBranchUid() instead \u2013 but verify you're calling a function that takes one.`
    );
  }
  return s;
}
function asBranchUid(s) {
  if (!s) throw new TypeError("BranchUid cannot be empty");
  if (!looksLikeBranchUid(s)) {
    throw new TypeError(
      `'${s}' is not a BranchUid (must match the br-\u2026 pattern). If you have a BranchName (resource-path leaf like 'production'), use asBranchName() instead.`
    );
  }
  return s;
}
function branchNameFromResourcePath(path30) {
  if (!path30.includes("/branches/")) return null;
  const leaf = path30.split("/branches/").pop();
  if (!leaf) return null;
  try {
    return asBranchName(leaf);
  } catch {
    return null;
  }
}

// scripts/lakebase/kit-config.ts
function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}
var DAY_MS = 24 * 60 * 60 * 1e3;
var KIT_TIMEOUTS = {
  cliDefault: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_DEFAULT_MS", 3e4),
  cliCreateBranch: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_CREATE_BRANCH_MS", 6e4),
  cliCreateEndpoint: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_CREATE_ENDPOINT_MS", 6e4),
  readyWait: intFromEnv("LAKEBASE_KIT_TIMEOUT_READY_WAIT_MS", 12e4),
  readyPoll: intFromEnv("LAKEBASE_KIT_TIMEOUT_READY_POLL_MS", 5e3),
  pgConnect: intFromEnv("LAKEBASE_KIT_TIMEOUT_PG_CONNECT_MS", 1e4),
  pgStatement: intFromEnv("LAKEBASE_KIT_TIMEOUT_PG_STATEMENT_MS", 15e3),
  gitDefault: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_DEFAULT_MS", 5e3),
  gitCheckout: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_CHECKOUT_MS", 1e4),
  gitNetwork: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_NETWORK_MS", 15e3),
  gitPush: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_PUSH_MS", 3e4),
  cliLong: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_LONG_MS", 6e4),
  cmdShort: intFromEnv("LAKEBASE_KIT_TIMEOUT_CMD_SHORT_MS", 5e3),
  initializrCacheTtl: intFromEnv("LAKEBASE_KIT_INITIALIZR_CACHE_TTL_MS", 10 * 60 * 1e3),
  featureBranchTtlMs: intFromEnv("LAKEBASE_KIT_FEATURE_BRANCH_TTL_MS", 30 * DAY_MS),
  testBranchTtlMs: intFromEnv("LAKEBASE_KIT_TEST_BRANCH_TTL_MS", 14 * DAY_MS),
  uatBranchTtlMs: intFromEnv("LAKEBASE_KIT_UAT_BRANCH_TTL_MS", 14 * DAY_MS),
  perfBranchTtlMs: intFromEnv("LAKEBASE_KIT_PERF_BRANCH_TTL_MS", 7 * DAY_MS)
};
function formatLakebaseTtl(ms) {
  return `${Math.floor(ms / 1e3)}s`;
}
function urlFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.replace(/\/+$/, "");
}
var KIT_REGISTRIES = {
  mavenCentral: urlFromEnv("LAKEBASE_KIT_REGISTRY_MAVEN_CENTRAL", "https://repo1.maven.org/maven2"),
  springInitializr: urlFromEnv("LAKEBASE_KIT_REGISTRY_SPRING_INITIALIZR", "https://start.spring.io")
};

// scripts/lakebase/lakebase-project.ts
var execFileP = promisify(execFile);
var LakebaseProjectError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LakebaseProjectError";
  }
};
async function createLakebaseProject(args) {
  const raw = await dbcli(["postgres", "create-project", args.projectId, "-o", "json"], args.host);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LakebaseProjectError(`Unexpected CLI output (not JSON): ${raw.slice(0, 200)}`);
  }
  const result = parsed.response ?? parsed.result ?? parsed;
  const status = result.status ?? void 0;
  return {
    uid: result.uid ?? args.projectId,
    name: result.name ?? `projects/${args.projectId}`,
    state: status?.current_state ?? result.state ?? "READY"
  };
}
async function deleteLakebaseProject(args) {
  const name = args.projectId.startsWith("projects/") ? args.projectId : `projects/${args.projectId}`;
  await dbcli(["postgres", "delete-project", name, "-o", "json"], args.host);
}
function findDefaultBranchName(items) {
  const def = items.find((b) => b.status?.default === true || b.is_default === true);
  if (!def || !def.name) return null;
  return branchNameFromResourcePath(def.name);
}
async function getDefaultBranchName(args) {
  try {
    const raw = await dbcli(
      ["postgres", "list-branches", `projects/${args.projectId}`, "-o", "json"],
      args.host
    );
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
    return findDefaultBranchName(items);
  } catch {
    return null;
  }
}
async function getDefaultBranchId(args) {
  const name = await getDefaultBranchName(args);
  return name ?? "";
}
async function getProjectInfo(args) {
  const name = args.projectId.startsWith("projects/") ? args.projectId : `projects/${args.projectId}`;
  let raw;
  try {
    raw = await dbcli(["postgres", "get-project", name, "-o", "json"], args.host);
  } catch {
    return void 0;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  const status = parsed.status ?? void 0;
  return {
    uid: parsed.uid ?? args.projectId,
    name: parsed.name ?? name,
    displayName: parsed.display_name ?? parsed.displayName ?? void 0,
    state: status?.current_state ?? parsed.state ?? void 0
  };
}
function findHistoryRetentionDuration(parsed) {
  const raw = parsed.history_retention_duration ?? parsed.historyRetentionDuration;
  if (!raw || typeof raw !== "string") return void 0;
  const m = raw.trim().match(/^(\d+)s?$/);
  if (!m) return void 0;
  const seconds = Number.parseInt(m[1], 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return void 0;
  return `${seconds}s`;
}
async function getProjectRetentionDuration(args) {
  const name = args.projectId.startsWith("projects/") ? args.projectId : `projects/${args.projectId}`;
  let raw;
  try {
    raw = await dbcli(["postgres", "get-project", name, "-o", "json"], args.host);
  } catch {
    return void 0;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  return findHistoryRetentionDuration(parsed);
}
async function dbcli(args, host) {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...process.env, DATABRICKS_HOST: trimmedHost } : process.env;
  try {
    const { stdout } = await execFileP("databricks", args, {
      env,
      timeout: KIT_TIMEOUTS.cliDefault
    });
    return stdout.toString();
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new LakebaseProjectError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/lakebase/scaffold.ts
import * as cp from "child_process";
import * as fs6 from "fs";
import * as path6 from "path";
import { fileURLToPath as fileURLToPath4 } from "url";

// scripts/lakebase/scaffold-language.ts
import * as fs5 from "fs";
import * as path5 from "path";
import { fileURLToPath as fileURLToPath3 } from "url";

// scripts/util/copy-dir-substituted.ts
import * as fs from "fs";
import * as path2 from "path";
var SKIP_ENTRIES = /* @__PURE__ */ new Set([".gitignore.extra", "fallback"]);
function copyDirSubstituted(srcDir, destDir, args = {}) {
  const skip = args.skipEntries ?? SKIP_ENTRIES;
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    if (skip.has(file)) continue;
    const srcPath = path2.join(srcDir, file);
    const destPath = path2.join(destDir, file);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirSubstituted(srcPath, destPath, { projectName: args.projectName, skipEntries: /* @__PURE__ */ new Set() });
    } else {
      let content = fs.readFileSync(srcPath, "utf-8");
      if (args.projectName) {
        content = content.replace(/\{\{PROJECT_NAME\}\}/g, args.projectName);
      }
      fs.writeFileSync(destPath, content);
    }
  }
}

// scripts/lakebase/spring-initializr.ts
import * as fs4 from "fs";
import * as path4 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// scripts/util/maven-coords.ts
function sanitizeArtifactId(name) {
  let id = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!id) {
    id = "demo";
  }
  if (/^[0-9]/.test(id)) {
    id = `app-${id}`;
  }
  return id;
}

// scripts/util/zip-extract.ts
import * as fs2 from "fs";
import * as path3 from "path";
import AdmZip from "adm-zip";
function extractZipToDir(zipBuffer, targetDir) {
  fs2.mkdirSync(targetDir, { recursive: true });
  const zip = new AdmZip(zipBuffer);
  const tempDir = path3.join(targetDir, `.initializr-extract-${Date.now()}`);
  zip.extractAllTo(tempDir, true);
  const entries = fs2.readdirSync(tempDir).filter((e) => e !== "__MACOSX");
  const sourceDir = entries.length === 1 && fs2.statSync(path3.join(tempDir, entries[0])).isDirectory() ? path3.join(tempDir, entries[0]) : tempDir;
  copyDirRecursive(sourceDir, targetDir);
  fs2.rmSync(tempDir, { recursive: true, force: true });
}
function copyDirRecursive(src, dest) {
  fs2.mkdirSync(dest, { recursive: true });
  for (const entry of fs2.readdirSync(src)) {
    const srcPath = path3.join(src, entry);
    const destPath = path3.join(dest, entry);
    if (fs2.statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs2.copyFileSync(srcPath, destPath);
    }
  }
}

// scripts/util/pom-patch.ts
import * as fs3 from "fs";
var FLYWAY_PG_DEPENDENCY = `
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-database-postgresql</artifactId>
        </dependency>`;
var LAKEBASE_PLUGINS = `
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <configuration>
                    <argLine>--enable-native-access=ALL-UNNAMED -XX:+EnableDynamicAgentLoading</argLine>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.flywaydb</groupId>
                <artifactId>flyway-maven-plugin</artifactId>
                <configuration>
                    <url>\${env.SPRING_DATASOURCE_URL}</url>
                    <user>\${env.SPRING_DATASOURCE_USERNAME}</user>
                    <password>\${env.SPRING_DATASOURCE_PASSWORD}</password>
                    <baselineOnMigrate>true</baselineOnMigrate>
                </configuration>
            </plugin>`;
function patchPomForLakebase(pomPath) {
  if (!fs3.existsSync(pomPath)) {
    throw new Error(`pom.xml not found at ${pomPath}`);
  }
  let pom = fs3.readFileSync(pomPath, "utf-8");
  if (!pom.includes("flyway-database-postgresql")) {
    pom = pom.replace("</dependencies>", `${FLYWAY_PG_DEPENDENCY}
    </dependencies>`);
  }
  if (!pom.includes("flyway-maven-plugin")) {
    if (pom.includes("<artifactId>spring-boot-maven-plugin</artifactId>")) {
      pom = pom.replace(
        /(<plugin>\s*<groupId>org\.springframework\.boot<\/groupId>\s*<artifactId>spring-boot-maven-plugin<\/artifactId>\s*<\/plugin>)/,
        `$1${LAKEBASE_PLUGINS}`
      );
    } else if (pom.includes("</plugins>")) {
      pom = pom.replace("</plugins>", `${LAKEBASE_PLUGINS}
        </plugins>`);
    }
  } else if (!pom.includes("maven-surefire-plugin")) {
    pom = pom.replace(
      "</plugins>",
      `
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <configuration>
                    <argLine>--enable-native-access=ALL-UNNAMED -XX:+EnableDynamicAgentLoading</argLine>
                </configuration>
            </plugin>
        </plugins>`
    );
  }
  fs3.writeFileSync(pomPath, pom);
}

// scripts/lakebase/spring-initializr.ts
var InitializrNetworkError = class extends Error {
  cause;
  constructor(message, cause) {
    super(message);
    this.name = "InitializrNetworkError";
    this.cause = cause;
  }
};
var InitializrParseError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "InitializrParseError";
  }
};
var METADATA_ACCEPT = "application/vnd.initializr.v2.3+json";
var CACHE_TTL_MS = KIT_TIMEOUTS.initializrCacheTtl;
var DEFAULT_BASE_URL = KIT_REGISTRIES.springInitializr;
var DEPENDENCIES = "web,data-jpa,postgresql,flyway";
function isPrereleaseBootVersion(version) {
  const upper = version.toUpperCase();
  return upper.includes("SNAPSHOT") || /-(RC|M)\d/i.test(version) || /-(ALPHA|BETA)\d/i.test(version);
}
function resolveLatestBootVersion(section) {
  if (!section || typeof section !== "object") {
    throw new InitializrParseError("Missing bootVersion in Spring Initializr metadata");
  }
  const bootSection = section;
  const values = bootSection.values || [];
  for (const entry of values) {
    if (typeof entry.id === "string" && entry.id && !isPrereleaseBootVersion(entry.id)) {
      return entry.id;
    }
  }
  if (typeof bootSection.default === "string" && bootSection.default) {
    return bootSection.default;
  }
  throw new InitializrParseError("No Spring Boot version found in Initializr metadata");
}
function isLtsJavaVersion(version) {
  const n = Number.parseInt(version, 10);
  if (Number.isNaN(n)) return false;
  if (n === 8 || n === 11) return true;
  return n >= 17 && (n - 17) % 4 === 0;
}
function resolveLatestLtsJavaVersion(section) {
  if (!section || typeof section !== "object") {
    throw new InitializrParseError("Missing javaVersion in Spring Initializr metadata");
  }
  const javaSection = section;
  const available = /* @__PURE__ */ new Set();
  if (typeof javaSection.default === "string" && javaSection.default) {
    available.add(javaSection.default);
  }
  for (const entry of javaSection.values || []) {
    if (typeof entry.id === "string" && entry.id) {
      available.add(entry.id);
    }
  }
  let latest = -1;
  let latestId = "";
  for (const id of available) {
    if (!isLtsJavaVersion(id)) continue;
    const n = Number.parseInt(id, 10);
    if (n > latest) {
      latest = n;
      latestId = id;
    }
  }
  if (latestId) return latestId;
  if (typeof javaSection.default === "string" && javaSection.default) {
    return javaSection.default;
  }
  throw new InitializrParseError("No Java version found in Initializr metadata");
}
var SpringInitializrClient = class {
  metadataCache;
  baseUrl;
  fetchFn;
  constructor(baseUrl = DEFAULT_BASE_URL, fetchFn = globalThis.fetch.bind(globalThis)) {
    this.baseUrl = baseUrl;
    this.fetchFn = fetchFn;
  }
  async getMetadata(forceRefresh = false) {
    if (!forceRefresh && this.metadataCache && Date.now() - this.metadataCache.fetchedAt < CACHE_TTL_MS) {
      return this.metadataCache.metadata;
    }
    const url = this.baseUrl.replace(/\/$/, "") + "/";
    let response;
    try {
      response = await this.fetchFn(url, { headers: { Accept: METADATA_ACCEPT } });
    } catch (err) {
      throw new InitializrNetworkError(`Failed to reach Spring Initializr at ${this.baseUrl}`, err);
    }
    if (!response.ok) {
      throw new InitializrNetworkError(`Spring Initializr metadata request failed (${response.status})`);
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw new InitializrParseError("Spring Initializr metadata response was not valid JSON");
    }
    const metadata = parseMetadata(body);
    this.metadataCache = { metadata, fetchedAt: Date.now() };
    return metadata;
  }
  async generateMavenProject(opts) {
    const metadata = await this.getMetadata(true);
    const artifactId = sanitizeArtifactId(opts.artifactId);
    const params = new URLSearchParams({
      type: "maven-project",
      language: opts.language,
      bootVersion: metadata.bootVersion,
      javaVersion: metadata.javaVersion,
      packaging: "jar",
      dependencies: DEPENDENCIES,
      groupId: opts.groupId || "com.example",
      artifactId,
      name: opts.name || artifactId,
      packageName: opts.packageName || "com.example.demo",
      description: opts.description || "Spring Boot + JPA + PostgreSQL with Flyway; database branches via Lakebase.",
      version: "1.0.0-SNAPSHOT"
    });
    const url = `${this.baseUrl.replace(/\/$/, "")}/starter.zip?${params.toString()}`;
    let response;
    try {
      response = await this.fetchFn(url);
    } catch (err) {
      throw new InitializrNetworkError("Failed to download project from Spring Initializr", err);
    }
    if (!response.ok) {
      throw new InitializrNetworkError(`Spring Initializr project generation failed (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
};
function parseMetadata(body) {
  if (!body || typeof body !== "object") {
    throw new InitializrParseError("Spring Initializr metadata response was empty");
  }
  const doc = body;
  return {
    bootVersion: resolveLatestBootVersion(doc.bootVersion),
    javaVersion: resolveLatestLtsJavaVersion(doc.javaVersion)
  };
}
var cachedTemplatesDir;
function findTemplatesDir() {
  if (cachedTemplatesDir) return cachedTemplatesDir;
  const here = path4.dirname(fileURLToPath2(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path4.join(dir, "templates", "project");
    if (fs4.existsSync(path4.join(candidate, "common", ".gitignore.base"))) {
      cachedTemplatesDir = candidate;
      return cachedTemplatesDir;
    }
    const parent = path4.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate templates/project tree");
}
async function deploySpringStarter(args) {
  const language = args.language;
  const label = language === "kotlin" ? "Kotlin" : "Java";
  const report = args.report ?? (() => {
  });
  const templatesDir = args.templatesDir ?? findTemplatesDir();
  const useFallback = process.env.LAKEBASE_SCAFFOLD_FALLBACK === "1";
  if (useFallback) {
    report(`Using bundled ${label} template (LAKEBASE_SCAFFOLD_FALLBACK).`);
    deploySpringFallback(args.targetDir, language, args.projectName, templatesDir);
    deploySpringOverlays(args.targetDir, templatesDir);
    return;
  }
  report(`Fetching Spring Boot project from start.spring.io (${label}).`);
  let initializrExtracted = false;
  try {
    const client = args.initializrClient ?? new SpringInitializrClient();
    const metadata = await client.getMetadata();
    report(
      `Scaffolding Spring Boot ${metadata.bootVersion} (JVM ${metadata.javaVersion}, ${label}).`,
      `bootVersion=${metadata.bootVersion}`
    );
    const zip = await client.generateMavenProject({
      language,
      artifactId: args.projectName || "demo",
      name: args.projectName
    });
    extractZipToDir(zip, args.targetDir);
    initializrExtracted = true;
    const pomPath = path4.join(args.targetDir, "pom.xml");
    if (!fs4.existsSync(pomPath)) {
      throw new Error("Spring Initializr did not produce a Maven project (missing pom.xml)");
    }
    const mvnw = path4.join(args.targetDir, "mvnw");
    if (fs4.existsSync(mvnw)) fs4.chmodSync(mvnw, 493);
    deploySpringOverlays(args.targetDir, templatesDir);
    patchPomForLakebase(pomPath);
  } catch (err) {
    if (initializrExtracted) {
      throw new Error(
        `Spring Initializr project was extracted but post-processing failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    const reason = err instanceof InitializrNetworkError ? err.message : String(err);
    report(`Spring Initializr unavailable; using bundled ${label} template.`, reason);
    clearScaffoldArtifacts(args.targetDir);
    deploySpringFallback(args.targetDir, language, args.projectName, templatesDir);
    deploySpringOverlays(args.targetDir, templatesDir);
  }
}
function deploySpringFallback(targetDir, language, projectName, templatesDir) {
  const fallbackDir = path4.join(templatesDir, language, "fallback");
  if (!fs4.existsSync(fallbackDir)) {
    throw new Error(`No fallback template found for language: ${language}`);
  }
  copyDirSubstituted(fallbackDir, targetDir, { projectName });
  const mvnw = path4.join(targetDir, "mvnw");
  if (fs4.existsSync(mvnw)) fs4.chmodSync(mvnw, 493);
}
function deploySpringOverlays(targetDir, templatesDir) {
  const overlayDir = path4.join(templatesDir, "spring");
  if (!fs4.existsSync(overlayDir)) {
    throw new Error(`Spring overlay template not found at ${overlayDir}`);
  }
  copyDirSubstituted(overlayDir, targetDir);
}
function clearScaffoldArtifacts(targetDir) {
  if (!fs4.existsSync(targetDir)) return;
  for (const entry of fs4.readdirSync(targetDir)) {
    if (entry === ".git") continue;
    fs4.rmSync(path4.join(targetDir, entry), { recursive: true, force: true });
  }
}

// scripts/lakebase/scaffold-language.ts
var cachedTemplatesDir2;
function findTemplatesDir2() {
  if (cachedTemplatesDir2) return cachedTemplatesDir2;
  const here = path5.dirname(fileURLToPath3(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path5.join(dir, "templates", "project");
    if (fs5.existsSync(path5.join(candidate, "common", ".gitignore.base"))) {
      cachedTemplatesDir2 = candidate;
      return cachedTemplatesDir2;
    }
    const parent = path5.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate templates/project tree");
}
async function deployLanguageProject(args) {
  if (args.language === "java" || args.language === "kotlin") {
    await deploySpringStarter({
      targetDir: args.targetDir,
      language: args.language,
      projectName: args.projectName,
      templatesDir: args.templatesDir,
      initializrClient: args.initializrClient,
      report: args.report
    });
    return;
  }
  const templatesDir = args.templatesDir ?? findTemplatesDir2();
  const langSrc = path5.join(templatesDir, args.language);
  if (!fs5.existsSync(langSrc)) {
    throw new Error(`No template found for language: ${args.language}`);
  }
  copyDirSubstituted(langSrc, args.targetDir, { projectName: args.projectName });
}

// scripts/lakebase/scaffold.ts
var cachedTemplatesDir3;
function findTemplatesDir3() {
  if (cachedTemplatesDir3) return cachedTemplatesDir3;
  const here = path6.dirname(fileURLToPath4(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path6.join(dir, "templates", "project");
    if (fs6.existsSync(path6.join(candidate, "common", ".gitignore.base"))) {
      cachedTemplatesDir3 = candidate;
      return cachedTemplatesDir3;
    }
    const parent = path6.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project tree relative to ${here}. Pass explicit { templatesDir } to override.`
  );
}
function templatesRoot(opts) {
  return opts?.templatesDir ?? findTemplatesDir3();
}
function commonDir(opts) {
  return path6.join(templatesRoot(opts), "common");
}
function langDir(language, opts) {
  return path6.join(templatesRoot(opts), language);
}
function copyDir(srcDir, destDir, makeExecutable, relPrefix = "") {
  if (!fs6.existsSync(srcDir)) {
    throw new Error(`Source directory not found: ${srcDir}`);
  }
  fs6.mkdirSync(destDir, { recursive: true });
  const out = [];
  for (const entry of fs6.readdirSync(srcDir)) {
    const srcPath = path6.join(srcDir, entry);
    const destPath = path6.join(destDir, entry);
    const relPath = relPrefix ? path6.join(relPrefix, entry) : entry;
    if (fs6.statSync(srcPath).isDirectory()) {
      out.push(...copyDir(srcPath, destPath, makeExecutable, relPath));
    } else {
      fs6.copyFileSync(srcPath, destPath);
      if (makeExecutable) {
        fs6.chmodSync(destPath, 493);
      }
      out.push(relPath);
    }
  }
  return out;
}
async function deployScripts(targetDir, opts) {
  return copyDir(path6.join(commonDir(opts), "scripts"), path6.join(targetDir, "scripts"), true);
}
async function deployClaudeCommands(targetDir, opts) {
  const src = path6.join(commonDir(opts), ".claude", "commands");
  if (!fs6.existsSync(src)) {
    return { written: [], skipped: [] };
  }
  const destDir = path6.join(targetDir, ".claude", "commands");
  fs6.mkdirSync(destDir, { recursive: true });
  const version = kitVersion(opts);
  const written = [];
  const skipped = [];
  for (const entry of fs6.readdirSync(src)) {
    if (!entry.endsWith(".md")) continue;
    const relDest = path6.join(".claude", "commands", entry);
    const destPath = path6.join(targetDir, relDest);
    if (fs6.existsSync(destPath) && !opts?.force) {
      skipped.push(relDest);
      continue;
    }
    const before = fs6.readFileSync(path6.join(src, entry), "utf-8");
    const after = before.replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
    fs6.writeFileSync(destPath, after);
    written.push(relDest);
  }
  return { written, skipped };
}
async function deployClaudeAgents(targetDir, opts) {
  const kitRoot = path6.dirname(path6.dirname(templatesRoot(opts)));
  const src = path6.join(kitRoot, "skills", "lakebase-tdd-workflows", "agents");
  if (!fs6.existsSync(src)) {
    return { written: [], skipped: [] };
  }
  const destDir = path6.join(targetDir, ".claude", "agents");
  fs6.mkdirSync(destDir, { recursive: true });
  const written = [];
  const skipped = [];
  for (const entry of fs6.readdirSync(src)) {
    if (!entry.endsWith(".md")) continue;
    const relDest = path6.join(".claude", "agents", entry);
    const destPath = path6.join(targetDir, relDest);
    if (fs6.existsSync(destPath) && !opts?.force) {
      skipped.push(relDest);
      continue;
    }
    fs6.copyFileSync(path6.join(src, entry), destPath);
    written.push(relDest);
  }
  return { written, skipped };
}
async function deployWorkflows(targetDir, opts) {
  const written = copyDir(
    path6.join(commonDir(opts), ".github", "workflows"),
    path6.join(targetDir, ".github", "workflows"),
    false
  );
  substituteWorkflowPlaceholders(
    path6.join(targetDir, ".github", "workflows"),
    opts
  );
  return written;
}
function kitVersion(opts) {
  try {
    const kitRoot = path6.dirname(path6.dirname(templatesRoot(opts)));
    const raw = fs6.readFileSync(path6.join(kitRoot, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
function substituteWorkflowPlaceholders(workflowDir, opts) {
  if (!fs6.existsSync(workflowDir)) return;
  const version = kitVersion(opts);
  for (const entry of fs6.readdirSync(workflowDir)) {
    if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue;
    const filePath = path6.join(workflowDir, entry);
    const before = fs6.readFileSync(filePath, "utf-8");
    const after = before.replace(/\{\{LAKEBASE_KIT_VERSION\}\}/g, version);
    if (after !== before) fs6.writeFileSync(filePath, after);
  }
}
async function installHooks(targetDir) {
  const scriptsDir = path6.join(targetDir, "scripts");
  const gitHooksDir = path6.join(targetDir, ".git", "hooks");
  if (!fs6.existsSync(path6.join(targetDir, ".git"))) {
    throw new Error(`Not a git repo root: ${targetDir}`);
  }
  fs6.mkdirSync(gitHooksDir, { recursive: true });
  cp.execSync("git config --local core.hooksPath .git/hooks", {
    cwd: targetDir,
    stdio: "pipe"
  });
  const hookPairs = [
    ["post-checkout.sh", "post-checkout"],
    ["prepare-commit-msg.sh", "prepare-commit-msg"],
    ["pre-push.sh", "pre-push"],
    ["post-merge.sh", "post-merge"]
  ];
  const installed = [];
  for (const [srcName, hookName] of hookPairs) {
    const src = path6.join(scriptsDir, srcName);
    if (!fs6.existsSync(src)) continue;
    const dest = path6.join(gitHooksDir, hookName);
    fs6.copyFileSync(src, dest);
    fs6.chmodSync(dest, 493);
    installed.push(hookName);
  }
  return `Installed hooks: ${installed.join(", ") || "none"}`;
}
function renderEnvFromTemplate(args) {
  const src = path6.join(commonDir(args), ".env.example");
  let content = fs6.readFileSync(src, "utf-8");
  if (args.databricksHost) {
    content = content.replace(/DATABRICKS_HOST=.*/, `DATABRICKS_HOST=${args.databricksHost}`);
  }
  if (args.lakebaseProjectId) {
    content = content.replace(/LAKEBASE_PROJECT_ID=.*/, `LAKEBASE_PROJECT_ID=${args.lakebaseProjectId}`);
  }
  return content;
}
async function deployEnvExample(targetDir, args = {}) {
  fs6.writeFileSync(path6.join(targetDir, ".env.example"), renderEnvFromTemplate(args));
}
async function deployEnv(targetDir, args = {}) {
  fs6.writeFileSync(path6.join(targetDir, ".env"), renderEnvFromTemplate(args));
}
async function deployDeployTargets(targetDir, projectName, opts) {
  const src = path6.join(commonDir(opts), "deploy-targets.yaml");
  const dest = path6.join(targetDir, "deploy-targets.yaml");
  if (!fs6.existsSync(src)) return;
  let content = fs6.readFileSync(src, "utf-8");
  if (projectName) {
    content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
  }
  fs6.writeFileSync(dest, content);
}
async function deployVscodeSettings(targetDir, opts) {
  const src = path6.join(commonDir(opts), ".vscode", "settings.json");
  const destDir = path6.join(targetDir, ".vscode");
  fs6.mkdirSync(destDir, { recursive: true });
  fs6.copyFileSync(src, path6.join(destDir, "settings.json"));
}
async function deployGitignore(targetDir, language = "java", opts) {
  const base = fs6.readFileSync(path6.join(commonDir(opts), ".gitignore.base"), "utf-8");
  const extraPath = path6.join(langDir(language, opts), ".gitignore.extra");
  const extra = fs6.existsSync(extraPath) ? fs6.readFileSync(extraPath, "utf-8") : "";
  fs6.writeFileSync(path6.join(targetDir, ".gitignore"), base + "\n" + extra);
}
async function patchWorkflowsForRunnerType(targetDir, runnerType) {
  const workflowDir = path6.join(targetDir, ".github", "workflows");
  if (runnerType === "github-hosted") {
    for (const file of fs6.existsSync(workflowDir) ? fs6.readdirSync(workflowDir) : []) {
      if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
      const filePath = path6.join(workflowDir, file);
      let content = fs6.readFileSync(filePath, "utf-8");
      content = content.replace(/runs-on: self-hosted/g, "runs-on: ubuntu-latest");
      fs6.writeFileSync(filePath, content);
    }
    return;
  }
  const localJdkStep = [
    "- name: Set up JDK (probe local)",
    "        id: jdk-probe",
    "        if: steps.detect-lang.outputs.lang == 'java'",
    "        run: |",
    '          JH=""',
    '          if [ "$(uname)" = "Darwin" ]; then',
    '            JH="$(/usr/libexec/java_home 2>/dev/null || true)"',
    "          elif command -v java >/dev/null 2>&1 && java -version >/dev/null 2>&1; then",
    '            JH="$(dirname $(dirname $(readlink -f $(which java))))"',
    "          fi",
    '          if [ -n "$JH" ] && [ -x "$JH/bin/java" ]; then',
    '            echo "JAVA_HOME=$JH" >> $GITHUB_ENV',
    '            echo "local_jdk=found" >> $GITHUB_OUTPUT',
    '            echo "Using local JDK: $JH"',
    '            "$JH/bin/java" -version',
    "          else",
    '            echo "local_jdk=missing" >> $GITHUB_OUTPUT',
    '            echo "No local JDK; will fall back to actions/setup-java in the next step."',
    "          fi",
    "",
    "      - name: Set up JDK (download via actions/setup-java fallback)",
    "        if: steps.detect-lang.outputs.lang == 'java' && steps.jdk-probe.outputs.local_jdk == 'missing'",
    "        uses: actions/setup-java@v4",
    "        with:",
    "          java-version: '25'",
    "          distribution: 'temurin'",
    ""
  ].join("\n");
  for (const file of ["pr.yml", "merge.yml"]) {
    const filePath = path6.join(workflowDir, file);
    if (!fs6.existsSync(filePath)) continue;
    let content = fs6.readFileSync(filePath, "utf-8");
    content = content.replace(
      /- name: Set up JDK\n(?:\s+[\w-]+:.*\n)*\s+uses: actions\/setup-java@v4\n\s+with:\n(?:\s+#[^\n]*\n)*(?:\s+[\w-]+:.*\n)+/g,
      localJdkStep
    );
    fs6.writeFileSync(filePath, content);
  }
}
async function scaffoldStaticAll(args) {
  const report = args.report ?? (() => {
  });
  const language = args.language ?? "java";
  const runnerType = args.runnerType ?? "self-hosted";
  const opts = { templatesDir: args.templatesDir };
  report("Deploying .env.example");
  await deployEnvExample(args.targetDir, {
    ...opts,
    databricksHost: args.databricksHost,
    lakebaseProjectId: args.lakebaseProjectId
  });
  report("Deploying .env");
  await deployEnv(args.targetDir, {
    ...opts,
    databricksHost: args.databricksHost,
    lakebaseProjectId: args.lakebaseProjectId
  });
  report("Deploying .vscode/settings.json");
  await deployVscodeSettings(args.targetDir, opts);
  report("Deploying deploy-targets.yaml");
  await deployDeployTargets(args.targetDir, args.lakebaseProjectId, opts);
  report("Deploying .gitignore", language);
  await deployGitignore(args.targetDir, language, opts);
  report("Deploying scripts/");
  const scripts = await deployScripts(args.targetDir, opts);
  report("Deploying .github/workflows/");
  const workflows = await deployWorkflows(args.targetDir, opts);
  report("Patching workflows for runner type", runnerType);
  await patchWorkflowsForRunnerType(args.targetDir, runnerType);
  report("Installing git hooks");
  const hooksInstalled = await installHooks(args.targetDir);
  let claudeCommands = [];
  let claudeAgents = [];
  if (!args.skipCommands) {
    report("Deploying .claude/commands/");
    const cmd = await deployClaudeCommands(args.targetDir, opts);
    claudeCommands = cmd.written;
    report("Deploying .claude/agents/");
    const agents = await deployClaudeAgents(args.targetDir, opts);
    claudeAgents = agents.written;
  }
  return { scripts, workflows, hooksInstalled, claudeCommands, claudeAgents };
}
async function scaffoldAll(args) {
  const report = args.report ?? (() => {
  });
  const language = args.language ?? "java";
  const projectName = args.lakebaseProjectId;
  const staticResult = await scaffoldStaticAll(args);
  report(`Deploying language project (${language})`);
  await deployLanguageProject({
    targetDir: args.targetDir,
    language,
    projectName,
    templatesDir: args.templatesDir,
    initializrClient: args.initializrClient,
    report
  });
  await deployGitignore(args.targetDir, language, { templatesDir: args.templatesDir });
  return staticResult;
}

// scripts/lakebase/adopt-tdd.ts
import * as fs7 from "fs";
import * as path7 from "path";
import { fileURLToPath as fileURLToPath5 } from "url";
function adoptTdd(args) {
  if (!fs7.existsSync(args.projectDir)) {
    throw new Error(`Project directory does not exist: ${args.projectDir}`);
  }
  if (!fs7.existsSync(path7.join(args.projectDir, ".git"))) {
    throw new Error(
      `Not a git repo root: ${args.projectDir}. Run \`git init\` first, or pass a path that already has \`.git/\`.`
    );
  }
  const dest = path7.join(args.projectDir, ".tdd");
  const update = args.update === true || args.force === true;
  if (fs7.existsSync(dest) && !update) {
    throw new Error(
      `.tdd/ already exists at ${dest}. Re-run with --update to refresh missing files (drift is reported, not overwritten) or --update --force to overwrite drifted ones.`
    );
  }
  const src = args.bootstrapDir ?? findBootstrapDir();
  const entries = walkTemplateTree(src);
  const added = [];
  const inSync = [];
  const drifted = [];
  const updated = [];
  for (const rel of entries) {
    const fromPath = path7.join(src, rel);
    const toPath = path7.join(dest, rel);
    if (!fs7.existsSync(toPath)) {
      if (!args.dryRun) {
        fs7.mkdirSync(path7.dirname(toPath), { recursive: true });
        fs7.copyFileSync(fromPath, toPath);
      }
      added.push(rel);
      continue;
    }
    const before = fs7.readFileSync(fromPath);
    const after = fs7.readFileSync(toPath);
    if (before.equals(after)) {
      inSync.push(rel);
      continue;
    }
    if (args.force) {
      if (!args.dryRun) {
        fs7.copyFileSync(fromPath, toPath);
      }
      updated.push(rel);
    } else {
      drifted.push(rel);
    }
  }
  return {
    added,
    inSync,
    drifted,
    updated,
    noChanges: added.length === 0 && updated.length === 0
  };
}
function walkTemplateTree(root) {
  if (!fs7.existsSync(root)) {
    throw new Error(`tdd-bootstrap template tree missing: ${root}`);
  }
  const out = [];
  const stack = [""];
  while (stack.length) {
    const rel = stack.pop();
    const abs = path7.join(root, rel);
    for (const entry of fs7.readdirSync(abs)) {
      const childRel = rel ? path7.join(rel, entry) : entry;
      const childAbs = path7.join(abs, entry);
      const stat = fs7.statSync(childAbs);
      if (stat.isDirectory()) {
        stack.push(childRel);
      } else {
        out.push(childRel);
      }
    }
  }
  return out.sort();
}
var cachedBootstrapDir;
function findBootstrapDir() {
  if (cachedBootstrapDir) return cachedBootstrapDir;
  const here = path7.dirname(fileURLToPath5(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path7.join(dir, "templates", "tdd-bootstrap", ".tdd");
    if (fs7.existsSync(candidate)) {
      cachedBootstrapDir = candidate;
      return cachedBootstrapDir;
    }
    const parent = path7.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/tdd-bootstrap/.tdd relative to ${here}. Pass explicit { bootstrapDir } to override.`
  );
}

// scripts/lakebase/enable-e2e.ts
import * as fs9 from "fs";
import * as path9 from "path";

// scripts/lakebase/install-playwright.ts
import * as fs8 from "fs";
import * as path8 from "path";
import { fileURLToPath as fileURLToPath6 } from "url";

// scripts/util/exec.ts
import * as cp2 from "child_process";
function shq(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
function exec2(command, opts = {}) {
  return new Promise((resolve2, reject) => {
    const options = {
      cwd: opts.cwd,
      timeout: opts.timeout ?? 6e4
    };
    if (opts.env) {
      options.env = { ...process.env, ...opts.env };
    }
    cp2.exec(command, options, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message);
        reject(new Error(`${command}: ${msg}`));
        return;
      }
      resolve2(String(stdout).trim());
    });
  });
}

// scripts/lakebase/install-playwright.ts
var cachedTemplatesDir4;
function findTemplatesDir4() {
  if (cachedTemplatesDir4) return cachedTemplatesDir4;
  const here = path8.dirname(fileURLToPath6(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path8.join(dir, "templates", "project");
    if (fs8.existsSync(path8.join(candidate, "common", ".gitignore.base"))) {
      cachedTemplatesDir4 = candidate;
      return cachedTemplatesDir4;
    }
    const parent = path8.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project tree relative to ${here}. Pass explicit { templatesDir } to override.`
  );
}
function commonDir2(opts) {
  return path8.join(opts?.templatesDir ?? findTemplatesDir4(), "common");
}
var PLAYWRIGHT_TEMPLATE_FILES = [
  "playwright.config.ts",
  path8.join("tests", "e2e", "smoke.spec.ts")
];
function writePlaywrightTemplates(args) {
  const src = commonDir2(args);
  const written = [];
  const skipped = [];
  for (const rel of PLAYWRIGHT_TEMPLATE_FILES) {
    const from = path8.join(src, rel);
    if (!fs8.existsSync(from)) {
      throw new Error(`Kit template missing: ${from}`);
    }
    const to = path8.join(args.projectDir, rel);
    if (fs8.existsSync(to) && !args.force) {
      skipped.push(rel);
      continue;
    }
    fs8.mkdirSync(path8.dirname(to), { recursive: true });
    fs8.copyFileSync(from, to);
    written.push(rel);
  }
  return { written, skipped };
}
async function runPlaywrightInstall(args) {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliLong;
  await exec2("npm install --save-dev @playwright/test", {
    cwd: args.projectDir,
    timeout: timeoutMs
  });
  await exec2("npx --yes playwright install chromium", {
    cwd: args.projectDir,
    timeout: timeoutMs
  });
  const version = await exec2("npx --yes playwright --version", {
    cwd: args.projectDir,
    timeout: KIT_TIMEOUTS.cliDefault
  });
  return { version, browserInstalled: true };
}
async function installPlaywright(args) {
  const templates = writePlaywrightTemplates(args);
  if (args.skipBrowserInstall) {
    return { templates };
  }
  const install = await runPlaywrightInstall(args);
  return { templates, install };
}

// scripts/lakebase/enable-e2e.ts
var PLAYWRIGHT_TEST_VERSION_RANGE = "^1.49.0";
function addPlaywrightToPackageJson(args) {
  const pkgPath = path9.join(args.projectDir, "package.json");
  if (!fs9.existsSync(pkgPath)) {
    return { patched: false, scriptAdded: false, depAdded: false };
  }
  const range = args.versionRange ?? PLAYWRIGHT_TEST_VERSION_RANGE;
  const raw = fs9.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  const scripts = pkg.scripts ?? {};
  const devDependencies = pkg.devDependencies ?? {};
  let scriptAdded = false;
  if (!scripts["test:e2e"]) {
    scripts["test:e2e"] = "playwright test";
    scriptAdded = true;
  }
  let depAdded = false;
  if (!devDependencies["@playwright/test"]) {
    devDependencies["@playwright/test"] = range;
    depAdded = true;
  }
  pkg.scripts = scripts;
  pkg.devDependencies = devDependencies;
  if (scriptAdded || depAdded) {
    const trailingNewline = raw.endsWith("\n") ? "\n" : "";
    fs9.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + trailingNewline, "utf8");
  }
  return { patched: true, scriptAdded, depAdded };
}
var RUN_TESTS_E2E_MARKER = "# FEIP-7094: run Playwright E2E suite when configured";
function addE2eToRunTestsScript(args) {
  const scriptPath = path9.join(args.projectDir, "scripts", "run-tests.sh");
  if (!fs9.existsSync(scriptPath)) {
    return { patched: false, inserted: false };
  }
  const original = fs9.readFileSync(scriptPath, "utf8");
  if (original.includes(RUN_TESTS_E2E_MARKER)) {
    return { patched: true, inserted: false };
  }
  const trimmed = original.replace(/\n+$/, "\n");
  const block = [
    "",
    RUN_TESTS_E2E_MARKER,
    'if [ -f "$REPO_ROOT/playwright.config.ts" ] || [ -f "$REPO_ROOT/playwright.config.js" ]; then',
    '  echo "Running Playwright E2E tests..."',
    '  if [ -f "$REPO_ROOT/package.json" ] && command -v npm >/dev/null 2>&1; then',
    '    (cd "$REPO_ROOT" && npm run test:e2e)',
    "  else",
    '    (cd "$REPO_ROOT" && npx --yes playwright test)',
    "  fi",
    "fi",
    ""
  ].join("\n");
  fs9.writeFileSync(scriptPath, trimmed + block, "utf8");
  return { patched: true, inserted: true };
}
function enableE2eForProject(args) {
  const rootPkg = path9.join(args.projectDir, "package.json");
  if (!fs9.existsSync(rootPkg)) {
    return {
      templatesWritten: [],
      // Same shape as writePlaywrightTemplates would have returned; the
      // template paths show up under skipped with the npm-wiring caveat
      // captured in packageJson.patched=false.
      templatesSkipped: [...PLAYWRIGHT_TEMPLATE_FILES],
      packageJson: { patched: false, scriptAdded: false, depAdded: false },
      runTestsScript: addE2eToRunTestsScript({ projectDir: args.projectDir })
    };
  }
  const templates = writePlaywrightTemplates({
    projectDir: args.projectDir,
    force: args.force,
    templatesDir: args.templatesDir
  });
  const packageJson = addPlaywrightToPackageJson({
    projectDir: args.projectDir,
    versionRange: args.versionRange
  });
  const runTestsScript = addE2eToRunTestsScript({ projectDir: args.projectDir });
  return {
    templatesWritten: templates.written,
    templatesSkipped: templates.skipped,
    packageJson,
    runTestsScript
  };
}

// scripts/lakebase/enable-infra.ts
import * as fs10 from "fs";
import * as path10 from "path";
var RUN_TESTS_INFRA_MARKER = "# Run Lakebase [Infra]-tag suite when wired";
function addInfraToPackageJson(args) {
  const pkgPath = path10.join(args.projectDir, "package.json");
  if (!fs10.existsSync(pkgPath)) {
    return { patched: false, scriptAdded: false };
  }
  const scriptValue = args.scriptValue ?? "npx --yes lakebase-infra-runner";
  const raw = fs10.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  const scripts = pkg.scripts ?? {};
  let scriptAdded = false;
  if (!scripts["test:infra"]) {
    scripts["test:infra"] = scriptValue;
    scriptAdded = true;
  }
  pkg.scripts = scripts;
  if (scriptAdded) {
    const trailing = raw.endsWith("\n") ? "\n" : "";
    fs10.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + trailing, "utf8");
  }
  return { patched: true, scriptAdded };
}
function addInfraToRunTestsScript(args) {
  const scriptPath = path10.join(args.projectDir, "scripts", "run-tests.sh");
  if (!fs10.existsSync(scriptPath)) {
    return { patched: false, inserted: false };
  }
  const original = fs10.readFileSync(scriptPath, "utf8");
  if (original.includes(RUN_TESTS_INFRA_MARKER)) {
    return { patched: true, inserted: false };
  }
  const trimmed = original.replace(/\n+$/, "\n");
  const block = [
    "",
    RUN_TESTS_INFRA_MARKER,
    'if [ -f "$REPO_ROOT/package.json" ] && command -v npm >/dev/null 2>&1; then',
    `  if node -e "process.exit(!(require('./package.json').scripts && require('./package.json').scripts['test:infra']))" 2>/dev/null; then`,
    '    echo "Running Lakebase [Infra] suite..."',
    '    (cd "$REPO_ROOT" && npm run test:infra)',
    "  fi",
    "fi",
    ""
  ].join("\n");
  fs10.writeFileSync(scriptPath, trimmed + block, "utf8");
  return { patched: true, inserted: true };
}
function enableInfraForProject(args) {
  const packageJson = addInfraToPackageJson({
    projectDir: args.projectDir,
    scriptValue: args.scriptValue
  });
  const runTestsScript = addInfraToRunTestsScript({ projectDir: args.projectDir });
  return { packageJson, runTestsScript };
}

// scripts/lakebase/adopt-lakebase-project.ts
async function adoptLakebaseProject(args) {
  const warnings = [];
  const filesWritten = [];
  const dryRun = args.dryRun === true;
  const preserveExistingEnv = args.preserveExistingEnv !== false;
  if (!fs11.existsSync(args.projectDir)) {
    throw new Error(`adoptLakebaseProject: project directory does not exist: ${args.projectDir}`);
  }
  if (!fs11.existsSync(path11.join(args.projectDir, ".git"))) {
    throw new Error(
      `adoptLakebaseProject: ${args.projectDir} is not a git repo. Run \`git init\` first, or pass an existing repo path.`
    );
  }
  if (preserveExistingEnv) {
    assertEnvCompatibility(args.projectDir, args.projectName);
  }
  const host = args.databricksHost.replace(/\/+$/, "");
  await createLakebaseProject({ projectId: args.projectName, host });
  const defaultBranch = await getDefaultBranchId({ projectId: args.projectName, host });
  if (!defaultBranch) {
    warnings.push(
      "Lakebase project created but default branch id is not yet ready. Re-run lakebase-doctor in a moment to confirm; the post-checkout hook will refresh .env when it sees a branch."
    );
  }
  if (!args.skipEnv) {
    if (!dryRun) {
      await deployEnvExample(args.projectDir, {
        databricksHost: host,
        lakebaseProjectId: args.projectName
      });
      await deployEnv(args.projectDir, {
        databricksHost: host,
        lakebaseProjectId: args.projectName
      });
    }
    filesWritten.push(".env", ".env.example");
  }
  if (args.enableTdd) {
    if (!dryRun) {
      const result = adoptTdd({ projectDir: args.projectDir });
      for (const rel of result.added) {
        filesWritten.push(path11.join(".tdd", rel));
      }
    } else {
      warnings.push("dryRun: skipped enableTdd. Re-run without --dry-run to drop the .tdd/ scaffold.");
    }
  }
  if (args.enableE2e) {
    if (!dryRun) {
      const result = enableE2eForProject({ projectDir: args.projectDir });
      for (const rel of result.templatesWritten) {
        filesWritten.push(rel);
      }
    } else {
      warnings.push("dryRun: skipped enableE2e. Re-run without --dry-run to wire Playwright.");
    }
  }
  if (args.enableInfra) {
    if (!dryRun) {
      enableInfraForProject({ projectDir: args.projectDir });
      filesWritten.push("scripts/run-tests.sh");
    } else {
      warnings.push("dryRun: skipped enableInfra. Re-run without --dry-run to wire the infra runner.");
    }
  }
  return {
    lakebaseProjectId: args.projectName,
    defaultBranch,
    filesWritten,
    warnings
  };
}
function assertEnvCompatibility(projectDir, expectedProjectId) {
  const envPath = path11.join(projectDir, ".env");
  if (!fs11.existsSync(envPath)) return;
  const content = fs11.readFileSync(envPath, "utf8");
  const match = content.match(/^LAKEBASE_PROJECT_ID\s*=\s*(.+?)\s*$/m);
  if (!match) return;
  const existing = match[1].trim().replace(/^['"]|['"]$/g, "");
  if (existing && existing !== expectedProjectId) {
    throw new Error(
      `adoptLakebaseProject: .env already declares LAKEBASE_PROJECT_ID=${existing}, which differs from the requested project name "${expectedProjectId}". Rebinding is destructive: pass { preserveExistingEnv: false } if you are sure.`
    );
  }
}
function assertAdoptionPreflight(args) {
  if (!fs11.existsSync(args.projectDir)) {
    throw new Error(`assertAdoptionPreflight: project directory does not exist: ${args.projectDir}`);
  }
  if (!fs11.existsSync(path11.join(args.projectDir, ".git"))) {
    throw new Error(
      `assertAdoptionPreflight: ${args.projectDir} is not a git repo.`
    );
  }
  if (args.expectedProjectName) {
    assertEnvCompatibility(args.projectDir, args.expectedProjectName);
  }
}
function _testMakeBrownfieldFixture(opts) {
  fs11.mkdirSync(opts.dir, { recursive: true });
  cp3.execSync("git init --quiet", { cwd: opts.dir, stdio: "pipe" });
  if (opts.packageJson) {
    fs11.writeFileSync(
      path11.join(opts.dir, "package.json"),
      JSON.stringify(opts.packageJson, null, 2) + "\n"
    );
  }
}

// scripts/lakebase/branch-create.ts
import { execFile as execFile3 } from "child_process";
import { promisify as promisify3 } from "util";

// scripts/util/delay.ts
function delay(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}

// scripts/util/poll-until.ts
async function pollUntil(args) {
  const now = args.now ?? (() => /* @__PURE__ */ new Date());
  const sleep2 = args.sleep ?? delay;
  const startedAt = now().getTime();
  let polls = 0;
  while (true) {
    const elapsedMs = now().getTime() - startedAt;
    if (elapsedMs >= args.timeoutMs && polls > 0) {
      return { outcome: "timeout", polls, elapsedMs };
    }
    polls += 1;
    const result = await args.probe({ pollIndex: polls, elapsedMs });
    const afterProbeElapsed = now().getTime() - startedAt;
    if (args.onPoll) {
      args.onPoll({ pollIndex: polls, elapsedMs: afterProbeElapsed, result });
    } else if (args.label && !result.done) {
      const seconds = Math.round(afterProbeElapsed / 1e3);
      console.log(
        `[${args.label}] still pending after ${seconds}s (poll ${polls})`
      );
    }
    if (result.done) {
      return {
        outcome: "done",
        value: result.value,
        polls,
        elapsedMs: afterProbeElapsed
      };
    }
    if (afterProbeElapsed >= args.timeoutMs) {
      return { outcome: "timeout", polls, elapsedMs: afterProbeElapsed };
    }
    await sleep2(args.intervalMs);
  }
}
async function pollUntilDefined(probe, opts) {
  return pollUntil({
    ...opts,
    probe: async (ctx) => {
      const value = await probe(ctx);
      return value === void 0 ? { done: false } : { done: true, value };
    }
  });
}

// scripts/util/sanitize-branch-name.ts
function sanitizeBranchName(gitBranch) {
  let name = gitBranch.replace(/\//g, "-").toLowerCase().replace(/[^a-z0-9-]/g, "-").substring(0, 63);
  while (name.length < 3) name += "-x";
  return name;
}

// scripts/lakebase/branch-utils.ts
import { execFile as execFile2 } from "child_process";
import { promisify as promisify2 } from "util";
var execFileP2 = promisify2(execFile2);
var LakebaseBranchError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LakebaseBranchError";
  }
};
var LakebaseBranchTtlTooLongError = class extends LakebaseBranchError {
  /** The TTL that was attempted (the value passed to the API). */
  attemptedTtl;
  constructor(attemptedTtl, underlyingMessage) {
    super(
      `Branch create rejected: TTL '${attemptedTtl}' exceeds the workspace's maximum expiration policy. Pass a shorter ttl arg (e.g. "604800s" for 7 days) or set noExpiry: true. The workspace cap is not directly exposed by the Lakebase API; the project's history_retention_duration (from \`databricks postgres get-project\`) is a conservative starting point.

Underlying error: ${underlyingMessage}`
    );
    this.name = "LakebaseBranchTtlTooLongError";
    this.attemptedTtl = attemptedTtl;
  }
};
function isTtlTooLongError(stderr) {
  return /expiration time exceeds the maximum expiration time/i.test(stderr);
}
function parseLakebaseTtl(ttl) {
  if (!ttl) return void 0;
  const m = ttl.trim().match(/^(\d+)s?$/);
  if (!m) return void 0;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : void 0;
}
function minLakebaseTtl(a, b) {
  const sa = parseLakebaseTtl(a);
  const sb = parseLakebaseTtl(b);
  if (sa === void 0 && sb === void 0) return void 0;
  if (sa === void 0) return `${sb}s`;
  if (sb === void 0) return `${sa}s`;
  return `${Math.min(sa, sb)}s`;
}
var RETENTION_CACHE = /* @__PURE__ */ new Map();
function getCachedProjectRetention(instance) {
  return RETENTION_CACHE.get(instance);
}
function cacheProjectRetention(instance, ttl) {
  RETENTION_CACHE.set(instance, ttl);
}
function clearRetentionCache() {
  RETENTION_CACHE.clear();
}
function projectPath(instance) {
  return `projects/${instance}`;
}
async function listBranches(opts) {
  const raw = await dbcli2(
    ["postgres", "list-branches", projectPath(opts.instance), "-o", "json"],
    opts.host
  );
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LakebaseBranchError(`Unexpected CLI output: ${raw.slice(0, 200)}`);
  }
  const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
  return items.map(parseBranch).filter((b) => b !== void 0);
}
async function getBranchByName(branchNameOrUid, opts) {
  const branches = await listBranches(opts);
  return branches.find(
    (b) => b.uid === branchNameOrUid || b.name === branchNameOrUid || b.name.endsWith(`/${branchNameOrUid}`)
  );
}
async function getDefaultBranch(opts) {
  const branches = await listBranches(opts);
  return branches.find((b) => b.isDefault);
}
function isLongRunningTierBranch(b) {
  return !b.isDefault && !b.expireTime;
}
function isTier(name, branches) {
  if (!name) {
    return false;
  }
  return branches.some((b) => isLongRunningTierBranch(b) && b.nameLeaf === name);
}
function tierBranchNames(branches) {
  return branches.filter(isLongRunningTierBranch).map((b) => b.nameLeaf);
}
async function resolveBranchPath(branchNameOrUid, opts) {
  if (branchNameOrUid.startsWith("projects/") && branchNameOrUid.includes("/branches/")) {
    return branchNameOrUid;
  }
  const branch = await getBranchByName(branchNameOrUid, opts);
  return branch?.name;
}
async function resolveBranchId(args) {
  const { branch, ...opts } = args;
  if (branch.startsWith("projects/") && branch.includes("/branches/")) {
    const leaf2 = branch.split("/branches/").pop();
    if (leaf2) return leaf2;
  }
  if (!branch.startsWith("br-")) {
    return branch;
  }
  const info = await getBranchByName(branch, opts);
  if (!info) {
    throw new LakebaseBranchError(
      `Could not resolve branch "${branch}" in project "${opts.instance}". Pass either the branch_id (e.g. "demo-feature") or the branch uid.`
    );
  }
  const leaf = info.name.split("/branches/").pop();
  if (!leaf) {
    throw new LakebaseBranchError(
      `Branch info for "${branch}" missing a name segment (got "${info.name}").`
    );
  }
  return leaf;
}
function parseBranch(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const r = raw;
  const name = r.name ?? "";
  if (!name) return void 0;
  const nameLeaf = branchNameFromResourcePath(name);
  if (!nameLeaf) return void 0;
  if (!r.uid) return void 0;
  let uid;
  try {
    uid = asBranchUid(r.uid);
  } catch {
    return void 0;
  }
  const sourceBranchName = r.status?.source_branch ?? r.spec?.source_branch;
  const sourceBranchId = sourceBranchName ? branchNameFromResourcePath(sourceBranchName) ?? void 0 : void 0;
  return {
    uid,
    nameLeaf,
    name,
    state: r.status?.current_state ?? r.state ?? "UNKNOWN",
    sourceBranchName,
    sourceBranchId,
    isDefault: r.status?.default === true || r.is_default === true,
    expireTime: r.status?.expire_time,
    isProtected: r.status?.is_protected
  };
}
async function dbcli2(args, host) {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...process.env, DATABRICKS_HOST: trimmedHost } : process.env;
  try {
    const { stdout } = await execFileP2("databricks", args, { env, timeout: KIT_TIMEOUTS.cliDefault });
    return stdout.toString();
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new LakebaseBranchError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/lakebase/branch-create.ts
var execFileP3 = promisify3(execFile3);
async function createBranch(args) {
  const sanitized = sanitizeBranchName(args.branch);
  const lookup = { instance: args.instance, host: args.host };
  let sourceBranchPath;
  if (args.parentBranch) {
    if (looksLikeBranchUid(args.parentBranch)) {
      throw new LakebaseBranchError(
        `parentBranch '${args.parentBranch}' looks like a BranchUid (br-\u2026 pattern), not a BranchName. Pass the resource-path leaf (e.g. 'production', 'staging', 'feature-add-orders') \u2013 the Lakebase API rejects uids in source_branch fields. If you have a uid and need to resolve it to its name, call resolveBranchId() from branch-utils first.`
      );
    }
    const validated = asBranchName(args.parentBranch);
    const parent = await getBranchByName(validated, lookup);
    if (parent) {
      sourceBranchPath = parent.name;
    } else if (args.strictParent === true) {
      throw new LakebaseBranchError(
        `parentBranch '${validated}' does not exist on project '${args.instance}', and strictParent: true was set. Either create '${validated}' first (e.g. cut it off the project default branch) or drop strictParent: true to fall back to the project default branch.`
      );
    } else {
      const def = await getDefaultBranch(lookup);
      if (!def) {
        throw new LakebaseBranchError(
          `parentBranch '${validated}' does not exist on project '${args.instance}' and the project has no default branch to fall back to.`
        );
      }
      const defaultLeaf = leafOf(def.name) ?? def.name;
      process.stderr.write(
        `[lakebase-branch-create] parentBranch '${validated}' not found on project '${args.instance}'; falling back to default branch '${defaultLeaf}'. Pass strictParent: true to throw instead.
`
      );
      sourceBranchPath = def.name;
    }
  } else if (args.currentBranch && args.currentBranch !== sanitized) {
    const current = await getBranchByName(args.currentBranch, lookup);
    if (current) sourceBranchPath = current.name;
  }
  if (!sourceBranchPath) {
    const def = await getDefaultBranch(lookup);
    if (!def) {
      throw new LakebaseBranchError(
        `Could not find a parent branch for "${sanitized}" \u2013 no parentBranch override, no currentBranch hint, and the project has no default branch.`
      );
    }
    sourceBranchPath = def.name;
  }
  const existing = await getBranchByName(sanitized, lookup);
  if (existing) {
    const existingLeaf = leafOf(existing.sourceBranchName);
    const requestedLeaf = leafOf(sourceBranchPath);
    if (existingLeaf && requestedLeaf && existingLeaf !== requestedLeaf) {
      throw new LakebaseBranchError(
        `Branch "${sanitized}" already exists, but was forked from "${existingLeaf}", not the requested "${requestedLeaf}". Delete the existing branch first, or pick a different target name.`
      );
    }
    return existing;
  }
  if (args.ttl && args.noExpiry === true) {
    throw new LakebaseBranchError(
      `Cannot set both ttl ("${args.ttl}") and noExpiry: true on the same branch \u2013 they are mutually exclusive. Pass one or the other.`
    );
  }
  const specObj = {
    source_branch: sourceBranchPath
  };
  if (args.ttl) {
    specObj.ttl = args.ttl;
  } else if (args.noExpiry ?? true) {
    specObj.no_expiry = true;
  }
  await createWithTtlRecovery(args.instance, sanitized, specObj, args.host);
  return waitForBranchReady({
    instance: args.instance,
    host: args.host,
    branch: sanitized,
    timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait,
    pollIntervalMs: args.pollIntervalMs ?? KIT_TIMEOUTS.readyPoll
  });
}
async function waitForBranchReady(args) {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.readyWait;
  const interval = args.pollIntervalMs ?? KIT_TIMEOUTS.readyPoll;
  const result = await pollUntilDefined(
    async () => {
      const branch = await getBranchByName(args.branch, { instance: args.instance, host: args.host });
      return branch && branch.state === "READY" ? branch : void 0;
    },
    { timeoutMs, intervalMs: interval }
  );
  if (result.outcome === "timeout") {
    throw new LakebaseBranchError(
      `Branch "${args.branch}" did not reach READY within ${timeoutMs}ms`
    );
  }
  return result.value;
}
function leafOf(pathOrName) {
  if (!pathOrName) return void 0;
  const segments = pathOrName.split("/");
  return segments[segments.length - 1] || void 0;
}
async function createWithTtlRecovery(instance, sanitized, specObj, host) {
  const originalTtl = specObj.ttl;
  try {
    await dbcli3(
      ["postgres", "create-branch", projectPath(instance), sanitized, "--json", JSON.stringify({ spec: specObj })],
      host
    );
    return;
  } catch (err) {
    if (!(err instanceof LakebaseBranchError) || !originalTtl || !isTtlTooLongError(err.message)) {
      throw err;
    }
    let retention = getCachedProjectRetention(instance);
    if (retention === void 0) {
      retention = await getProjectRetentionDuration({ projectId: instance, host });
      cacheProjectRetention(instance, retention);
    }
    const FALLBACK_TTL = "604800s";
    const effectiveRetention = retention ?? FALLBACK_TTL;
    const clamped = minLakebaseTtl(originalTtl, effectiveRetention) ?? effectiveRetention;
    if (clamped === originalTtl) {
      throw new LakebaseBranchTtlTooLongError(originalTtl, err.message);
    }
    process.stderr.write(
      `[lakebase-branch-create] workspace TTL cap rejected '${originalTtl}' for project '${instance}'; retrying with ` + (retention ? `retention-clamped '${clamped}'.
` : `hardcoded fallback '${clamped}' (history_retention_duration not discoverable).
`)
    );
    const retrySpec = { ...specObj, ttl: clamped };
    try {
      await dbcli3(
        ["postgres", "create-branch", projectPath(instance), sanitized, "--json", JSON.stringify({ spec: retrySpec })],
        host
      );
    } catch (retryErr) {
      if (retryErr instanceof LakebaseBranchError && isTtlTooLongError(retryErr.message)) {
        throw new LakebaseBranchTtlTooLongError(
          clamped,
          `Workspace rejected retention-clamped TTL '${clamped}' (original '${originalTtl}'): ${retryErr.message}`
        );
      }
      throw retryErr;
    }
  }
}
async function dbcli3(args, host) {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...process.env, DATABRICKS_HOST: trimmedHost } : process.env;
  try {
    const { stdout } = await execFileP3("databricks", args, { env, timeout: KIT_TIMEOUTS.cliCreateBranch });
    return stdout.toString();
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new LakebaseBranchError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/lakebase/branch-delete.ts
import { execFile as execFile4 } from "child_process";
import { promisify as promisify4 } from "util";
var execFileP4 = promisify4(execFile4);
async function deleteBranch(args) {
  const fullPath = await resolveBranchPath(args.branch, {
    instance: args.instance,
    host: args.host
  });
  if (!fullPath) {
    throw new LakebaseBranchError(`Branch "${args.branch}" not found in instance "${args.instance}"`);
  }
  if (!args.allowDefault) {
    const info = await getBranchByName(args.branch, {
      instance: args.instance,
      host: args.host
    });
    if (info?.isDefault) {
      const leaf = info.name.split("/branches/").pop() ?? info.uid;
      throw new LakebaseBranchError(
        `Refusing to delete the project's default Lakebase branch "${leaf}". This branch is the trunk every other branch was forked from. Pass allowDefault=true (or --allow-default on the CLI) only when you intend to tear down the entire project.`
      );
    }
  }
  await dbcli4(["postgres", "delete-branch", fullPath], args.host);
}
async function dbcli4(args, host) {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...process.env, DATABRICKS_HOST: trimmedHost } : process.env;
  try {
    const { stdout } = await execFileP4("databricks", args, { env, timeout: KIT_TIMEOUTS.cliDefault });
    return stdout.toString();
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new LakebaseBranchError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/lakebase/paired-branch.ts
import * as fs14 from "fs";
import * as path13 from "path";
import { execFileSync as execFileSync3 } from "child_process";

// scripts/lakebase/branch-endpoint.ts
import { execFileSync as execFileSync2 } from "child_process";

// scripts/lakebase/get-connection.ts
import { execFileSync } from "child_process";
import { createLakebasePool } from "@databricks/lakebase";
import { Client } from "pg";

// scripts/lakebase/constants.ts
var POSTGRES_PORT = 5432;
var DEFAULT_DATABASE = "databricks_postgres";
var DEFAULT_ENDPOINT = "primary";

// scripts/lakebase/get-connection.ts
async function getConnection(args) {
  const endpointName = args.endpointName ?? DEFAULT_ENDPOINT;
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const branchId = await resolveBranchId({ instance: args.instance, branch: args.branch });
  const endpointPath2 = `projects/${args.instance}/branches/${branchId}/endpoints/${endpointName}`;
  if (args.output === "dsn") {
    const host2 = await resolveEndpointHost(args.instance, branchId);
    const { token, email: email2 } = await mintCredential(endpointPath2);
    const url = buildPostgresUrl({ host: host2, port: POSTGRES_PORT, database, user: email2, password: token });
    return { url, host: host2, port: POSTGRES_PORT, database, user: email2, endpointPath: endpointPath2 };
  }
  const host = await resolveEndpointHost(args.instance, branchId);
  const email = await resolveCurrentUser();
  return createLakebasePool({
    endpoint: endpointPath2,
    host,
    database,
    user: email,
    // workspaceClient is passed through verbatim. createLakebasePool falls
    // back to environment / ServiceContext when omitted.
    ...args.workspaceClient !== void 0 ? { workspaceClient: args.workspaceClient } : {}
  });
}
async function resolveEndpointHost(instance, branch) {
  const branchId = await resolveBranchId({ instance, branch });
  const branchPath = `projects/${instance}/branches/${branchId}`;
  const raw = dbcli5(["postgres", "list-endpoints", branchPath, "-o", "json"]);
  const endpoints = JSON.parse(raw);
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    throw new Error(`No endpoints found for branch ${branchPath}`);
  }
  const host = endpoints[0]?.status?.hosts?.host;
  if (!host) {
    throw new Error(`Endpoint exists for ${branchPath} but has no host yet \u2013 wait for it to become ACTIVE`);
  }
  return host;
}
async function mintCredential(endpointPath2) {
  const raw = dbcli5(["postgres", "generate-database-credential", endpointPath2, "-o", "json"]);
  const token = JSON.parse(raw)?.token ?? "";
  if (!token) {
    throw new Error(`generate-database-credential returned no token for ${endpointPath2}`);
  }
  const email = await resolveCurrentUser();
  return { token, email };
}
async function resolveCurrentUser() {
  const raw = dbcli5(["current-user", "me", "-o", "json"]);
  const parsed = JSON.parse(raw);
  const email = parsed.userName ?? parsed.emails?.[0]?.value;
  if (!email) {
    throw new Error("Could not resolve current user from `databricks current-user me`");
  }
  return email;
}
function buildPostgresUrl(parts) {
  const u = new URL(`postgresql://${parts.host}:${parts.port}/${encodeURIComponent(parts.database)}`);
  u.username = encodeURIComponent(parts.user);
  u.password = encodeURIComponent(parts.password);
  u.searchParams.set("sslmode", "require");
  return u.toString();
}
function dbcli5(args) {
  try {
    return execFileSync("databricks", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: KIT_TIMEOUTS.cliDefault
    });
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new Error(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}
async function waitForBranchAuthReady(args) {
  const timeoutMs = args.timeoutMs ?? 6e4;
  const initialBackoffMs = args.initialBackoffMs ?? 2e3;
  const deadline = Date.now() + timeoutMs;
  let backoffMs = initialBackoffMs;
  let lastErr;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    let client;
    try {
      const dsn = await getConnection({
        instance: args.instance,
        branch: args.branch,
        endpointName: args.endpointName,
        database: args.database,
        output: "dsn"
      });
      client = new Client({ connectionString: dsn.url });
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch (err) {
      lastErr = err;
      if (client) {
        try {
          await client.end();
        } catch {
        }
      }
      if (!isTransientAuthFailure(err)) {
        throw err;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const wait = Math.min(backoffMs, remaining);
      await new Promise((r) => setTimeout(r, wait));
      backoffMs = Math.min(backoffMs * 2, 8e3);
    }
  }
  throw new Error(
    `waitForBranchAuthReady: timed out after ${timeoutMs}ms (${attempt} attempts) against projects/${args.instance}/branches/${args.branch}. Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
  );
}
function isTransientAuthFailure(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /external authorization failed/i.test(msg) || /password authentication failed/i.test(msg) || /authentication failed/i.test(msg);
}

// scripts/lakebase/branch-endpoint.ts
async function getEndpoint(args) {
  const branchPath = await resolveBranchPath(args.branch, { instance: args.instance });
  if (!branchPath) {
    return void 0;
  }
  let raw;
  try {
    raw = execFileSync2("databricks", ["postgres", "list-endpoints", branchPath, "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: KIT_TIMEOUTS.cliDefault
    });
  } catch {
    return void 0;
  }
  let endpoints;
  try {
    endpoints = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    return void 0;
  }
  const ep = endpoints[0];
  return {
    host: ep?.status?.hosts?.host ?? "",
    state: ep?.status?.current_state ?? "UNKNOWN"
  };
}
function endpointPath(instance, branch, endpointName = DEFAULT_ENDPOINT) {
  return `projects/${instance}/branches/${branch}/endpoints/${endpointName}`;
}
async function ensureEndpoint(args) {
  const endpointName = args.endpointName ?? DEFAULT_ENDPOINT;
  const branchId = await resolveBranchId({ instance: args.instance, branch: args.branch });
  const existing = await getEndpoint({ instance: args.instance, branch: branchId, endpointName });
  if (existing?.host) {
    return existing;
  }
  const branchPath = `projects/${args.instance}/branches/${branchId}`;
  const spec = {
    spec: {
      endpoint_type: args.endpointType ?? "ENDPOINT_TYPE_READ_WRITE",
      autoscaling_limit_min_cu: args.autoscalingMinCu ?? 2,
      autoscaling_limit_max_cu: args.autoscalingMaxCu ?? 4
    }
  };
  try {
    execFileSync2(
      "databricks",
      ["postgres", "create-endpoint", branchPath, endpointName, "--json", JSON.stringify(spec)],
      { stdio: ["ignore", "pipe", "pipe"], timeout: KIT_TIMEOUTS.cliCreateEndpoint }
    );
  } catch (err) {
    const racy = await getEndpoint({ instance: args.instance, branch: branchId, endpointName });
    if (racy?.host) return racy;
    throw err;
  }
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.readyWait;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ep = await getEndpoint({ instance: args.instance, branch: branchId, endpointName });
    if (ep?.host) return ep;
    await new Promise((r) => setTimeout(r, KIT_TIMEOUTS.readyPoll));
  }
  throw new Error(
    `Endpoint for ${branchPath} did not reach ACTIVE within ${timeoutMs}ms (create succeeded but no host yet)`
  );
}
async function getCredential(args) {
  const branchPath = await resolveBranchPath(args.branch, { instance: args.instance });
  if (!branchPath) {
    throw new Error(`Branch "${args.branch}" not found in instance "${args.instance}"`);
  }
  const endpointName = args.endpointName ?? DEFAULT_ENDPOINT;
  return mintCredential(`${branchPath}/endpoints/${endpointName}`);
}

// scripts/lakebase/env-file.ts
import * as fs12 from "fs";
import * as path12 from "path";
function writeEnvFile(args) {
  const host = args.databricksHost.replace(/\/+$/, "");
  const envContent = [
    "# Lakebase project configuration",
    "# Created by @databricks-solutions/lakebase-app-dev-kit",
    "",
    `DATABRICKS_HOST=${host}`,
    `LAKEBASE_PROJECT_ID=${args.lakebaseProjectId}`,
    "",
    "# Connection (auto-populated on branch switch)",
    "# DATABASE_URL=",
    "# DB_USERNAME=",
    "# DB_PASSWORD=",
    ""
  ].join("\n");
  const envPath = path12.join(args.projectDir, ".env");
  fs12.writeFileSync(envPath, envContent);
  return envPath;
}
var CONNECTION_KEYS = [
  "DATABASE_URL",
  "DB_USERNAME",
  "DB_PASSWORD",
  "LAKEBASE_BRANCH_ID",
  "LAKEBASE_HOST"
];
function updateEnvConnection(args) {
  const existing = fs12.existsSync(args.envPath) ? fs12.readFileSync(args.envPath, "utf-8") : "";
  const preserved = existing.split("\n").filter((line) => {
    const trimmed = line.trimStart();
    return !CONNECTION_KEYS.some((k) => trimmed.startsWith(`${k}=`));
  }).join("\n").replace(/\n+$/, "");
  const lines = [];
  if (args.comment !== void 0) {
    lines.push(args.comment);
  }
  if (args.endpointHost !== void 0) {
    lines.push(`LAKEBASE_HOST=${args.endpointHost}`);
  }
  lines.push(`LAKEBASE_BRANCH_ID=${args.branchId}`);
  lines.push(`DATABASE_URL=${args.databaseUrl}`);
  lines.push(`DB_USERNAME=${args.username}`);
  lines.push(`DB_PASSWORD=${args.password}`);
  lines.push("");
  const block = lines.join("\n");
  const content = preserved ? `${preserved}
${block}` : block;
  fs12.mkdirSync(path12.dirname(args.envPath), { recursive: true });
  fs12.writeFileSync(args.envPath, content);
}

// scripts/lakebase/databricks-profile.ts
import * as fs13 from "fs";
function normalizeHost(host) {
  return host.trim().replace(/\/+$/, "").toLowerCase();
}
function selectProfileForHost(profilesJson, host) {
  const target = normalizeHost(host);
  if (!target) return void 0;
  const start = profilesJson.indexOf("{");
  if (start < 0) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(profilesJson.slice(start));
  } catch {
    return void 0;
  }
  const profiles = parsed.profiles;
  if (!Array.isArray(profiles)) return void 0;
  const names = profiles.filter((p) => {
    if (!p || typeof p !== "object") return false;
    const rec = p;
    return typeof rec.name === "string" && typeof rec.host === "string" && rec.valid === true && normalizeHost(rec.host) === target;
  }).map((p) => p.name);
  const distinct = Array.from(new Set(names));
  return distinct.length === 1 ? distinct[0] : void 0;
}
async function resolveProfileForHost(host, timeoutMs = KIT_TIMEOUTS.cliDefault) {
  if (!normalizeHost(host)) return void 0;
  let out;
  try {
    out = await exec2("databricks auth profiles -o json", { timeout: timeoutMs });
  } catch {
    return void 0;
  }
  return selectProfileForHost(out, host);
}
async function ensureProfilePinned(args) {
  const { envPath } = args;
  if (!fs13.existsSync(envPath)) return { reason: "no-env" };
  const lines = fs13.readFileSync(envPath, "utf-8").split("\n");
  const startsWithKey = (line, key) => line.trimStart().startsWith(`${key}=`);
  if (lines.some((l) => startsWithKey(l, "DATABRICKS_CONFIG_PROFILE"))) {
    return { reason: "already-pinned" };
  }
  const hostIdx = lines.findIndex((l) => startsWithKey(l, "DATABRICKS_HOST"));
  if (hostIdx < 0) return { reason: "no-host" };
  const hostLine = lines[hostIdx];
  const host = hostLine.slice(hostLine.indexOf("=") + 1).trim();
  if (!host) return { reason: "no-host" };
  const resolve2 = args.resolve ?? ((h) => resolveProfileForHost(h));
  const profile = await resolve2(host);
  if (!profile) return { reason: "no-match" };
  lines.splice(hostIdx + 1, 0, `DATABRICKS_CONFIG_PROFILE=${profile}`);
  fs13.writeFileSync(envPath, lines.join("\n"));
  return { pinned: profile };
}

// scripts/lakebase/paired-branch.ts
function gitCurrentBranch(cwd) {
  return execFileSync3("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitDefault
  }).trim();
}
function gitHasLocalBranch(cwd, branch) {
  try {
    execFileSync3("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd,
      stdio: "ignore",
      timeout: KIT_TIMEOUTS.gitDefault
    });
    return true;
  } catch {
    return false;
  }
}
function gitCheckoutNewBranch(cwd, branch) {
  execFileSync3("git", ["checkout", "-b", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitCheckout
  });
}
function gitCheckoutExistingBranch(cwd, branch) {
  execFileSync3("git", ["checkout", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitCheckout
  });
}
function gitDeleteLocalBranch(cwd, branch, force = true) {
  execFileSync3("git", ["branch", force ? "-D" : "-d", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitDefault
  });
}
function gitHasRemoteBranch(cwd, remote, branch) {
  try {
    const out = execFileSync3(
      "git",
      ["ls-remote", "--exit-code", "--heads", remote, branch],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: KIT_TIMEOUTS.gitNetwork }
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}
function gitDeleteRemoteBranch(cwd, remote, branch) {
  execFileSync3("git", ["push", remote, "--delete", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitPush
  });
}
function readEnvVar(envPath, key) {
  if (!fs14.existsSync(envPath)) return void 0;
  const content = fs14.readFileSync(envPath, "utf-8");
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) return void 0;
  return match[1].trim().replace(/^["']|["']$/g, "");
}
function buildDsn(host, database, user, password) {
  const u = new URL(`postgresql://${host}:${POSTGRES_PORT}/${encodeURIComponent(database)}`);
  u.username = encodeURIComponent(user);
  u.password = encodeURIComponent(password);
  u.searchParams.set("sslmode", "require");
  return u.toString();
}
async function createPairedBranch(args) {
  const warnings = [];
  const sanitized = sanitizeBranchName(args.branch);
  const createGitBranch = args.createGitBranch !== false;
  const syncEnv = args.syncEnv !== false;
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const branch = await createBranch({
    instance: args.instance,
    branch: args.branch,
    parentBranch: args.parentBranch,
    ttl: args.ttl,
    noExpiry: args.noExpiry
  });
  let ready = branch;
  if (branch.state !== "READY") {
    try {
      ready = await waitForBranchReady({
        instance: args.instance,
        branch: sanitized,
        timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait
      });
    } catch (err) {
      warnings.push(
        `Lakebase branch created but did not reach READY: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  let gitBranchCreated = false;
  if (createGitBranch) {
    try {
      if (gitHasLocalBranch(args.cwd, sanitized)) {
        gitCheckoutExistingBranch(args.cwd, sanitized);
      } else {
        gitCheckoutNewBranch(args.cwd, sanitized);
        gitBranchCreated = true;
      }
    } catch (err) {
      warnings.push(
        `Failed to create/switch git branch "${sanitized}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  let envSynced = false;
  if (syncEnv && ready.state === "READY") {
    try {
      const ep = await getEndpoint({ instance: args.instance, branch: sanitized });
      if (!ep?.host) {
        warnings.push(`Endpoint not yet available for "${sanitized}" \u2013 .env not updated`);
      } else {
        const { token, email } = await mintCredential(endpointPath(args.instance, sanitized));
        const dsn = buildDsn(ep.host, database, email, token);
        const envPath = path13.join(args.cwd, ".env");
        updateEnvConnection({
          envPath,
          branchId: sanitized,
          databaseUrl: dsn,
          username: email,
          password: token,
          endpointHost: ep.host
        });
        await ensureProfilePinned({ envPath }).catch(() => void 0);
        envSynced = true;
      }
    } catch (err) {
      warnings.push(
        `.env sync failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return {
    branch: ready,
    gitBranch: sanitized,
    gitBranchCreated,
    envSynced,
    warnings
  };
}
async function deletePairedBranch(args) {
  const warnings = [];
  const sanitized = sanitizeBranchName(args.branch);
  const deleteGitLocal = args.deleteGitLocal !== false;
  const deleteGitRemote = args.deleteGitRemote !== false;
  const gitRemote = args.gitRemote ?? "origin";
  let lakebaseDeleted = false;
  try {
    await deleteBranch({ instance: args.instance, branch: sanitized });
    lakebaseDeleted = true;
  } catch (err) {
    warnings.push(
      `Lakebase delete failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  let gitLocalDeleted = false;
  if (deleteGitLocal) {
    try {
      const current = gitCurrentBranch(args.cwd);
      if (current === sanitized) {
        warnings.push(`Skipped local git delete: branch "${sanitized}" is currently checked out`);
      } else if (!gitHasLocalBranch(args.cwd, sanitized)) {
        gitLocalDeleted = true;
      } else {
        gitDeleteLocalBranch(args.cwd, sanitized, true);
        gitLocalDeleted = true;
      }
    } catch (err) {
      warnings.push(
        `Local git delete failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  let gitRemoteDeleted = false;
  if (deleteGitRemote) {
    try {
      if (gitHasRemoteBranch(args.cwd, gitRemote, sanitized)) {
        gitDeleteRemoteBranch(args.cwd, gitRemote, sanitized);
        gitRemoteDeleted = true;
      } else {
        gitRemoteDeleted = true;
      }
    } catch (err) {
      warnings.push(
        `Remote git delete failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return { lakebaseDeleted, gitLocalDeleted, gitRemoteDeleted, warnings };
}
async function syncEnvToCurrentBranch(args) {
  const envPath = path13.join(args.cwd, ".env");
  const instance = args.instance ?? readEnvVar(envPath, "LAKEBASE_PROJECT_ID");
  if (!instance) {
    throw new Error(
      `Could not resolve Lakebase instance id (set LAKEBASE_PROJECT_ID in .env or pass --instance)`
    );
  }
  const rawBranch = args.branch ?? gitCurrentBranch(args.cwd);
  const trunkAlias = args.trunkAlias?.trim();
  const isTrunk = trunkAlias && rawBranch === trunkAlias || !trunkAlias && (rawBranch === "main" || rawBranch === "master");
  let sanitized;
  if (isTrunk) {
    const lakebaseBranches = await listBranches({ instance });
    const def = lakebaseBranches.find((b) => b.isDefault);
    if (!def) {
      throw new Error(
        `Could not resolve default Lakebase branch for instance "${instance}"`
      );
    }
    sanitized = def.name.split("/branches/").pop() ?? def.uid;
  } else {
    sanitized = sanitizeBranchName(rawBranch);
  }
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const ep = await getEndpoint({ instance, branch: sanitized });
  if (!ep?.host) {
    throw new Error(
      `No endpoint host yet for branch "${sanitized}" in instance "${instance}" \u2013 branch may still be provisioning`
    );
  }
  const { token, email } = await getCredential({ instance, branch: sanitized });
  const dsn = buildDsn(ep.host, database, email, token);
  updateEnvConnection({
    envPath,
    branchId: sanitized,
    databaseUrl: dsn,
    username: email,
    password: token,
    endpointHost: ep.host
  });
  await ensureProfilePinned({ envPath }).catch(() => void 0);
  return { branchId: sanitized, endpointHost: ep.host, databaseUrl: dsn };
}
async function checkoutPaired(args) {
  const warnings = [];
  const envPath = path13.join(args.cwd, ".env");
  const instance = args.instance ?? readEnvVar(envPath, "LAKEBASE_PROJECT_ID");
  if (!instance) {
    throw new Error(
      `Could not resolve Lakebase instance (set LAKEBASE_PROJECT_ID in .env or pass --instance)`
    );
  }
  const rawBranch = args.branch ?? gitCurrentBranch(args.cwd);
  if (!rawBranch || rawBranch === "HEAD") {
    throw new Error(
      `Cannot resolve current git branch (detached HEAD or not a git repo at ${args.cwd})`
    );
  }
  const branchId = sanitizeBranchName(rawBranch);
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const previousBranch = args.previousBranch ?? readEnvVar(envPath, "LAKEBASE_BRANCH_ID") ?? "";
  const trunkAlias = args.trunkAlias?.trim();
  let mode = "feature";
  let lakebaseBranch = branchId;
  const isTrunkAlias = trunkAlias && rawBranch === trunkAlias;
  const isMainOrMaster = !trunkAlias && (rawBranch === "main" || rawBranch === "master");
  const lakebaseBranches = await listBranches({ instance });
  const tierMatch = isTier(rawBranch, lakebaseBranches);
  if (isTrunkAlias || isMainOrMaster) {
    mode = "trunk";
    const def = lakebaseBranches.find((b) => b.isDefault);
    if (!def) {
      throw new Error(
        `Could not resolve default Lakebase branch for instance "${instance}"`
      );
    }
    lakebaseBranch = def.name.split("/branches/").pop() ?? def.uid;
  } else if (tierMatch) {
    mode = "tier";
    lakebaseBranch = rawBranch;
  } else {
    let existing = await getBranchByName(branchId, { instance });
    if (!existing) {
      if (args.autoCreate !== false) {
        const parentBranch = await resolveFeatureParent({
          instance,
          target: branchId,
          baseBranch: args.baseBranch,
          previousBranch
        });
        const created = await createBranch({
          instance,
          branch: rawBranch,
          parentBranch
        });
        if (created.state !== "READY") {
          try {
            await waitForBranchReady({
              instance,
              branch: branchId,
              timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait
            });
          } catch (err) {
            warnings.push(
              `Lakebase branch created but did not reach READY: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
        existing = await getBranchByName(branchId, { instance });
        mode = "feature-created";
      } else {
        throw new Error(
          `Lakebase branch "${branchId}" does not exist and autoCreate=false`
        );
      }
    }
    lakebaseBranch = branchId;
  }
  const ep = await ensureEndpoint({
    instance,
    branch: lakebaseBranch,
    timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait
  });
  const { token, email } = await mintCredential(endpointPath(instance, lakebaseBranch));
  const dsn = buildDsn(ep.host, database, email, token);
  updateEnvConnection({
    envPath,
    branchId: lakebaseBranch,
    databaseUrl: dsn,
    username: email,
    password: token,
    endpointHost: ep.host
  });
  await ensureProfilePinned({ envPath }).catch(() => void 0);
  return {
    branchId,
    mode,
    matchedLakebaseBranch: lakebaseBranch,
    endpointHost: ep.host,
    databaseUrl: dsn,
    envUpdated: true,
    warnings
  };
}
async function resolveFeatureParent(args) {
  if (args.baseBranch) {
    return args.baseBranch;
  }
  if (args.previousBranch && args.previousBranch !== args.target) {
    const prev = await getBranchByName(args.previousBranch, { instance: args.instance });
    if (prev) {
      return args.previousBranch;
    }
  }
  return void 0;
}

// scripts/lakebase/convention-branches.ts
var CONVENTION_TIER_DEFAULTS = {
  feature: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.featureBranchTtlMs), parentBranch: "staging" },
  test: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.testBranchTtlMs), parentBranch: "staging" },
  uat: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.uatBranchTtlMs), parentBranch: "staging" },
  perf: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.perfBranchTtlMs), parentBranch: "staging" }
};
async function createFeatureBranch(args) {
  return createBranch({
    instance: args.instance,
    host: args.host,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.feature.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.feature.ttl,
    strictParent: args.strictParent
  });
}
async function createTestBranch(args) {
  return createBranch({
    instance: args.instance,
    host: args.host,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.test.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.test.ttl,
    strictParent: args.strictParent
  });
}
async function createUatBranch(args) {
  return createBranch({
    instance: args.instance,
    host: args.host,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.uat.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.uat.ttl,
    strictParent: args.strictParent
  });
}
async function createPerfBranch(args) {
  return createBranch({
    instance: args.instance,
    host: args.host,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.perf.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.perf.ttl,
    strictParent: args.strictParent
  });
}
async function createFeaturePairedBranch(args) {
  return createPairedBranch({
    instance: args.instance,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.feature.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.feature.ttl,
    cwd: args.cwd,
    createGitBranch: args.createGitBranch,
    syncEnv: args.syncEnv,
    readyTimeoutMs: args.readyTimeoutMs,
    database: args.database
  });
}
async function createTestPairedBranch(args) {
  return createPairedBranch({
    instance: args.instance,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.test.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.test.ttl,
    cwd: args.cwd,
    createGitBranch: args.createGitBranch,
    syncEnv: args.syncEnv,
    readyTimeoutMs: args.readyTimeoutMs,
    database: args.database
  });
}
async function createUatPairedBranch(args) {
  return createPairedBranch({
    instance: args.instance,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.uat.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.uat.ttl,
    cwd: args.cwd,
    createGitBranch: args.createGitBranch,
    syncEnv: args.syncEnv,
    readyTimeoutMs: args.readyTimeoutMs,
    database: args.database
  });
}
async function createPerfPairedBranch(args) {
  return createPairedBranch({
    instance: args.instance,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.perf.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.perf.ttl,
    cwd: args.cwd,
    createGitBranch: args.createGitBranch,
    syncEnv: args.syncEnv,
    readyTimeoutMs: args.readyTimeoutMs,
    database: args.database
  });
}

// scripts/lakebase/cut-backup.ts
async function cutBackup(args) {
  const backup = await createBranch({
    instance: args.instance,
    host: args.host,
    branch: args.backupName,
    parentBranch: args.sourceBranch,
    readyTimeoutMs: args.readyTimeoutMs,
    pollIntervalMs: args.pollIntervalMs,
    // Backups must outlive any ephemeral-branch expiration so the
    // rollback contract holds: if Lakebase auto-expired a backup
    // before the operator decided to roll back, the release flow
    // would have nothing to restore to.
    noExpiry: true
  });
  return {
    backup,
    sourceBranchName: backup.sourceBranchName ?? ""
  };
}

// scripts/lakebase/databricks-host.ts
async function resolveDatabricksHost(args) {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const out = await exec2(
    `databricks auth describe --profile "${escapeShellArg(args.profile)}" -o json`,
    { timeout: timeoutMs }
  );
  return parseHostFromAuthDescribe(out);
}
function parseHostFromAuthDescribe(out) {
  const start = out.indexOf("{");
  if (start < 0) return void 0;
  try {
    const parsed = JSON.parse(out.slice(start));
    const details = parsed.details;
    if (!details || typeof details !== "object") return void 0;
    const host = details.host;
    if (typeof host !== "string") return void 0;
    return host.replace(/\/+$/, "");
  } catch {
    return void 0;
  }
}
function escapeShellArg(s) {
  return s.replace(/"/g, '\\"');
}

// scripts/lakebase/deploy-app-endpoint.ts
import { spawn } from "child_process";

// scripts/lakebase/deploy-workspace-upload.ts
import { readdirSync as readdirSync6, statSync as statSync5 } from "fs";
import { join as join13, sep } from "path";
var DEFAULT_SKIP_DIRS = [
  "node_modules",
  ".git",
  "dist",
  ".tmp",
  ".vitest",
  ".venv-live-tests",
  ".tools-live-tests",
  ".venv",
  "coverage"
];
async function uploadDirectory(args) {
  const skipSet = new Set(args.skipDirs ?? DEFAULT_SKIP_DIRS);
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const createdDirs = /* @__PURE__ */ new Set();
  const errors = [];
  let filesUploaded = 0;
  const escape = (s) => s.replace(/"/g, '\\"');
  const ensureRemoteDir = async (remoteDir) => {
    if (createdDirs.has(remoteDir)) return;
    await exec2(
      `databricks workspace mkdirs "${escape(remoteDir)}" --profile "${escape(args.profile)}"`,
      { timeout: timeoutMs }
    );
    createdDirs.add(remoteDir);
  };
  await ensureRemoteDir(args.workspacePath);
  const uploadFile = async (localFile, relPath) => {
    const remotePath = `${args.workspacePath}/${relPath.split(sep).join("/")}`;
    const remoteDir = remotePath.substring(0, remotePath.lastIndexOf("/"));
    if (remoteDir !== args.workspacePath) {
      await ensureRemoteDir(remoteDir);
    }
    try {
      await exec2(
        `databricks workspace import "${escape(remotePath)}" --file "${escape(localFile)}" --format AUTO --overwrite --profile "${escape(args.profile)}"`,
        { timeout: timeoutMs }
      );
      filesUploaded++;
    } catch (err) {
      errors.push({ relPath, error: err.message });
    }
  };
  const walk = async (dirAbs, dirRel) => {
    for (const entry of readdirSync6(dirAbs)) {
      const childAbs = join13(dirAbs, entry);
      const childRel = dirRel ? `${dirRel}${sep}${entry}` : entry;
      const stat = statSync5(childAbs);
      if (stat.isDirectory()) {
        if (skipSet.has(entry)) continue;
        await walk(childAbs, childRel);
      } else if (stat.isFile()) {
        await uploadFile(childAbs, childRel);
      }
    }
  };
  await walk(args.localRoot, "");
  return {
    filesUploaded,
    dirsCreated: createdDirs.size - 1,
    // subtract the root we always create
    errors
  };
}

// scripts/lakebase/deploy-app-endpoint.ts
async function getAppEndpoint(args) {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  try {
    const stdout = await exec2(
      `databricks apps get "${escapeShellArg2(args.appName)}" --profile "${escapeShellArg2(args.profile)}" -o json`,
      { timeout: timeoutMs }
    );
    const info = JSON.parse(stdout);
    return {
      exists: true,
      url: typeof info.url === "string" ? info.url : void 0,
      info
    };
  } catch (err) {
    const msg = err.message;
    if (/RESOURCE_DOES_NOT_EXIST|does not exist or is deleted|App .* does not exist|status:? 404\b/i.test(msg)) {
      return { exists: false, url: void 0, info: void 0 };
    }
    throw err;
  }
}
async function deleteAppEndpoint(args) {
  const ignoreMissing = args.ignoreMissing !== false;
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  let appDeleted = false;
  let workspaceDeleted = false;
  let found = false;
  try {
    await exec2(
      `databricks apps delete "${escapeShellArg2(args.appName)}" --profile "${escapeShellArg2(args.profile)}"`,
      { timeout: timeoutMs }
    );
    appDeleted = true;
    found = true;
  } catch (err) {
    const msg = err.message;
    if (ignoreMissing && /RESOURCE_DOES_NOT_EXIST|does not exist or is deleted|App .* does not exist|status:? 404\b/i.test(msg)) {
      found = false;
    } else {
      throw err;
    }
  }
  if (args.workspacePath) {
    try {
      await exec2(
        `databricks workspace delete "${escapeShellArg2(args.workspacePath)}" --recursive --profile "${escapeShellArg2(args.profile)}"`,
        { timeout: timeoutMs }
      );
      workspaceDeleted = true;
    } catch (err) {
      const msg = err.message;
      if (!/RESOURCE_DOES_NOT_EXIST|does not exist or is deleted|App .* does not exist|status:? 404\b/i.test(msg)) {
        throw err;
      }
    }
  }
  return { appDeleted, workspaceDeleted, found };
}
async function ensureAppEndpoint(args) {
  const description = args.description ?? "Deployed by lakebase-app-dev-kit";
  const createTimeoutMs = args.createTimeoutMs ?? 12e5;
  const deployTimeoutMs = args.deployTimeoutMs ?? 6e5;
  const lookup = await getAppEndpoint({ appName: args.appName, profile: args.profile });
  let created = false;
  if (!lookup.exists) {
    await exec2(
      `databricks apps create "${escapeShellArg2(args.appName)}" --description "${escapeShellArg2(description)}" --profile "${escapeShellArg2(args.profile)}"`,
      { timeout: createTimeoutMs }
    );
    created = true;
  }
  const upload = await uploadDirectory({
    localRoot: args.workspaceRoot,
    workspacePath: args.workspacePath,
    profile: args.profile
  });
  const { ok, exitCode, stdout, stderr } = await runDeploy({
    appName: args.appName,
    workspacePath: args.workspacePath,
    profile: args.profile,
    timeoutMs: deployTimeoutMs
  });
  let url;
  try {
    const post = await getAppEndpoint({ appName: args.appName, profile: args.profile });
    url = post.url;
  } catch {
  }
  return {
    ok,
    url,
    created,
    upload,
    exitCode,
    deployStdout: stdout,
    deployStderr: stderr
  };
}
async function getCiAppEndpoint(args) {
  const appName = args.appName ?? deriveCiAppName(args.instance, args.branch);
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const profileFlag = args.profile ? ` --profile "${escapeShellArg2(args.profile)}"` : "";
  try {
    const stdout = await exec2(
      `databricks apps get "${escapeShellArg2(appName)}"${profileFlag} -o json`,
      { timeout: timeoutMs }
    );
    const info = JSON.parse(stdout);
    return {
      appName,
      exists: true,
      url: typeof info.url === "string" ? info.url : void 0
    };
  } catch (err) {
    const msg = err.message;
    if (/RESOURCE_DOES_NOT_EXIST|does not exist or is deleted|App .* does not exist|status:? 404\b/i.test(msg)) {
      return { appName, exists: false, url: void 0 };
    }
    throw err;
  }
}
function deriveCiAppName(instance, branch) {
  const raw = `${instance}-${branch}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return raw.slice(0, 26).replace(/-+$/, "");
}
function runDeploy(args) {
  return new Promise((resolve2, reject) => {
    const child = spawn(
      "databricks",
      [
        "apps",
        "deploy",
        args.appName,
        "--source-code-path",
        args.workspacePath,
        "--profile",
        args.profile
      ],
      { cwd: void 0 }
    );
    let stdout = "";
    let stderr = "";
    let timer;
    let settled = false;
    const finish = (cb) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      cb();
    };
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      finish(() => reject(new Error(`databricks apps deploy failed to start: ${err.message}`)));
    });
    child.on("close", (code) => {
      finish(() => resolve2({ ok: code === 0, exitCode: code, stdout, stderr }));
    });
    timer = setTimeout(() => {
      finish(() => {
        child.kill("SIGTERM");
        reject(new Error(`databricks apps deploy timed out after ${args.timeoutMs}ms`));
      });
    }, args.timeoutMs);
  });
}
function escapeShellArg2(s) {
  return s.replace(/"/g, '\\"');
}

// scripts/lakebase/deploy-app-yaml.ts
var DEFAULT_COMMAND = ["npm", "run", "start"];
var POSTGRES_VALUE_FROM_ENVS = [
  "PGHOST",
  "PGDATABASE",
  "PGUSER",
  "PGPORT",
  "PGSSLMODE",
  "LAKEBASE_ENDPOINT"
];
function generateAppYaml(target, options = {}) {
  const command = parseCommand(options.existing) ?? options.defaultCommand ?? DEFAULT_COMMAND;
  const env = buildEnvEntries(target);
  return formatAppYaml(command, env);
}
function buildEnvEntries(target) {
  const entries = [];
  for (const name of POSTGRES_VALUE_FROM_ENVS) {
    entries.push({ name, valueFrom: "postgres" });
  }
  entries.push({ name: "LAKEBASE_PROJECT_ID", value: target.lakebase_project });
  entries.push({ name: "LAKEBASE_BRANCH_ID", value: target.lakebase_branch });
  if (target.uc_catalog) entries.push({ name: "UC_CATALOG", value: target.uc_catalog });
  if (target.uc_schema) entries.push({ name: "UC_SCHEMA", value: target.uc_schema });
  if (target.uc_volume) entries.push({ name: "UC_VOLUME", value: target.uc_volume });
  if (target.lakebase_secret_scope) {
    entries.push({ name: "LAKEBASE_SECRET_SCOPE", value: target.lakebase_secret_scope });
  }
  if (target.lakebase_secret_key) {
    entries.push({ name: "LAKEBASE_SECRET_KEY", value: target.lakebase_secret_key });
  }
  if (target.ai_model) entries.push({ name: "AI_MODEL", value: target.ai_model });
  return entries;
}
function parseCommand(existing) {
  if (!existing) return void 0;
  const blockMatch = existing.match(/^command:\s*\n((?:[ \t]+-[ \t]+.+\n?)+)/m);
  if (blockMatch) {
    const parts = blockMatch[1].split("\n").map((line) => line.match(/^[ \t]+-[ \t]+(.+?)[ \t]*$/)?.[1]).filter((s) => typeof s === "string").map(unquote);
    if (parts.length > 0) return parts;
  }
  const flowMatch = existing.match(/^command:[ \t]*\[([^\]]+)\][ \t]*$/m);
  if (flowMatch) {
    return flowMatch[1].split(",").map((s) => unquote(s.trim()));
  }
  return void 0;
}
function unquote(s) {
  if (s.startsWith('"') && s.endsWith('"') || s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1);
  }
  return s;
}
function formatAppYaml(command, env) {
  const lines = [];
  lines.push("command:");
  for (const part of command) {
    lines.push(`  - ${quoteIfNeeded(part)}`);
  }
  lines.push("");
  lines.push("env:");
  for (const e of env) {
    lines.push(`  - name: ${e.name}`);
    if (e.valueFrom !== void 0) {
      lines.push(`    valueFrom: ${e.valueFrom}`);
    } else if (e.value !== void 0) {
      lines.push(`    value: "${escapeDoubleQuoted(e.value)}"`);
    }
  }
  return lines.join("\n") + "\n";
}
function quoteIfNeeded(s) {
  if (/[\s:#\[\]{},&*!|>'"%@`]/.test(s)) {
    return `"${escapeDoubleQuoted(s)}"`;
  }
  return s;
}
function escapeDoubleQuoted(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// scripts/lakebase/deploy-credentials.ts
async function getAppServicePrincipal(args) {
  const lookup = await getAppEndpoint({
    appName: args.appName,
    profile: args.profile,
    timeoutMs: args.timeoutMs
  });
  if (!lookup.exists || !lookup.info) {
    throw new Error(`App "${args.appName}" not found on profile "${args.profile}"`);
  }
  const info = lookup.info;
  const clientId = typeof info.service_principal_client_id === "string" && info.service_principal_client_id || typeof info.service_principal_id === "string" && info.service_principal_id || "";
  if (!clientId) return void 0;
  const name = typeof info.service_principal_name === "string" ? info.service_principal_name : void 0;
  return { clientId, name };
}
async function grantLakebasePermission(args) {
  const level = args.level ?? "CAN_MANAGE";
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const payload = JSON.stringify({
    access_control_list: [
      {
        service_principal_name: args.servicePrincipalName,
        permission_level: level
      }
    ]
  });
  await exec2(
    `databricks api patch "/api/2.0/permissions/database-projects/${escapeShellArg3(args.projectName)}" --profile "${escapeShellArg3(args.profile)}" --json '${escapeSingleQuoted(payload)}'`,
    { timeout: timeoutMs }
  );
  return { granted: true };
}
async function propagateCredentials(args) {
  const sp = await getAppServicePrincipal({
    appName: args.appName,
    profile: args.profile,
    timeoutMs: args.timeoutMs
  });
  if (!sp) {
    return { servicePrincipalClientId: void 0, lakebaseGranted: false };
  }
  await grantLakebasePermission({
    profile: args.profile,
    projectName: args.target.lakebase_project,
    servicePrincipalName: sp.clientId,
    level: args.level,
    timeoutMs: args.timeoutMs
  });
  return {
    servicePrincipalClientId: sp.clientId,
    lakebaseGranted: true
  };
}
function escapeShellArg3(s) {
  return s.replace(/"/g, '\\"');
}
function escapeSingleQuoted(s) {
  return s.replace(/'/g, `'\\''`);
}

// scripts/lakebase/deploy-rollback.ts
import { spawn as spawn2 } from "child_process";
async function listAppDeployments(args) {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const stdout = await exec2(
    `databricks apps list-deployments "${escapeShellArg4(args.appName)}" --profile "${escapeShellArg4(args.profile)}" -o json`,
    { timeout: timeoutMs }
  );
  const parsed = JSON.parse(stdout);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed;
    const arr = obj.app_deployments ?? obj.deployments ?? obj.items;
    if (Array.isArray(arr)) return arr;
  }
  return [];
}
async function rollbackDeploy(args) {
  const timeoutMs = args.timeoutMs ?? 6e5;
  const deployments = await listAppDeployments({
    profile: args.profile,
    appName: args.appName
  });
  let target;
  if (args.deploymentId) {
    target = deployments.find((d) => d.deployment_id === args.deploymentId);
    if (!target) {
      throw new Error(
        `Deployment "${args.deploymentId}" not found among ${deployments.length} deployments for app "${args.appName}"`
      );
    }
  } else {
    const succeeded = deployments.filter((d) => stateOf(d) === "SUCCEEDED");
    if (succeeded.length < 2) {
      throw new Error(
        `App "${args.appName}" has ${succeeded.length} succeeded deployment(s); need at least 2 to auto-rollback`
      );
    }
    target = succeeded[1];
  }
  const sourceCodePath = typeof target.source_code_path === "string" ? target.source_code_path : "";
  if (!sourceCodePath) {
    throw new Error(
      `Target deployment "${target.deployment_id}" has no source_code_path; cannot rollback`
    );
  }
  const toDeploymentId = typeof target.deployment_id === "string" ? target.deployment_id : "";
  const { ok, exitCode, stdout, stderr } = await runRollbackDeploy({
    appName: args.appName,
    sourceCodePath,
    profile: args.profile,
    timeoutMs
  });
  return {
    ok,
    toDeploymentId,
    sourceCodePath,
    exitCode,
    deployStdout: stdout,
    deployStderr: stderr
  };
}
function stateOf(d) {
  return (d.status?.state ?? d.state ?? "").toUpperCase();
}
function runRollbackDeploy(args) {
  return new Promise((resolve2, reject) => {
    const child = spawn2(
      "databricks",
      [
        "apps",
        "deploy",
        args.appName,
        "--source-code-path",
        args.sourceCodePath,
        "--profile",
        args.profile
      ],
      { cwd: void 0 }
    );
    let stdout = "";
    let stderr = "";
    let timer;
    let settled = false;
    const finish = (cb) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      cb();
    };
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      finish(() => reject(new Error(`databricks apps deploy (rollback) failed to start: ${err.message}`)));
    });
    child.on("close", (code) => {
      finish(() => resolve2({ ok: code === 0, exitCode: code, stdout, stderr }));
    });
    timer = setTimeout(() => {
      finish(() => {
        child.kill("SIGTERM");
        reject(new Error(`databricks apps deploy (rollback) timed out after ${args.timeoutMs}ms`));
      });
    }, args.timeoutMs);
  });
}
function escapeShellArg4(s) {
  return s.replace(/"/g, '\\"');
}

// scripts/lakebase/deploy-targets.ts
import { existsSync as existsSync13, readFileSync as readFileSync11, writeFileSync as writeFileSync9 } from "fs";
import { join as join14 } from "path";
var TARGETS_FILE = "deploy-targets.yaml";
var OPTIONAL_KEYS = [
  "uc_catalog",
  "uc_schema",
  "uc_volume",
  "lakebase_secret_scope",
  "lakebase_secret_key",
  "ai_model"
];
function readTargets(workspaceRoot) {
  const targetsFile = join14(workspaceRoot, TARGETS_FILE);
  if (!existsSync13(targetsFile)) return null;
  return parseTargetsYaml(readFileSync11(targetsFile, "utf-8"));
}
function writeTargets(config, workspaceRoot) {
  const targetsFile = join14(workspaceRoot, TARGETS_FILE);
  let yaml = "targets:\n";
  for (const [name, target] of Object.entries(config.targets)) {
    yaml += `  ${name}:
`;
    yaml += `    workspace_profile: ${target.workspace_profile}
`;
    yaml += `    workspace_path: ${target.workspace_path}
`;
    yaml += `    app_name: ${target.app_name}
`;
    yaml += `    lakebase_project: ${target.lakebase_project}
`;
    yaml += `    lakebase_branch: ${target.lakebase_branch}
`;
    for (const key of OPTIONAL_KEYS) {
      const v = target[key];
      if (v) yaml += `    ${key}: ${v}
`;
    }
  }
  writeFileSync9(targetsFile, yaml);
}
function parseTargetsYaml(content) {
  const targets = {};
  let currentTarget = null;
  for (const rawLine of content.split("\n")) {
    const trimmed = rawLine.trimEnd();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed === "targets:") continue;
    const targetMatch = trimmed.match(/^ {2}(\S+):$/);
    if (targetMatch) {
      currentTarget = targetMatch[1];
      targets[currentTarget] = {};
      continue;
    }
    const kvMatch = trimmed.match(/^ {4}(\S+):\s*"?([^"]*)"?\s*$/);
    if (kvMatch && currentTarget) {
      const key = kvMatch[1];
      targets[currentTarget][key] = kvMatch[2];
    }
  }
  return { targets };
}
function getTargetNames(workspaceRoot) {
  const config = readTargets(workspaceRoot);
  if (!config?.targets) return [];
  return Object.keys(config.targets);
}

// scripts/lakebase/deploy-validate.ts
import { spawn as spawn3 } from "child_process";
function validateApp(opts) {
  const timeoutMs = opts.timeoutMs ?? KIT_TIMEOUTS.cliLong;
  return new Promise((resolve2, reject) => {
    const child = spawn3(
      "databricks",
      ["apps", "validate", "--profile", opts.profile],
      { cwd: opts.workspaceRoot }
    );
    let stdout = "";
    let stderr = "";
    let timer;
    let settled = false;
    const finish = (cb) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      cb();
    };
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      finish(() => reject(new Error(`databricks apps validate failed to start: ${err.message}`)));
    });
    child.on("close", (code) => {
      finish(() => resolve2({
        ok: code === 0,
        exitCode: code,
        stdout,
        stderr
      }));
    });
    timer = setTimeout(() => {
      finish(() => {
        child.kill("SIGTERM");
        reject(new Error(`databricks apps validate timed out after ${timeoutMs}ms`));
      });
    }, timeoutMs);
  });
}

// scripts/lakebase/long-running-branch.ts
import * as cp4 from "child_process";
async function createLongRunningBranch(args) {
  const created = await createBranch({
    instance: args.projectId,
    branch: args.name,
    // Long-running tiers (staging, uat, perf, ...) are permanent by
    // definition; without this they'd inherit Lakebase's default
    // expiry and silently disappear.
    noExpiry: true
  });
  const opts = { cwd: args.workTreeDir, stdio: "pipe" };
  cp4.execSync(`git fetch origin ${args.forkFromBranch}`, opts);
  cp4.execSync(`git checkout ${args.forkFromBranch}`, opts);
  cp4.execSync(`git pull --ff-only origin ${args.forkFromBranch}`, opts);
  cp4.execSync(`git branch -f ${args.name} ${args.forkFromBranch}`, opts);
  cp4.execSync(`git push -u origin ${args.name}`, opts);
  cp4.execSync(`git checkout ${args.name}`, opts);
  return {
    lakebaseBranchName: created.name ?? `projects/${args.projectId}/branches/${args.name}`,
    gitBranch: args.name,
    lakebase: created
  };
}

// scripts/github/pr.ts
import { Octokit, RequestError } from "octokit";

// scripts/github/auth.ts
import { execFileSync as execFileSync4 } from "child_process";
var GITHUB_SCOPES = ["repo", "workflow", "delete_repo"];
async function resolveGitHubToken(scopes = GITHUB_SCOPES) {
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const fromVsCode = await tryVsCodeSession({ scopes });
  if (fromVsCode) return fromVsCode;
  const fromGh = tryGhAuthToken();
  if (fromGh) return fromGh;
  throw new Error(
    "No GitHub auth available. Set GITHUB_TOKEN, sign in to GitHub in VS Code, or run `gh auth login`."
  );
}
async function tryVsCodeSession(opts = {}) {
  const scopes = opts.scopes ?? GITHUB_SCOPES;
  try {
    const vscode = await import("vscode");
    if (!vscode?.authentication?.getSession) return void 0;
    const session = await vscode.authentication.getSession("github", [...scopes], {
      createIfNone: !!opts.createIfNone
    });
    return session?.accessToken;
  } catch {
    return void 0;
  }
}
function tryGhAuthToken() {
  try {
    const raw = execFileSync4("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5e3
    });
    const token = raw.trim();
    return token || void 0;
  } catch {
    return void 0;
  }
}

// scripts/util/parse-owner-repo.ts
function parseOwnerRepo(urlOrSlug) {
  const trimmed = urlOrSlug.trim().replace(/\.git$/, "");
  if (trimmed.includes("/")) {
    const slugMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+)/);
    if (slugMatch) {
      return { owner: slugMatch[1], repo: slugMatch[2] };
    }
    const parts = trimmed.split("/");
    if (parts.length >= 2) {
      return {
        owner: parts[parts.length - 2],
        repo: parts[parts.length - 1]
      };
    }
  }
  throw new Error(`Invalid GitHub repo reference: ${urlOrSlug}`);
}
function formatOwnerRepo(owner, repo) {
  return `${owner}/${repo}`;
}

// scripts/github/pr.ts
var GitHubPullRequestError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "GitHubPullRequestError";
  }
  status;
};
async function octokit() {
  const token = await resolveGitHubToken();
  return new Octokit({ auth: token });
}
function wrap(err, context) {
  if (err instanceof RequestError) {
    throw new GitHubPullRequestError(`${context}: ${err.message}`, err.status);
  }
  if (err instanceof Error) {
    throw new GitHubPullRequestError(`${context}: ${err.message}`);
  }
  throw new GitHubPullRequestError(context);
}
async function createPullRequest(args) {
  try {
    const { owner, repo } = parseOwnerRepo(args.ownerRepo);
    const ok = await octokit();
    let base = args.baseBranch;
    if (!base) {
      const { data: repoData } = await ok.rest.repos.get({ owner, repo });
      base = repoData.default_branch || "main";
    }
    const { data } = await ok.rest.pulls.create({
      owner,
      repo,
      title: args.title,
      head: args.headBranch,
      base,
      body: args.body
    });
    return data.html_url || "";
  } catch (err) {
    wrap(err, "Failed to create pull request");
  }
}
async function getPullRequest(ownerRepo, headBranch) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const ok = await octokit();
    const { data: pulls } = await ok.rest.pulls.list({
      owner,
      repo,
      state: "open",
      head: `${owner}:${headBranch}`,
      per_page: 1
    });
    if (pulls.length === 0) return void 0;
    const { data: pr } = await ok.rest.pulls.get({
      owner,
      repo,
      pull_number: pulls[0].number
    });
    if (pr.state !== "open") return void 0;
    let checks = [];
    let ciStatus = "pending";
    const headSha = pr.head?.sha;
    if (headSha) {
      try {
        const { data: checksData } = await ok.rest.checks.listForRef({
          owner,
          repo,
          ref: headSha
        });
        const runs = checksData.check_runs || [];
        checks = runs.map((c) => ({
          name: c.name || "unknown",
          status: (c.status || "").toUpperCase(),
          conclusion: (c.conclusion || "").toUpperCase(),
          detailsUrl: c.details_url || void 0
        }));
        ciStatus = parseCiStatus(runs);
      } catch {
        ciStatus = "pending";
      }
    }
    return {
      number: pr.number,
      title: pr.title,
      url: pr.html_url || "",
      state: (pr.state || "open").toUpperCase(),
      isDraft: pr.draft || false,
      ciStatus,
      checks,
      headBranch: pr.head?.ref || headBranch,
      baseBranch: pr.base?.ref || "",
      body: pr.body || void 0,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files
    };
  } catch {
    return void 0;
  }
}
function parseCiStatus(rawChecks) {
  if (rawChecks.length === 0) return "pending";
  const latestByName = /* @__PURE__ */ new Map();
  for (const c of rawChecks) {
    latestByName.set(c.name || "unknown", c);
  }
  const states = Array.from(latestByName.values()).map(
    (c) => (c.conclusion || c.status || "").toUpperCase()
  );
  if (states.some((s) => s === "FAILURE" || s === "ERROR" || s === "ACTION_REQUIRED")) {
    return "failure";
  }
  if (states.every((s) => s === "SUCCESS" || s === "NEUTRAL" || s === "SKIPPED")) {
    return "success";
  }
  return "pending";
}
async function mergePullRequest(args) {
  const method = args.method ?? "merge";
  const deleteRemoteBranch = args.deleteRemoteBranch !== false;
  try {
    const { owner, repo } = parseOwnerRepo(args.ownerRepo);
    const ok = await octokit();
    const { data } = await ok.rest.pulls.merge({
      owner,
      repo,
      pull_number: args.pullNumber,
      merge_method: method
    });
    if (deleteRemoteBranch) {
      try {
        const pr = await ok.rest.pulls.get({ owner, repo, pull_number: args.pullNumber });
        const headRef = pr.data.head.ref;
        await ok.rest.git.deleteRef({
          owner,
          repo,
          ref: `heads/${headRef}`
        });
      } catch {
      }
    }
    return data.message || `Merged PR #${args.pullNumber}`;
  } catch (err) {
    wrap(err, "Failed to merge pull request");
  }
}
async function listWorkflowRuns(ownerRepo, limit = 5) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const ok = await octokit();
    const { data } = await ok.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      per_page: limit
    });
    return (data.workflow_runs || []).map((r) => ({
      id: r.id,
      name: r.name || "",
      status: r.status || "",
      conclusion: r.conclusion || "",
      branch: r.head_branch || "",
      event: r.event || "",
      createdAt: r.created_at || void 0,
      updatedAt: r.updated_at || void 0
    }));
  } catch {
    return [];
  }
}
async function fastForwardBranch(args) {
  try {
    const { owner, repo } = parseOwnerRepo(args.ownerRepo);
    const ok = await octokit();
    let toSha;
    if (/^[a-f0-9]{40}$/i.test(args.toRef)) {
      toSha = args.toRef;
    } else {
      const { data } = await ok.rest.repos.getBranch({
        owner,
        repo,
        branch: args.toRef
      });
      toSha = data.commit.sha;
    }
    await ok.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${args.branch}`,
      sha: toSha,
      // We deliberately use a fast-forward (force=false). If `branch`
      // had diverged from `toRef`, the methodology was already broken
      // and silently overwriting that divergence would mask the bug.
      force: false
    });
  } catch (err) {
    wrap(err, `Failed to fast-forward ${args.branch} to ${args.toRef}`);
  }
}
async function mergePairedPullRequest(args) {
  const warnings = [];
  const deleteLakebaseBranch = args.deleteLakebaseBranch !== false;
  let headBranch = "";
  try {
    const { owner, repo } = parseOwnerRepo(args.ownerRepo);
    const ok = await octokit();
    const pr = await ok.rest.pulls.get({ owner, repo, pull_number: args.pullNumber });
    headBranch = pr.data.head?.ref ?? "";
  } catch (err) {
    warnings.push(
      `Could not read PR head branch before merge: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const message = await mergePullRequest({
    ownerRepo: args.ownerRepo,
    pullNumber: args.pullNumber,
    method: args.method,
    deleteRemoteBranch: args.deleteRemoteBranch
  });
  let lakebaseBranchDeleted = false;
  if (deleteLakebaseBranch && headBranch) {
    const sanitized = sanitizeBranchName(headBranch);
    try {
      await deleteBranch({ instance: args.lakebaseInstance, branch: sanitized });
      lakebaseBranchDeleted = true;
    } catch (err) {
      warnings.push(
        `Lakebase branch "${sanitized}" cleanup failed (PR merge succeeded): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else if (deleteLakebaseBranch && !headBranch) {
    warnings.push("Skipped Lakebase branch cleanup \u2013 could not resolve PR head branch name");
  }
  return { message, headBranch, lakebaseBranchDeleted, warnings };
}

// scripts/lakebase/release.ts
var DEFAULT_TIMEOUT_MS = 6e5;
var DEFAULT_POLL_INTERVAL_MS = 15e3;
function matchesWorkflowFile(run, workflowFile) {
  const stem = workflowFile.replace(/\.ya?ml$/i, "");
  return run.name === stem || run.name.toLowerCase() === stem.toLowerCase() || run.name.includes(stem);
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function release(args) {
  const workflowFile = args.workflowFile ?? "merge.yml";
  const prWorkflowFile = args.prWorkflowFile ?? "pr.yml";
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const prGateTimeoutMs = args.prGateTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = args.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const requireCiGate = args.requireCiGate ?? true;
  const before = await listWorkflowRuns(args.ownerRepo, 25);
  const mergeBaselineRunId = before.find((r) => matchesWorkflowFile(r, workflowFile))?.id ?? 0;
  const prBaselineRunId = before.find((r) => matchesWorkflowFile(r, prWorkflowFile))?.id ?? 0;
  const url = await createPullRequest({
    ownerRepo: args.ownerRepo,
    headBranch: args.from,
    baseBranch: args.to,
    title: `Release: ${args.from} \u2192 ${args.to} (${args.releaseLabel})`,
    body: `Automated release: promote \`${args.from}\` into \`${args.to}\`. Triggers ${workflowFile} on the ${args.to} push, which runs the substrate-routed lakebase-cut-backup + lakebase-schema-migrate apply against the ${args.to} Lakebase branch.`
  });
  const match = url.match(/\/pull\/(\d+)/);
  if (!match) {
    throw new Error(`Could not extract PR number from: ${url}`);
  }
  const prNumber = parseInt(match[1], 10);
  if (requireCiGate) {
    const prDeadline = Date.now() + prGateTimeoutMs;
    let prGatePassed = false;
    while (Date.now() < prDeadline && !prGatePassed) {
      try {
        const runs = await listWorkflowRuns(args.ownerRepo, 25);
        const candidate = runs.filter((r) => matchesWorkflowFile(r, prWorkflowFile)).filter((r) => r.id > prBaselineRunId).filter((r) => r.event === "pull_request").filter((r) => r.branch === args.from)[0];
        if (candidate && candidate.status === "completed") {
          if (candidate.conclusion !== "success") {
            throw new Error(
              `Release ${args.from} \u2192 ${args.to}: PR #${prNumber} ${prWorkflowFile} concluded with '${candidate.conclusion}'. Refusing to merge.`
            );
          }
          prGatePassed = true;
          break;
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("Refusing to merge")) {
          throw e;
        }
      }
      await sleep(pollIntervalMs);
    }
    if (!prGatePassed) {
      throw new Error(
        `Release ${args.from} \u2192 ${args.to}: ${prWorkflowFile} did not complete on PR #${prNumber} within ${prGateTimeoutMs / 1e3}s. Refusing to merge.`
      );
    }
  }
  await mergePullRequest({
    ownerRepo: args.ownerRepo,
    pullNumber: prNumber,
    method: "merge",
    deleteRemoteBranch: false
    // long-running source tiers are persistent
  });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const runs = await listWorkflowRuns(args.ownerRepo, 25);
      const matching = runs.filter((r) => matchesWorkflowFile(r, workflowFile));
      for (const run of matching) {
        if (run.id <= mergeBaselineRunId) continue;
        if (run.branch !== args.to) continue;
        if (run.event !== "push") continue;
        if (run.status === "completed") {
          if (run.conclusion === "success") {
            try {
              await fastForwardBranch({
                ownerRepo: args.ownerRepo,
                branch: args.from,
                toRef: args.to
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              console.warn(`release: fast-forward of ${args.from} to ${args.to} skipped (${msg})`);
            }
          }
          return {
            prNumber,
            workflowRun: run,
            conclusion: run.conclusion
          };
        }
        break;
      }
    } catch {
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(
    `Release ${args.from} \u2192 ${args.to}: ${workflowFile} did not complete on '${args.to}' push within ${timeoutMs / 1e3}s.`
  );
}

// scripts/lakebase/branch-schema.ts
import { Client as Client2 } from "pg";
var SCHEMA_QUERY = "SELECT c.table_name, c.column_name, c.data_type FROM information_schema.columns c JOIN pg_tables t ON c.table_name = t.tablename WHERE c.table_schema='public' AND t.schemaname='public' ORDER BY c.table_name, c.ordinal_position";
async function queryBranchSchema(args) {
  const branchId = await resolveBranchId({ instance: args.instance, branch: args.branch });
  const ep = await getEndpoint({ instance: args.instance, branch: branchId });
  if (!ep?.host) {
    return [];
  }
  const { token, email } = await mintCredential(endpointPath(args.instance, branchId));
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const skipFlyway = args.skipFlyway !== false;
  const client = new Client2({
    host: ep.host,
    port: POSTGRES_PORT,
    database,
    user: email,
    password: token,
    ssl: { rejectUnauthorized: false },
    // Lakebase managed cert
    connectionTimeoutMillis: KIT_TIMEOUTS.pgConnect,
    statement_timeout: KIT_TIMEOUTS.pgStatement
  });
  try {
    await client.connect();
    const result = await client.query(
      SCHEMA_QUERY
    );
    const tables = /* @__PURE__ */ new Map();
    for (const row of result.rows) {
      if (!row.table_name) continue;
      if (skipFlyway && row.table_name === "flyway_schema_history") continue;
      if (!tables.has(row.table_name)) {
        tables.set(row.table_name, []);
      }
      tables.get(row.table_name).push({ name: row.column_name, dataType: row.data_type });
    }
    return Array.from(tables.entries()).map(([name, columns]) => ({ name, columns }));
  } finally {
    try {
      await client.end();
    } catch {
    }
  }
}
async function queryBranchTables(args) {
  const schema = await queryBranchSchema(args);
  return schema.map((t) => t.name);
}

// scripts/lakebase/create-project.ts
import * as fs18 from "fs";
import * as path17 from "path";
import { spawnSync } from "child_process";

// scripts/lakebase/project-verify.ts
import * as fs15 from "fs";
import * as path14 from "path";
function verifyHooks(projectDir) {
  const hooksDir = path14.join(projectDir, ".git", "hooks");
  return {
    postCheckout: fs15.existsSync(path14.join(hooksDir, "post-checkout")),
    prepareCommitMsg: fs15.existsSync(path14.join(hooksDir, "prepare-commit-msg")),
    prePush: fs15.existsSync(path14.join(hooksDir, "pre-push"))
  };
}
function verifyWorkflows(projectDir) {
  const wfDir = path14.join(projectDir, ".github", "workflows");
  return {
    pr: fs15.existsSync(path14.join(wfDir, "pr.yml")),
    merge: fs15.existsSync(path14.join(wfDir, "merge.yml"))
  };
}
function verifyProject(projectDir) {
  const hooks = verifyHooks(projectDir);
  const workflows = verifyWorkflows(projectDir);
  const warnings = [];
  if (!hooks.postCheckout || !hooks.prepareCommitMsg || !hooks.prePush) {
    warnings.push("Some git hooks not installed (post-checkout / prepare-commit-msg / pre-push)");
  }
  if (!workflows.pr || !workflows.merge) {
    warnings.push("Some GitHub Actions workflows missing (pr.yml / merge.yml)");
  }
  return { hooks, workflows, warnings };
}

// scripts/github/repo.ts
import { Octokit as Octokit2, RequestError as RequestError2 } from "octokit";
var GitHubRepoError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "GitHubRepoError";
    this.status = status;
  }
};
async function newContext() {
  const token = await resolveGitHubToken();
  return { octokit: new Octokit2({ auth: token }) };
}
function wrap2(err, context) {
  if (err instanceof RequestError2) {
    throw new GitHubRepoError(`${context}: ${err.message}`, err.status);
  }
  if (err instanceof Error) {
    throw new GitHubRepoError(`${context}: ${err.message}`);
  }
  throw new GitHubRepoError(context);
}
async function getLogin(ctx) {
  if (!ctx.loginPromise) {
    ctx.loginPromise = ctx.octokit.rest.users.getAuthenticated().then(({ data }) => data.login);
  }
  return ctx.loginPromise;
}
async function getCurrentUser() {
  try {
    const ctx = await newContext();
    return await getLogin(ctx);
  } catch (err) {
    wrap2(err, "GitHub authentication failed");
  }
}
async function createRepo(name, opts = {}) {
  try {
    const ctx = await newContext();
    const isPrivate = opts.private !== false;
    const description = opts.description;
    if (name.includes("/")) {
      const { owner, repo } = parseOwnerRepo(name);
      const login = await getLogin(ctx);
      let data2;
      if (owner.toLowerCase() === login.toLowerCase()) {
        ({ data: data2 } = await ctx.octokit.rest.repos.createForAuthenticatedUser({
          name: repo,
          private: isPrivate,
          description
        }));
      } else {
        ({ data: data2 } = await ctx.octokit.rest.repos.createInOrg({
          org: owner,
          name: repo,
          private: isPrivate,
          description
        }));
      }
      return data2.html_url || `https://github.com/${formatOwnerRepo(owner, repo)}`;
    }
    const { data } = await ctx.octokit.rest.repos.createForAuthenticatedUser({
      name,
      private: isPrivate,
      description
    });
    return data.html_url || `https://github.com/${data.full_name}`;
  } catch (err) {
    wrap2(err, `Failed to create repository "${name}"`);
  }
}
async function getRepoFullName(name) {
  try {
    const { owner, repo } = parseOwnerRepo(name);
    const ctx = await newContext();
    const { data } = await ctx.octokit.rest.repos.get({ owner, repo });
    return data.full_name || formatOwnerRepo(owner, repo);
  } catch (err) {
    wrap2(err, `Repository "${name}" is not visible`);
  }
}

// scripts/git/clone.ts
async function cloneRepo(args) {
  await exec2(`git clone ${shq(args.repoUrl)}`, {
    cwd: args.parentDir,
    timeout: args.timeoutMs ?? 6e4
  });
}

// scripts/git/init.ts
async function gitInit(projectDir) {
  await exec2("git init -b main", { cwd: projectDir, timeout: 15e3 });
}

// scripts/git/commit-push.ts
var WorkflowScopeError = class extends Error {
  constructor(projectDir) {
    super(
      `Push rejected: GitHub token lacks the \`workflow\` OAuth scope required for commits touching \`.github/workflows/*\`. The project on disk is fine; only the initial push failed.

To finish:
  1. Re-sign in to GitHub in VS Code and grant the workflow scope (or set      GITHUB_TOKEN to a token with workflow scope)
  2. Then from the project dir:  cd ${projectDir} && git push -u origin main`
    );
    this.name = "WorkflowScopeError";
  }
};
async function commitAndPush(args) {
  await exec2("git add -A", { cwd: args.projectDir });
  await exec2(`git commit -m ${JSON.stringify(args.message)}`, {
    cwd: args.projectDir,
    timeout: 3e4
  });
  if (args.push === false) return;
  const remote = args.remote ?? "origin";
  const branch = args.branch ?? "main";
  try {
    await exec2(`git push -u ${remote} ${branch}`, {
      cwd: args.projectDir,
      timeout: 3e4
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/without `?workflow`? scope|workflow scope/i.test(msg)) {
      throw new WorkflowScopeError(args.projectDir);
    }
    throw err;
  }
}

// scripts/lakebase/runner-setup.ts
import * as fs16 from "fs";
import * as os from "os";
import * as path15 from "path";
import * as cp5 from "child_process";
import * as tar from "tar";
import findJavaHome from "find-java-home";
import treeKill from "tree-kill";

// scripts/github/runner.ts
import { Octokit as Octokit3, RequestError as RequestError3 } from "octokit";
var GitHubRunnerError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "GitHubRunnerError";
    this.status = status;
  }
};
async function getOctokit() {
  const token = await resolveGitHubToken();
  return new Octokit3({ auth: token });
}
function wrap3(err, context) {
  if (err instanceof RequestError3) {
    throw new GitHubRunnerError(`${context}: ${err.message}`, err.status);
  }
  if (err instanceof Error) {
    throw new GitHubRunnerError(`${context}: ${err.message}`);
  }
  throw new GitHubRunnerError(context);
}
async function createRegistrationToken(ownerRepo) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const octokit2 = await getOctokit();
    const { data } = await octokit2.rest.actions.createRegistrationTokenForRepo({ owner, repo });
    if (!data.token) {
      throw new GitHubRunnerError("Registration token missing from GitHub response");
    }
    return data.token;
  } catch (err) {
    if (err instanceof GitHubRunnerError) throw err;
    if (err instanceof RequestError3 && err.status === 404) {
      throw new GitHubRunnerError(
        `GitHub returned 404 for "${ownerRepo}". The signed-in user can't see this repo \u2013 it's likely private and owned by a different account. Sign in to GitHub as the repo owner (or set GITHUB_TOKEN to a token with access) and retry.`,
        404
      );
    }
    wrap3(err, "Failed to create runner registration token");
  }
}
async function listRepoRunners(ownerRepo) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const octokit2 = await getOctokit();
    const { data } = await octokit2.rest.actions.listSelfHostedRunnersForRepo({ owner, repo });
    return (data.runners ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status
    }));
  } catch (err) {
    wrap3(err, `Failed to list runners for "${ownerRepo}"`);
  }
}
async function getRunnerIdByName(ownerRepo, runnerName2) {
  const runners = await listRepoRunners(ownerRepo);
  return runners.find((r) => r.name === runnerName2)?.id;
}
async function getRunnerStatus(ownerRepo, runnerName2) {
  const runners = await listRepoRunners(ownerRepo);
  return runners.find((r) => r.name === runnerName2)?.status;
}
async function deleteRunner(ownerRepo, runnerId) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const octokit2 = await getOctokit();
    await octokit2.rest.actions.deleteSelfHostedRunnerFromRepo({ owner, repo, runner_id: runnerId });
  } catch {
  }
}

// scripts/lakebase/runner-setup.ts
var RUNNER_VERSION = "2.333.1";
var RUNNER_ARCH = process.arch === "arm64" ? "arm64" : "x64";
var RUNNER_OS = process.platform === "darwin" ? "osx" : "linux";
var RUNNER_ARCHIVE = `actions-runner-${RUNNER_OS}-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz`;
var RUNNER_URL = `https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_ARCHIVE}`;
function cacheDir() {
  return path15.join(os.homedir(), ".cache", "github-actions-runner");
}
function runnersDir() {
  return path15.join(os.homedir(), ".lakebase", "runners");
}
function runnerDir(projectName) {
  return path15.join(runnersDir(), projectName);
}
function runnerName(projectName) {
  return `lakebase-${projectName}`;
}
async function ensureCachedArchive() {
  const dir = cacheDir();
  fs16.mkdirSync(dir, { recursive: true });
  const cachedPath = path15.join(dir, RUNNER_ARCHIVE);
  if (fs16.existsSync(cachedPath)) return cachedPath;
  const response = await fetch(RUNNER_URL);
  if (!response.ok) {
    throw new Error(`Failed to download runner: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs16.writeFileSync(cachedPath, buffer);
  return cachedPath;
}
async function resolveJavaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  return new Promise((resolve2) => {
    findJavaHome((err, javaHome) => resolve2(err ? void 0 : javaHome));
  });
}
function isRunning(projectName) {
  const pidFile = path15.join(runnerDir(projectName), ".pid");
  if (!fs16.existsSync(pidFile)) return false;
  const pid = parseInt(fs16.readFileSync(pidFile, "utf-8").trim(), 10);
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function getRunnerInfo(projectName) {
  const dir = runnerDir(projectName);
  if (!fs16.existsSync(dir)) return void 0;
  const pidFile = path15.join(dir, ".pid");
  let pid;
  if (fs16.existsSync(pidFile)) {
    pid = parseInt(fs16.readFileSync(pidFile, "utf-8").trim(), 10);
  }
  return { name: runnerName(projectName), dir, pid, online: isRunning(projectName) };
}
var lastRunnerPid;
function stopRunner(projectName) {
  const dir = runnerDir(projectName);
  const pidFile = path15.join(dir, ".pid");
  let pid = lastRunnerPid;
  if (fs16.existsSync(pidFile)) {
    pid = parseInt(fs16.readFileSync(pidFile, "utf-8").trim(), 10);
    try {
      fs16.unlinkSync(pidFile);
    } catch {
    }
  }
  if (pid) {
    try {
      treeKill(pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
      }
    }
  } else if (fs16.existsSync(dir)) {
    try {
      cp5.execSync(`pkill -9 -f "${dir.replace(/\//g, "\\/")}.*Runner" 2>/dev/null || true`, {
        timeout: KIT_TIMEOUTS.cmdShort
      });
    } catch {
    }
  }
  lastRunnerPid = void 0;
  for (const stale of ["_diag/pages", "_work/_temp", "_work/_actions"]) {
    const full = path15.join(dir, stale);
    if (fs16.existsSync(full)) {
      try {
        fs16.rmSync(full, { recursive: true, force: true });
      } catch {
      }
    }
  }
  try {
    fs16.mkdirSync(path15.join(dir, "_diag", "pages"), { recursive: true });
  } catch {
  }
}
function resetRunnerConfig(dir, projectName) {
  const stateFiles = [
    ".runner",
    ".credentials",
    ".credentials_rsaparams",
    ".path",
    ".service",
    "svc.sh",
    ".runner_migrated"
  ];
  for (const f of stateFiles) {
    try {
      fs16.unlinkSync(path15.join(dir, f));
    } catch {
    }
  }
  if (process.platform === "darwin") {
    const plist = path15.join(
      os.homedir(),
      "Library",
      "LaunchAgents",
      `actions.runner.${projectName}.plist`
    );
    if (fs16.existsSync(plist)) {
      try {
        cp5.execFileSync("launchctl", ["unload", plist], { stdio: "ignore" });
      } catch {
      }
      try {
        fs16.unlinkSync(plist);
      } catch {
      }
    }
  }
}
async function setupRunner(args) {
  const report = args.report ?? (() => {
  });
  const dir = runnerDir(args.projectName);
  const name = runnerName(args.projectName);
  stopRunner(args.projectName);
  report("Downloading runner binary...");
  const archive = await ensureCachedArchive();
  fs16.mkdirSync(dir, { recursive: true });
  if (!fs16.existsSync(path15.join(dir, "config.sh"))) {
    report("Extracting runner...");
    await tar.extract({ file: archive, cwd: dir });
  }
  const diagPages = path15.join(dir, "_diag", "pages");
  if (fs16.existsSync(diagPages)) {
    fs16.rmSync(diagPages, { recursive: true, force: true });
    fs16.mkdirSync(diagPages, { recursive: true });
  }
  const runnerFile = path15.join(dir, ".runner");
  let needsConfig = !fs16.existsSync(runnerFile);
  if (needsConfig) {
    resetRunnerConfig(dir, args.projectName);
  } else {
    let urlMismatch = false;
    try {
      const runnerJson = JSON.parse(fs16.readFileSync(runnerFile, "utf-8"));
      const configuredUrl = runnerJson.gitHubUrl || runnerJson.serverUrl || runnerJson.agentUrl || "";
      const expectedUrl = `https://github.com/${args.fullRepoName}`;
      urlMismatch = !!configuredUrl && !configuredUrl.startsWith(expectedUrl);
    } catch {
      urlMismatch = true;
    }
    if (urlMismatch) {
      report("Runner configured against a different repo \u2013 resetting...");
      resetRunnerConfig(dir, args.projectName);
      needsConfig = true;
    } else {
      try {
        const id = await getRunnerIdByName(args.fullRepoName, name);
        if (!id) {
          report("Runner registration stale \u2013 reconfiguring...");
          resetRunnerConfig(dir, args.projectName);
          needsConfig = true;
        } else {
          report("Runner already configured \u2013 restarting...");
        }
      } catch {
        report("Could not verify runner \u2013 reconfiguring...");
        resetRunnerConfig(dir, args.projectName);
        needsConfig = true;
      }
    }
  }
  if (needsConfig) {
    report("Registering runner with GitHub...");
    const regToken = await createRegistrationToken(args.fullRepoName);
    cp5.execSync(
      `./config.sh --url "https://github.com/${args.fullRepoName}" --token "${regToken}" --name "${name}" --labels self-hosted --unattended --replace`,
      { cwd: dir, timeout: KIT_TIMEOUTS.cliLong }
    );
  }
  report("Starting runner...");
  const env = { ...process.env };
  const javaHome = await resolveJavaHome();
  if (javaHome && !env.JAVA_HOME) env.JAVA_HOME = javaHome;
  const child = cp5.spawn("./run.sh", [], {
    cwd: dir,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env
  });
  child.unref();
  lastRunnerPid = child.pid;
  if (child.pid) {
    fs16.writeFileSync(path15.join(dir, ".pid"), String(child.pid));
  }
  report("Waiting for runner to come online...");
  let online = false;
  for (let i = 0; i < 12; i++) {
    try {
      const status = await getRunnerStatus(args.fullRepoName, name);
      if (status === "online") {
        online = true;
        break;
      }
    } catch {
    }
    await delay(5e3);
  }
  if (!online) {
    throw new Error(`Runner "${name}" did not come online within 60 seconds`);
  }
  report("Runner is online.");
  return { name, dir, pid: child.pid, online: true };
}
async function removeRunner(args) {
  const dir = runnerDir(args.projectName);
  const name = runnerName(args.projectName);
  stopRunner(args.projectName);
  await delay(2e3);
  try {
    const id = await getRunnerIdByName(args.fullRepoName, name);
    if (id) await deleteRunner(args.fullRepoName, id);
  } catch {
  }
  try {
    fs16.rmSync(dir, { recursive: true, force: true });
  } catch {
  }
}

// scripts/github/secrets.ts
import { Octokit as Octokit4, RequestError as RequestError4 } from "octokit";
import sodium from "tweetsodium";
var GitHubSecretsError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "GitHubSecretsError";
    this.status = status;
  }
};
async function getOctokit2() {
  const token = await resolveGitHubToken();
  return new Octokit4({ auth: token });
}
function wrap4(err, context) {
  if (err instanceof RequestError4) {
    throw new GitHubSecretsError(`${context}: ${err.message}`, err.status);
  }
  if (err instanceof Error) {
    throw new GitHubSecretsError(`${context}: ${err.message}`);
  }
  throw new GitHubSecretsError(context);
}
function encryptSecret(publicKey, secretValue) {
  const keyBytes = Buffer.from(publicKey, "base64");
  const messageBytes = Buffer.from(secretValue);
  const encryptedBytes = sodium.seal(messageBytes, keyBytes);
  return Buffer.from(encryptedBytes).toString("base64");
}
async function setRepoSecret(ownerRepo, secretName, secretValue) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const octokit2 = await getOctokit2();
    const { data: keyData } = await octokit2.rest.actions.getRepoPublicKey({ owner, repo });
    const encryptedValue = encryptSecret(keyData.key, secretValue);
    await octokit2.rest.actions.createOrUpdateRepoSecret({
      owner,
      repo,
      secret_name: secretName,
      encrypted_value: encryptedValue,
      key_id: keyData.key_id
    });
  } catch (err) {
    if (err instanceof GitHubSecretsError) throw err;
    wrap4(err, `Failed to set secret ${secretName} on ${ownerRepo}`);
  }
}
async function setRepoSecrets(ownerRepo, secrets) {
  for (const [name, value] of Object.entries(secrets)) {
    if (!value) {
      throw new GitHubSecretsError(`Missing value for secret ${name}`);
    }
  }
  for (const [name, value] of Object.entries(secrets)) {
    await setRepoSecret(ownerRepo, name, value);
  }
}

// scripts/git/remote.ts
async function getGitHubUrl(cwd) {
  try {
    const url = (await exec2("git remote get-url origin", { cwd, timeout: 5e3 })).trim();
    return url.replace(/\.git$/, "").replace(/^git@github\.com:/, "https://github.com/").replace(/^ssh:\/\/git@github\.com\//, "https://github.com/");
  } catch {
    return "";
  }
}
async function getOwnerRepo(cwd) {
  const url = await getGitHubUrl(cwd);
  if (!url) return "";
  try {
    const { owner, repo } = parseOwnerRepo(url);
    return formatOwnerRepo(owner, repo);
  } catch {
    return "";
  }
}

// scripts/util/ci-secrets.ts
async function syncCiSecrets(args) {
  const lifetime = args.lifetimeSeconds ?? 86400;
  const comment = args.comment ?? "GitHub Actions CI";
  const ownerRepo = args.ownerRepo ?? await getOwnerRepo(args.projectDir);
  if (!ownerRepo) {
    throw new Error("Could not resolve GitHub repository from git remote");
  }
  if (!args.databricksHost) {
    throw new Error("syncCiSecrets: databricksHost is required");
  }
  if (!args.lakebaseProjectId) {
    throw new Error("syncCiSecrets: lakebaseProjectId is required");
  }
  const secrets = {
    DATABRICKS_HOST: args.databricksHost,
    LAKEBASE_PROJECT_ID: args.lakebaseProjectId
  };
  try {
    const tokenRaw = await exec2(
      `databricks tokens create --comment "${comment}" --lifetime-seconds ${lifetime} -o json`,
      { cwd: args.projectDir, timeout: 3e4, env: { DATABRICKS_HOST: args.databricksHost } }
    );
    const parsed = JSON.parse(tokenRaw);
    const token = parsed.token_value || parsed.token || "";
    if (token) secrets.DATABRICKS_TOKEN = token;
  } catch {
  }
  await setRepoSecrets(ownerRepo, secrets);
}

// scripts/lakebase/scm-workflow-state.ts
import * as fs17 from "fs";
import * as path16 from "path";
var SCM_STATES = [
  "scaffold-complete",
  "feature-claimed",
  "pr-ready",
  "ci-green",
  "merged"
];
var STATE_INDEX = SCM_STATES.reduce(
  (acc, s, i) => ({ ...acc, [s]: i }),
  {}
);
var STATE_FILE_REL = ".lakebase/workflow-state.json";
function stateFilePath(projectDir) {
  return path16.join(projectDir, STATE_FILE_REL);
}
function readWorkflowState(projectDir) {
  const p = stateFilePath(projectDir);
  if (!fs17.existsSync(p)) return null;
  const raw = fs17.readFileSync(p, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Failed to parse ${STATE_FILE_REL}: ${e.message}`
    );
  }
  const result = validateWorkflowState(parsed);
  if (!result.ok) {
    const summary = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");
    throw new Error(
      `Invalid ${STATE_FILE_REL}:
${summary}

Fix the file or delete it to re-init.`
    );
  }
  return result.value;
}
function writeWorkflowState(projectDir, state) {
  const result = validateWorkflowState(state);
  if (!result.ok) {
    const summary = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Refusing to write invalid SCM state:
${summary}`);
  }
  const dir = path16.join(projectDir, ".lakebase");
  fs17.mkdirSync(dir, { recursive: true });
  const target = stateFilePath(projectDir);
  const tmp = `${target}.tmp`;
  const ordered = orderForOutput(result.value);
  fs17.writeFileSync(tmp, `${JSON.stringify(ordered, null, 2)}
`, "utf8");
  fs17.renameSync(tmp, target);
}
function initWorkflowState(args) {
  return {
    $schema: "./scm-workflow-state.schema.json",
    version: 1,
    state: "scaffold-complete",
    tier_topology: args.tierTopology,
    project_id: args.projectId
  };
}
function validateWorkflowState(value) {
  const errors = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      errors: [{ path: "$", message: "must be an object" }]
    };
  }
  const v = value;
  if (v.version !== 1) {
    errors.push({ path: "version", message: `must be 1, got ${String(v.version)}` });
  }
  if (typeof v.state !== "string" || !SCM_STATES.includes(v.state)) {
    errors.push({
      path: "state",
      message: `must be one of ${SCM_STATES.join(" | ")}`
    });
  }
  if (v.tier_topology !== 1 && v.tier_topology !== 2 && v.tier_topology !== 3) {
    errors.push({
      path: "tier_topology",
      message: "must be 1, 2, or 3"
    });
  }
  if (typeof v.project_id !== "string" || v.project_id.length === 0) {
    errors.push({
      path: "project_id",
      message: "must be a non-empty string"
    });
  }
  const stringFields = [
    "feature_id",
    "branch",
    "parent_branch",
    "lakebase_branch_uid",
    "claimed_at",
    "pr_url",
    "pushed_at",
    "ci_run_url",
    "ci_green_at",
    "merged_at",
    "migrate_run_url",
    "migrate_completed_at",
    "$schema"
  ];
  for (const key of stringFields) {
    if (v[key] === void 0) continue;
    if (typeof v[key] !== "string" || v[key].length === 0) {
      errors.push({
        path: key,
        message: "must be a non-empty string when present"
      });
    }
  }
  const requiredForState = {
    "scaffold-complete": [],
    "feature-claimed": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at"
    ],
    "pr-ready": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at"
    ],
    "ci-green": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at",
      "ci_run_url",
      "ci_green_at"
    ],
    merged: [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at",
      "ci_run_url",
      "ci_green_at",
      "merged_at"
    ]
  };
  if (typeof v.state === "string" && SCM_STATES.includes(v.state)) {
    for (const key of requiredForState[v.state]) {
      if (v[key] === void 0) {
        errors.push({
          path: key,
          message: `required when state is "${v.state}"`
        });
      }
    }
  }
  const allowedKeys = /* @__PURE__ */ new Set([
    "$schema",
    "version",
    "state",
    "tier_topology",
    "project_id",
    "feature_id",
    "branch",
    "parent_branch",
    "lakebase_branch_uid",
    "claimed_at",
    "pr_url",
    "pushed_at",
    "ci_run_url",
    "ci_green_at",
    "merged_at",
    "migrate_run_url",
    "migrate_completed_at"
  ]);
  for (const key of Object.keys(v)) {
    if (!allowedKeys.has(key)) {
      errors.push({ path: key, message: "unknown property" });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: v };
}
function describeGates(state) {
  const currentIdx = STATE_INDEX[state.state];
  return SCM_STATES.map((name) => {
    const idx = STATE_INDEX[name];
    return {
      name,
      passed: idx <= currentIdx,
      current: name === state.state,
      invariants: invariantsForState(state, name)
    };
  });
}
function invariantsForState(state, forState) {
  const inv = [];
  const addIf = (cond, key) => {
    if (!cond) return;
    const raw = state[key];
    inv.push({
      key: String(key),
      present: raw !== void 0,
      value: typeof raw === "string" ? raw : void 0
    });
  };
  if (forState === "scaffold-complete") {
    addIf(true, "project_id");
    addIf(true, "tier_topology");
  }
  if (forState === "feature-claimed") {
    addIf(true, "feature_id");
    addIf(true, "branch");
    addIf(true, "parent_branch");
    addIf(true, "lakebase_branch_uid");
    addIf(true, "claimed_at");
  }
  if (forState === "pr-ready") {
    addIf(true, "pr_url");
    addIf(true, "pushed_at");
  }
  if (forState === "ci-green") {
    addIf(true, "ci_run_url");
    addIf(true, "ci_green_at");
  }
  if (forState === "merged") {
    addIf(true, "merged_at");
  }
  return inv;
}
function orderForOutput(state) {
  const keyOrder = [
    "$schema",
    "version",
    "state",
    "tier_topology",
    "project_id",
    "feature_id",
    "branch",
    "parent_branch",
    "lakebase_branch_uid",
    "claimed_at",
    "pr_url",
    "pushed_at",
    "ci_run_url",
    "ci_green_at",
    "merged_at",
    "migrate_run_url",
    "migrate_completed_at"
  ];
  const out = {};
  for (const k of keyOrder) {
    if (state[k] !== void 0) {
      out[k] = state[k];
    }
  }
  return out;
}

// scripts/tdd/agent-models.ts
import { existsSync as existsSync17, readFileSync as readFileSync14, writeFileSync as writeFileSync12, mkdirSync as mkdirSync10 } from "fs";
import { dirname as dirname7, join as join18 } from "path";
var RECOMMENDED_MODELS = {
  "spec-author": "opus",
  "architect-reviewer": "opus",
  "test-strategist": "sonnet",
  "ux-designer": "sonnet",
  navigator: "sonnet",
  driver: "sonnet",
  "product-owner": "opus",
  "release-engineer": "sonnet"
};
var ALL_AGENT_ROLES = Object.keys(RECOMMENDED_MODELS);
var AGENT_CONFIG_REL = join18(".lakebase", "agent-config.json");
function buildAgentConfig(overrides) {
  const roles = {};
  for (const role of ALL_AGENT_ROLES) {
    const recommended = RECOMMENDED_MODELS[role];
    const ov = overrides?.[role];
    const entry = { recommended };
    if (ov && ov !== recommended) entry.override = ov;
    roles[role] = entry;
  }
  return { version: 1, roles };
}
function writeAgentConfig(projectDir, config) {
  const p = join18(projectDir, AGENT_CONFIG_REL);
  mkdirSync10(dirname7(p), { recursive: true });
  writeFileSync12(p, JSON.stringify(config, null, 2) + "\n");
}

// scripts/lakebase/create-project.ts
async function createProject(input, progress) {
  const report = progress ?? (() => {
  });
  const projectDir = path17.join(input.parentDir, input.projectName);
  const lakebaseProjectId = input.projectName;
  const host = input.databricksHost.replace(/\/+$/, "");
  const useGithub = input.createGithubRepo !== false;
  const language = input.language ?? "java";
  const runnerType = input.runnerType ?? "self-hosted";
  const enableTdd = input.enableTdd !== false;
  const enableE2e = input.enableE2e !== void 0 ? input.enableE2e : language === "nodejs";
  const enableInfra = input.enableInfra !== void 0 ? input.enableInfra : language === "nodejs";
  const skipCommands = input.skipCommands === true;
  const tiers = input.tiers;
  const warnings = [];
  if (useGithub && !input.githubOwner) {
    throw new Error("GitHub owner is required when creating a GitHub repository");
  }
  const fullRepoName = input.githubOwner ? `${input.githubOwner}/${input.projectName}` : "";
  if (useGithub) {
    report("Creating GitHub repository...", fullRepoName);
    await createRepo(fullRepoName, {
      private: input.privateRepo !== false,
      description: `Lakebase project: ${input.projectName}`
    });
    report("Waiting for GitHub repo to be visible...", fullRepoName);
    const probeDelays = [1e3, 2e3, 3e3, 5e3, 8e3];
    let probeErr = "";
    let visible = false;
    for (const waitMs of probeDelays) {
      try {
        await getRepoFullName(fullRepoName);
        visible = true;
        break;
      } catch (err) {
        probeErr = err instanceof Error ? err.message : String(err);
        await delay(waitMs);
      }
    }
    if (!visible) {
      let activeUser = "";
      try {
        activeUser = await getCurrentUser();
      } catch {
      }
      const samlHint = /SAML|scope does not match|sso/i.test(probeErr) ? "\n\nThe error mentions SAML \u2013 re-sign in to GitHub and authorize SSO for this org." : "";
      const userHint = activeUser && activeUser !== input.githubOwner ? `

Note: signed in as "${activeUser}", but the repo was created under "${input.githubOwner}".` : "";
      throw new Error(
        `GitHub repo "${fullRepoName}" was created but isn't visible after ~19s of polling.${samlHint}${userHint}

Last probe error:
  ${probeErr.split("\n")[0].slice(0, 200)}`
      );
    }
    report("Cloning repository...", projectDir);
    await cloneRepo({
      repoUrl: `https://github.com/${fullRepoName}.git`,
      parentDir: input.parentDir
    });
  } else {
    report("Creating local project directory...", projectDir);
    if (fs18.existsSync(projectDir)) {
      throw new Error(`Directory already exists: ${projectDir}`);
    }
    fs18.mkdirSync(projectDir, { recursive: true });
    await gitInit(projectDir);
  }
  report("Creating Lakebase database...", lakebaseProjectId);
  await createLakebaseProject({ projectId: lakebaseProjectId, host });
  report("Resolving database endpoint...");
  const defaultBranchId = await getDefaultBranchId({
    projectId: lakebaseProjectId,
    host
  });
  report("Scaffolding project files...");
  await scaffoldAll({
    targetDir: projectDir,
    databricksHost: host,
    lakebaseProjectId,
    language,
    runnerType,
    skipCommands,
    report: (m, d) => report(m, d)
  });
  if (enableTdd) {
    report("Scaffolding .tdd/ workflow directory...");
    layDownTddScaffold(projectDir);
  }
  if (enableE2e) {
    report("Wiring Playwright E2E support...");
    const e2e = enableE2eForProject({ projectDir });
    if (e2e.templatesWritten.length > 0) {
      report(`  wrote ${e2e.templatesWritten.length} Playwright template(s)`);
    }
    if (e2e.packageJson.patched && (e2e.packageJson.scriptAdded || e2e.packageJson.depAdded)) {
      report("  patched package.json (test:e2e + @playwright/test)");
    } else if (!e2e.packageJson.patched) {
      report("  package.json absent, skipped npm wiring (non-Node project)");
    }
    if (e2e.runTestsScript.inserted) {
      report("  patched scripts/run-tests.sh");
    }
  }
  if (enableInfra) {
    report("Wiring [Infra]-tag runner support...");
    const infra = enableInfraForProject({ projectDir });
    if (infra.packageJson.patched && infra.packageJson.scriptAdded) {
      report("  patched package.json (test:infra)");
    } else if (!infra.packageJson.patched) {
      report("  package.json absent, skipped npm wiring (non-Node project)");
    }
    if (infra.runTestsScript.inserted) {
      report("  patched scripts/run-tests.sh (infra block)");
    }
  }
  if (useGithub) {
    report("Setting up CI auth (service principal)...");
    try {
      await syncCiSecrets({
        projectDir,
        databricksHost: host,
        lakebaseProjectId,
        comment: "GitHub Actions CI",
        lifetimeSeconds: 86400,
        ownerRepo: fullRepoName
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`CI auth setup failed: ${msg}`);
      report(`Warning: CI auth setup failed (${msg})`);
    }
  }
  if (useGithub && runnerType === "self-hosted") {
    report("Setting up self-hosted runner...");
    try {
      await setupRunner({
        fullRepoName,
        projectName: input.projectName,
        report: (m) => report(m)
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Runner setup failed: ${msg}`);
      report(`Warning: runner setup failed (${msg}). CI workflows will queue until a runner is available.`);
    }
  } else if (useGithub) {
    report("Using GitHub-hosted runners \u2013 no local runner needed.");
  } else {
    report("Skipping runner setup (no GitHub repository).");
  }
  try {
    writeWorkflowState(
      projectDir,
      initWorkflowState({
        projectId: lakebaseProjectId,
        tierTopology: tiers ?? 1
      })
    );
  } catch (err) {
    warnings.push(
      `SCM workflow-state seed failed (advisory): ${err instanceof Error ? err.message : String(err)}. Run lakebase-scm-state to inspect.`
    );
  }
  if (enableTdd) {
    try {
      writeAgentConfig(projectDir, buildAgentConfig(input.agentModels));
    } catch (err) {
      warnings.push(
        `Agent model config seed failed (advisory): ${err instanceof Error ? err.message : String(err)}. The role defaults still apply.`
      );
    }
  }
  if (enableTdd) {
    try {
      const kitRef = process.env.LAKEBASE_KIT_REF?.trim();
      if (kitRef) {
        const dir = path17.join(projectDir, ".lakebase");
        fs18.mkdirSync(dir, { recursive: true });
        fs18.writeFileSync(path17.join(dir, "kit-ref"), `${kitRef}
`, "utf8");
      }
      const lk = path17.join(projectDir, "scripts", "lk");
      if (fs18.existsSync(lk)) {
        spawnSync("bash", [lk, "--warm"], { cwd: projectDir, stdio: "ignore", timeout: 18e4 });
      }
    } catch (err) {
      warnings.push(
        `Kit fast-CLI cache warm failed (advisory): ${err instanceof Error ? err.message : String(err)}. scripts/lk installs lazily on first use.`
      );
    }
  }
  const langLabels = {
    java: "Java/Spring Boot",
    kotlin: "Kotlin/Spring Boot",
    python: "Python/FastAPI",
    nodejs: "Node.js/Express"
  };
  const langLabel = langLabels[language] ?? language;
  report("Creating initial commit...");
  await commitAndPush({
    projectDir,
    message: `Initial project scaffold (${langLabel} + Lakebase)`,
    push: useGithub
  });
  if (tiers === 2 || tiers === 3) {
    if (!useGithub) {
      warnings.push(
        `tiers === ${tiers} requires a GitHub repository (createLongRunningBranch pushes the tier's git side to origin). Extra tiers were NOT cut.`
      );
    } else {
      report(`Cutting staging tier (tiers=${tiers}) via createLongRunningBranch...`);
      try {
        await createLongRunningBranch({
          name: "staging",
          forkFromBranch: "main",
          projectId: lakebaseProjectId,
          workTreeDir: projectDir,
          databricksHost: host
        });
      } catch (err) {
        warnings.push(
          `tiers === ${tiers} requested but createLongRunningBranch for staging failed: ${err instanceof Error ? err.message : String(err)}.`
        );
      }
      if (tiers === 3) {
        report("Cutting dev tier (tiers=3) via createLongRunningBranch (off staging)...");
        try {
          await createLongRunningBranch({
            name: "dev",
            forkFromBranch: "staging",
            projectId: lakebaseProjectId,
            workTreeDir: projectDir,
            databricksHost: host
          });
        } catch (err) {
          warnings.push(
            `tiers === 3 requested but createLongRunningBranch for dev failed: ${err instanceof Error ? err.message : String(err)}.`
          );
        }
      }
    }
  }
  report("Verifying project...");
  const health = verifyProject(projectDir);
  for (const w of health.warnings) {
    warnings.push(w);
    report(`Warning: ${w}`);
  }
  report("Project created successfully!");
  if (enableTdd) {
    report(`Next: cd ${projectDir} && ./scripts/tdd.sh plan`);
  }
  return {
    projectDir,
    githubRepoUrl: useGithub ? `https://github.com/${fullRepoName}` : void 0,
    lakebaseProjectId,
    lakebaseDefaultBranch: defaultBranchId,
    warnings
  };
}
function layDownTddScaffold(targetDir) {
  const candidates = [
    path17.resolve(__dirname, "../../templates/tdd-bootstrap/.tdd"),
    path17.resolve(__dirname, "../../../templates/tdd-bootstrap/.tdd")
  ];
  const source = candidates.find((c) => fs18.existsSync(c));
  if (!source) {
    throw new Error(`tdd-bootstrap template not found; looked in: ${candidates.join(", ")}`);
  }
  const dest = path17.join(targetDir, ".tdd");
  if (fs18.existsSync(dest)) {
    return;
  }
  fs18.cpSync(source, dest, { recursive: true });
}

// scripts/lakebase/infra-runner.ts
import * as fs25 from "fs";
import * as path25 from "path";

// scripts/lakebase/schema-diff.ts
import { execFileSync as execFileSync6 } from "child_process";
var IGNORED_TABLES = /* @__PURE__ */ new Set(["flyway_schema_history"]);
var SCHEMA_QUERY2 = "SELECT c.table_name, c.column_name, c.data_type FROM information_schema.columns c JOIN pg_tables t ON c.table_name = t.tablename WHERE c.table_schema='public' AND t.schemaname='public' ORDER BY c.table_name, c.ordinal_position";
async function getSchemaDiff(args) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const baseResult = {
    branchName: args.branch,
    comparisonBranchName: "",
    timestamp,
    migrations: [],
    created: [],
    modified: [],
    removed: [],
    branchTables: [],
    inSync: false
  };
  const comparisonBranch = args.comparisonBranch ?? resolveComparisonBranch(args.instance, args.branch);
  if (!comparisonBranch) {
    return { ...baseResult, error: "Could not resolve a comparison target Lakebase branch" };
  }
  if (comparisonBranch === args.branch) {
    return { ...baseResult, comparisonBranchName: comparisonBranch, inSync: true };
  }
  let targetPool;
  let comparisonPool;
  try {
    targetPool = await getConnection({
      output: "pool",
      instance: args.instance,
      branch: args.branch,
      database: args.database,
      workspaceClient: args.workspaceClient
    });
    comparisonPool = await getConnection({
      output: "pool",
      instance: args.instance,
      branch: comparisonBranch,
      database: args.database,
      workspaceClient: args.workspaceClient
    });
    const targetTables = await listTables(targetPool);
    const comparisonTables = await listTables(comparisonPool);
    return diffSchemas(args.branch, comparisonBranch, targetTables, comparisonTables, timestamp);
  } catch (err) {
    return {
      ...baseResult,
      comparisonBranchName: comparisonBranch,
      error: err instanceof Error ? err.message : String(err)
    };
  } finally {
    if (targetPool) await targetPool.end().catch(() => void 0);
    if (comparisonPool) await comparisonPool.end().catch(() => void 0);
  }
}
async function listTables(pool) {
  const { rows } = await pool.query(SCHEMA_QUERY2);
  const tables = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (!r.table_name || IGNORED_TABLES.has(r.table_name)) continue;
    if (!tables.has(r.table_name)) tables.set(r.table_name, []);
    tables.get(r.table_name).push({ name: r.column_name, dataType: r.data_type });
  }
  return tables;
}
function diffSchemas(branch, comparisonBranch, target, comparison, timestamp) {
  const created = [];
  const removed = [];
  const modified = [];
  for (const [name, columns] of target) {
    if (!comparison.has(name)) {
      created.push({ type: "TABLE", name, columns });
    }
  }
  for (const [name, columns] of comparison) {
    if (!target.has(name)) {
      removed.push({ type: "TABLE", name, columns });
    }
  }
  for (const [name, targetCols] of target) {
    const comparisonCols = comparison.get(name);
    if (!comparisonCols) continue;
    const comparisonKeys = new Set(comparisonCols.map(colKey));
    const targetKeys = new Set(targetCols.map(colKey));
    const addedColumns = targetCols.filter((c) => !comparisonKeys.has(colKey(c)));
    const removedColumns = comparisonCols.filter((c) => !targetKeys.has(colKey(c)));
    if (addedColumns.length > 0 || removedColumns.length > 0) {
      modified.push({
        type: "TABLE",
        name,
        columns: targetCols,
        addedColumns,
        removedColumns,
        prodColumns: comparisonCols
      });
    }
  }
  const branchTables = [...target.entries()].map(([name, columns]) => ({ type: "TABLE", name, columns })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    branchName: branch,
    comparisonBranchName: comparisonBranch,
    timestamp,
    migrations: [],
    created: created.sort((a, b) => a.name.localeCompare(b.name)),
    modified: modified.sort((a, b) => a.name.localeCompare(b.name)),
    removed: removed.sort((a, b) => a.name.localeCompare(b.name)),
    branchTables,
    inSync: created.length === 0 && modified.length === 0 && removed.length === 0
  };
}
var colKey = (c) => `${c.name}:${c.dataType}`;
function formatSchemaDiffAsMarkdown(result) {
  const lines = ["**SCHEMA CHANGES (Lakebase diff)**", ""];
  if (result.error) {
    lines.push(`Could not compute schema diff: ${result.error}`);
    return lines.join("\n") + "\n";
  }
  const blocks = [];
  for (const obj of result.created) {
    const block = [`+ ${obj.type} ${obj.name} (CREATED)`];
    if (obj.type === "TABLE" && obj.columns) {
      for (const col of obj.columns) {
        block.push(`  L ${col.name} ${col.dataType}`);
      }
    }
    blocks.push(block);
  }
  for (const obj of result.modified) {
    const block = [`~ TABLE ${obj.name} (MODIFIED)`];
    for (const col of obj.addedColumns) {
      block.push(`  + ${col.name} ${col.dataType}`);
    }
    blocks.push(block);
  }
  for (const obj of result.removed) {
    blocks.push([`- ${obj.type} ${obj.name} (REMOVED)`]);
  }
  if (blocks.length === 0) {
    lines.push("No schema changes (in sync).");
  } else {
    for (let i = 0; i < blocks.length; i++) {
      if (i > 0) lines.push("");
      lines.push(...blocks[i]);
    }
  }
  return lines.join("\n") + "\n";
}
function resolveComparisonBranch(instance, branch) {
  const branchInfo = describeBranch(instance, branch);
  const sourceBranch = branchInfo?.status?.source_branch ?? branchInfo?.spec?.source_branch;
  if (sourceBranch && typeof sourceBranch === "string") {
    const leaf = sourceBranch.split("/branches/").pop();
    if (leaf) return leaf;
  }
  const def = findDefaultBranch(instance);
  if (def) return def;
  return void 0;
}
function describeBranch(instance, branch) {
  const branchPath = `projects/${instance}/branches/${branch}`;
  try {
    const raw = dbcli6(["postgres", "get-branch", branchPath, "-o", "json"]);
    return JSON.parse(raw);
  } catch {
    try {
      const raw = dbcli6(["postgres", "list-branches", `projects/${instance}`, "-o", "json"]);
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
      return items.find((b) => b.uid === branch || b.name?.endsWith(`/branches/${branch}`));
    } catch {
      return void 0;
    }
  }
}
function findDefaultBranch(instance) {
  try {
    const raw = dbcli6(["postgres", "list-branches", `projects/${instance}`, "-o", "json"]);
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
    const def = items.find((b) => b.status?.default === true || b.is_default === true);
    if (!def) return void 0;
    return def.name?.split("/branches/").pop() ?? def.uid ?? void 0;
  } catch {
    return void 0;
  }
}
function dbcli6(args) {
  return execFileSync6("databricks", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.cliDefault
  });
}

// scripts/lakebase/schema-migrate.ts
import * as fs24 from "fs";
import * as path24 from "path";

// scripts/lakebase/adapters/alembic-adapter.ts
import * as fs20 from "fs";
import * as path19 from "path";

// scripts/lakebase/schema-migrate-runners/alembic.ts
import { spawn as spawn5 } from "child_process";
import * as fs19 from "fs";
import * as path18 from "path";
function resolveAlembicBin(projectDir) {
  const candidates = [
    path18.join(projectDir, ".venv", "bin", "alembic"),
    path18.join(projectDir, "venv", "bin", "alembic")
  ];
  for (const candidate of candidates) {
    try {
      if (fs19.existsSync(candidate)) return candidate;
    } catch {
    }
  }
  return "alembic";
}
function spawnAlembic(projectDir, args, dsn) {
  return new Promise((resolve2, reject) => {
    const bin = resolveAlembicBin(projectDir);
    const child = spawn5(bin, args, {
      cwd: projectDir,
      env: dsn ? { ...process.env, DATABASE_URL: dsn } : { ...process.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      reject(
        new SchemaMigrationError(
          `Could not spawn alembic. Is it installed and on PATH? ${err.message}`,
          err
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve2({ stdout, stderr });
      } else {
        reject(
          new SchemaMigrationError(
            `alembic ${args.join(" ")} exited with code ${code}.
stdout: ${stdout}
stderr: ${stderr}`
          )
        );
      }
    });
  });
}
function runAlembic(ctx, args) {
  return spawnAlembic(ctx.projectDir, args, ctx.dsn);
}
async function createAlembicRevision(opts) {
  const args = ["revision", "--rev-id", opts.revId, "-m", opts.message];
  if (opts.autogenerate) args.push("--autogenerate");
  const { stdout } = await spawnAlembic(opts.projectDir, args, opts.dsn);
  const m = stdout.match(/Generating\s+(\S+\.py)/);
  if (m) return m[1].trim();
  for (const rel of ["migrations/versions", "alembic/versions"]) {
    const dir = path18.join(opts.projectDir, rel);
    if (!fs19.existsSync(dir)) continue;
    const hit = fs19.readdirSync(dir).find((f) => f.startsWith(`${opts.revId}_`) && f.endsWith(".py"));
    if (hit) return path18.join(dir, hit);
  }
  throw new SchemaMigrationError(
    `alembic revision succeeded but the created file could not be located.
stdout: ${stdout}`
  );
}
async function listAlembicHeads(projectDir) {
  const { stdout } = await spawnAlembic(projectDir, ["heads"]);
  const heads = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]+)\b/);
    if (m) heads.push(m[1]);
  }
  return heads;
}
async function mergeAlembicHeads(projectDir, message) {
  const { stdout } = await spawnAlembic(projectDir, ["merge", "-m", message, "heads"]);
  const m = stdout.match(/Generating\s+(\S+\.py)/);
  if (!m) {
    throw new SchemaMigrationError(`alembic merge heads created no file.
stdout: ${stdout}`);
  }
  return m[1].trim();
}
async function getCurrentRevision(ctx) {
  const { stdout } = await runAlembic(ctx, ["current"]);
  const m = stdout.match(/^([a-f0-9]+)\b/m);
  return m ? m[1] : void 0;
}
async function getHeadRevision(ctx) {
  const { stdout } = await runAlembic(ctx, ["heads"]);
  const m = stdout.match(/^([a-f0-9]+)\b/m);
  return m ? m[1] : void 0;
}
async function listHistory(ctx, range) {
  const { stdout } = await runAlembic(ctx, ["history", "-r", range]);
  const out = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^(?:<base>|[a-f0-9]+)\s*->\s*([a-f0-9]+)(?:\s*\(head\))?,\s*(.*)$/);
    if (m) out.push({ version: m[1].trim(), description: m[2].trim() });
  }
  return out;
}
async function applyAlembic(ctx) {
  const before = await getCurrentRevision(ctx);
  await runAlembic(ctx, ["upgrade", "head"]);
  const after = await getCurrentRevision(ctx);
  if (!after || before === after) {
    return { applied: [], alreadyAtLatest: true, tool: "alembic" };
  }
  const range = before ? `${before}:${after}` : `base:${after}`;
  const inRange = await listHistory(ctx, range);
  const applied = before ? inRange.filter((a) => a.version !== before) : inRange;
  return { applied, alreadyAtLatest: false, tool: "alembic" };
}
async function rollbackAlembic(ctx) {
  const before = await getCurrentRevision(ctx);
  if (!before) {
    await runAlembic(ctx, ["downgrade", ctx.target]);
    return { rolledBack: [], tool: "alembic" };
  }
  await runAlembic(ctx, ["downgrade", ctx.target]);
  const after = await getCurrentRevision(ctx);
  const range = after ? `${after}:${before}` : `base:${before}`;
  const inRange = await listHistory(ctx, range);
  const rolledBack = after ? inRange.filter((a) => a.version !== after) : inRange;
  return { rolledBack, tool: "alembic" };
}
async function statusAlembic(ctx) {
  const current = await getCurrentRevision(ctx);
  const head = await getHeadRevision(ctx);
  const pending = [];
  if (head && head !== current) {
    const range = current ? `${current}:head` : `base:head`;
    const inRange = await listHistory(ctx, range);
    for (const rev of inRange) {
      if (current && rev.version === current) continue;
      pending.push({
        version: rev.version,
        filename: `${rev.version}_*.py`,
        description: rev.description
      });
    }
  }
  return { current, pending, tool: "alembic" };
}

// scripts/lakebase/schema-migration-adapter.ts
var REGISTRY = /* @__PURE__ */ new Map();
function registerSchemaMigrationAdapter(adapter) {
  REGISTRY.set(adapter.id, adapter);
}
function resolveSchemaMigrationAdapter(projectDir, override) {
  if (override) {
    const a = REGISTRY.get(override);
    if (!a) {
      throw new UnresolvedSchemaMigrationAdapterError(
        `migration_tool=${override} is not a registered adapter. Registered: ${[...REGISTRY.keys()].join(", ") || "(none)"}`
      );
    }
    return a;
  }
  for (const adapter of REGISTRY.values()) {
    if (adapter.detect(projectDir)) return adapter;
  }
  throw new UnresolvedSchemaMigrationAdapterError(
    `Cannot resolve migration tool for ${projectDir}. Set project.yaml#migration_tool to one of: ${[...REGISTRY.keys()].join(", ") || "(none)"}.`
  );
}
var UnresolvedSchemaMigrationAdapterError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "UnresolvedSchemaMigrationAdapterError";
  }
};

// scripts/lakebase/adapters/alembic-adapter.ts
async function buildDsn2(args) {
  const result = await getConnection({
    output: "dsn",
    instance: args.instance,
    branch: args.branch,
    database: args.database,
    endpointName: args.endpointName
  });
  return result.url;
}
function findVersionsDir(projectDir) {
  const candidates = [
    path19.join(projectDir, "migrations", "versions"),
    path19.join(projectDir, "alembic", "versions")
  ];
  return candidates.find((p) => fs20.existsSync(p));
}
function listAlembicFiles(projectDir) {
  const dir = findVersionsDir(projectDir);
  if (!dir) return [];
  const files = fs20.readdirSync(dir).filter((f) => f.endsWith(".py") && !f.startsWith("__"));
  return files.map((filename) => {
    const stem = filename.replace(/\.py$/, "");
    const sep2 = stem.indexOf("_");
    const version = sep2 === -1 ? stem : stem.slice(0, sep2);
    const description = sep2 === -1 ? "" : stem.slice(sep2 + 1).replace(/_/g, " ");
    return {
      version,
      filename,
      description,
      type: "Python",
      tool: "alembic"
    };
  }).sort((a, b) => a.filename.localeCompare(b.filename));
}
var AlembicAdapter = {
  id: "alembic",
  languages: ["python"],
  /**
   * Detect Alembic-specifically rather than Python-broadly. A project
   * with pyproject.toml but no alembic.ini and no env.py is a Python
   * project that hasn't (yet) adopted Alembic, and should NOT auto-route
   * here. Callers can still force-select via project.yaml#migration_tool.
   */
  detect(projectDir) {
    if (fs20.existsSync(path19.join(projectDir, "alembic.ini"))) return true;
    if (fs20.existsSync(path19.join(projectDir, "migrations", "env.py"))) return true;
    if (fs20.existsSync(path19.join(projectDir, "alembic", "env.py"))) return true;
    return false;
  },
  async apply(args) {
    const dsn = await buildDsn2(args);
    try {
      const legacy = await applyAlembic({ projectDir: args.projectDir, dsn });
      return {
        applied_migrations: legacy.applied,
        status: legacy.alreadyAtLatest ? "noop" : "ok",
        tool_specific: {
          alreadyAtLatest: legacy.alreadyAtLatest,
          tool: legacy.tool
        }
      };
    } catch (err) {
      return {
        applied_migrations: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async rollback(args) {
    const dsn = await buildDsn2(args);
    try {
      const legacy = await rollbackAlembic({
        projectDir: args.projectDir,
        dsn,
        target: args.target
      });
      return {
        rolled_back: legacy.rolledBack,
        status: legacy.rolledBack.length === 0 ? "noop" : "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        rolled_back: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async status(args) {
    const dsn = await buildDsn2(args);
    try {
      const legacy = await statusAlembic({ projectDir: args.projectDir, dsn });
      return {
        applied_version: legacy.current ?? null,
        pending: legacy.pending,
        // The legacy statusAlembic returns current + pending, not the
        // full applied history. Surface what we have. Backfilling the
        // applied list requires an extra `alembic history -r base:current`
        // call; deferred to a follow-up so this slice stays a pure port.
        applied: [],
        status: "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        applied_version: null,
        pending: [],
        applied: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async list(args) {
    return { files: listAlembicFiles(args.projectDir) };
  },
  // baseline intentionally absent in slice 3. Alembic exposes `stamp`
  // as the equivalent operation; deferred to a follow-up.
  async newMigration(args) {
    try {
      if (args.autogenerate && (!args.instance || !args.branch)) {
        throw new Error("autogenerate requires both instance and branch (to diff models vs the branch DB)");
      }
      const revId = migrationTimestamp();
      const dsn = args.autogenerate ? await buildDsn2({
        instance: args.instance,
        branch: args.branch,
        database: args.database,
        endpointName: args.endpointName
      }) : void 0;
      const created = await createAlembicRevision({
        projectDir: args.projectDir,
        revId,
        message: args.slug,
        autogenerate: !!args.autogenerate,
        dsn
      });
      return { status: "ok", version: revId, filename: path19.basename(created), path: created };
    } catch (err) {
      return {
        status: "error",
        version: "",
        filename: "",
        path: "",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async collapseHeads(args) {
    try {
      const heads = await listAlembicHeads(args.projectDir);
      if (heads.length <= 1) return { status: "noop", headsBefore: heads };
      if (args.dryRun) return { status: "ok", headsBefore: heads };
      const created = await mergeAlembicHeads(args.projectDir, args.message ?? "merge heads");
      const mergeRevision = path19.basename(created).replace(/\.py$/, "").split("_")[0];
      return { status: "ok", headsBefore: heads, mergeRevision, path: created };
    } catch (err) {
      return {
        status: "error",
        headsBefore: [],
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
};
registerSchemaMigrationAdapter(AlembicAdapter);

// scripts/lakebase/adapters/flyway-adapter.ts
import * as fs21 from "fs";
import * as path21 from "path";

// scripts/lakebase/schema-migrate-runners/flyway.ts
import { spawn as spawn6 } from "child_process";
import * as path20 from "path";
function dsnToFlywayEnv(dsn) {
  const u = new URL(dsn);
  const user = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  const portPart = u.port ? `:${u.port}` : "";
  const url = `jdbc:postgresql://${u.hostname}${portPart}${u.pathname}${u.search}`;
  return { url, user, password };
}
function migrationsLocation(projectDir) {
  return `filesystem:${path20.join(projectDir, "src", "main", "resources", "db", "migration")}`;
}
function runFlyway(ctx, args) {
  const { url, user, password } = dsnToFlywayEnv(ctx.dsn);
  return new Promise((resolve2, reject) => {
    const child = spawn6(
      "flyway",
      ["-outputType=json", `-locations=${migrationsLocation(ctx.projectDir)}`, ...args],
      {
        cwd: ctx.projectDir,
        env: {
          ...process.env,
          FLYWAY_URL: url,
          FLYWAY_USER: user,
          FLYWAY_PASSWORD: password
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      reject(
        new SchemaMigrationError(
          `Could not spawn flyway. Is the Flyway Community CLI installed and on PATH? ${err.message}`,
          err
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve2({ stdout, stderr });
      } else {
        reject(
          new SchemaMigrationError(
            `flyway ${args.join(" ")} exited with code ${code}.
stdout: ${stdout}
stderr: ${stderr}`
          )
        );
      }
    });
  });
}
function parseFlywayJson(stdout) {
  const start = stdout.indexOf("{");
  if (start === -1) {
    throw new SchemaMigrationError(`flyway JSON output missing: ${stdout.slice(0, 200)}`);
  }
  try {
    return JSON.parse(stdout.slice(start));
  } catch (err) {
    throw new SchemaMigrationError(
      `flyway JSON parse failed: ${err instanceof Error ? err.message : String(err)}.
Body (first 400 chars): ${stdout.slice(start, start + 400)}`
    );
  }
}
async function applyFlyway(ctx) {
  const { stdout } = await runFlyway(ctx, [
    "-baselineOnMigrate=true",
    "-baselineVersion=0",
    "migrate"
  ]);
  const json = parseFlywayJson(stdout);
  const entries = json.migrations ?? [];
  const applied = [];
  for (const m of entries) {
    if (m.category === "INIT") continue;
    if (m.state && m.state !== "SUCCESS") continue;
    if (!m.version) continue;
    applied.push({
      version: m.version,
      description: m.description ?? "",
      ...typeof m.executionTime === "number" ? { executionTimeMs: m.executionTime } : {}
    });
  }
  return {
    applied,
    alreadyAtLatest: applied.length === 0,
    tool: "flyway"
  };
}
async function statusFlyway(ctx) {
  const { stdout } = await runFlyway(ctx, ["info"]);
  const json = parseFlywayJson(stdout);
  const entries = json.migrations ?? [];
  let current;
  const pending = [];
  for (const m of entries) {
    if (!m.version) continue;
    const state = (m.state ?? "").toUpperCase();
    if (state === "SUCCESS" || state === "BASELINE") {
      current = m.version;
    } else if (state === "PENDING") {
      const filename = m.filepath ? path20.basename(m.filepath) : `V${m.version}__migration.sql`;
      pending.push({
        version: m.version,
        filename,
        description: m.description ?? ""
      });
    }
  }
  return { current, pending, tool: "flyway" };
}

// scripts/lakebase/adapters/flyway-adapter.ts
async function buildDsn3(args) {
  const result = await getConnection({
    output: "dsn",
    instance: args.instance,
    branch: args.branch,
    database: args.database,
    endpointName: args.endpointName
  });
  return result.url;
}
function listFlywayFiles(projectDir) {
  const dir = path21.join(projectDir, "src", "main", "resources", "db", "migration");
  if (!fs21.existsSync(dir)) return [];
  const files = fs21.readdirSync(dir).filter((f) => /^V\d+(\.\d+)*__.+\.sql$/.test(f));
  return files.map((filename) => {
    const m = filename.match(/^V(\d+(?:\.\d+)*)__(.+)\.sql$/);
    const version = m[1];
    const description = m[2].replace(/_/g, " ");
    return { version, filename, description, type: "SQL", tool: "flyway" };
  }).sort((a, b) => versionCompare(a.version, b.version));
}
function versionCompare(a, b) {
  const ax = a.split(".").map(Number);
  const bx = b.split(".").map(Number);
  const len = Math.max(ax.length, bx.length);
  for (let i = 0; i < len; i++) {
    const av = ax[i] ?? 0;
    const bv = bx[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
var FlywayAdapter = {
  id: "flyway",
  languages: ["java", "kotlin"],
  detect(projectDir) {
    return fs21.existsSync(path21.join(projectDir, "pom.xml"));
  },
  async apply(args) {
    const dsn = await buildDsn3(args);
    try {
      const legacy = await applyFlyway({ projectDir: args.projectDir, dsn });
      return {
        applied_migrations: legacy.applied,
        status: legacy.alreadyAtLatest ? "noop" : "ok",
        tool_specific: {
          alreadyAtLatest: legacy.alreadyAtLatest,
          tool: legacy.tool
        }
      };
    } catch (err) {
      return {
        applied_migrations: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  // rollback intentionally absent: Flyway Community Edition does not
  // support it. Callers MUST property-check (`adapter.rollback?` /
  // `if (adapter.rollback)`) before invoking.
  async status(args) {
    const dsn = await buildDsn3(args);
    try {
      const legacy = await statusFlyway({ projectDir: args.projectDir, dsn });
      return {
        applied_version: legacy.current ?? null,
        pending: legacy.pending,
        // Legacy statusFlyway does not return the applied history; we
        // surface only the currently-applied version + pending. Adapters
        // that complete this (Alembic, future Knex) MAY populate.
        applied: [],
        status: "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        applied_version: null,
        pending: [],
        applied: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async list(args) {
    return { files: listFlywayFiles(args.projectDir) };
  },
  // baseline intentionally absent. Flyway DOES support baseline at the
  // tool level, but exposing it cleanly requires plumbing flags into the
  // existing runner. Deferred to a follow-up slice; the adapter's
  // optional-protocol shape makes this additive.
  async newMigration(args) {
    try {
      const dir = path21.join(args.projectDir, "src", "main", "resources", "db", "migration");
      fs21.mkdirSync(dir, { recursive: true });
      const version = migrationTimestamp();
      const slug = migrationSlug2(args.slug);
      const filename = `V${version}__${slug}.sql`;
      const full = path21.join(dir, filename);
      if (fs21.existsSync(full)) throw new Error(`${filename} already exists`);
      fs21.writeFileSync(
        full,
        `-- V${version}: ${args.slug}
-- Flyway migration (write your DDL/DML below).
`,
        "utf8"
      );
      return { status: "ok", version, filename, path: full };
    } catch (err) {
      return {
        status: "error",
        version: "",
        filename: "",
        path: "",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
};
registerSchemaMigrationAdapter(FlywayAdapter);

// scripts/lakebase/adapters/knex-adapter.ts
import * as fs23 from "fs";
import * as path23 from "path";

// scripts/lakebase/schema-migrate-runners/knex.ts
import { spawn as spawn7 } from "child_process";
import * as fs22 from "fs";
import * as path22 from "path";
var KNEXFILE_VARIANTS = ["knexfile.js", "knexfile.ts", "knexfile.mjs", "knexfile.cjs"];
function findKnexfile(projectDir) {
  for (const name of KNEXFILE_VARIANTS) {
    const p = path22.join(projectDir, name);
    if (fs22.existsSync(p)) return p;
  }
  return void 0;
}
function spawnKnex(projectDir, args, dsn) {
  return new Promise((resolve2, reject) => {
    const knexfile = findKnexfile(projectDir);
    if (!knexfile) {
      reject(
        new SchemaMigrationError(
          `No knexfile found in ${projectDir}. Expected one of: ${KNEXFILE_VARIANTS.join(", ")}.`
        )
      );
      return;
    }
    const child = spawn7("npx", ["--no-install", "knex", "--knexfile", knexfile, ...args], {
      cwd: projectDir,
      env: dsn ? { ...process.env, DATABASE_URL: dsn } : { ...process.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      reject(
        new SchemaMigrationError(
          `Could not spawn knex via npx. Is Node installed and is 'knex' in the project's node_modules? ${err.message}`,
          err
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve2({ stdout, stderr });
      } else {
        reject(
          new SchemaMigrationError(
            `knex ${args.join(" ")} exited with code ${code}.
stdout: ${stdout}
stderr: ${stderr}`
          )
        );
      }
    });
  });
}
function runKnex(ctx, args) {
  return spawnKnex(ctx.projectDir, args, ctx.dsn);
}
async function createKnexMigration(opts) {
  const { stdout } = await spawnKnex(opts.projectDir, ["migrate:make", opts.slug]);
  const m = stdout.match(/Created Migration:\s*(\S+)/);
  if (m) return m[1].trim();
  throw new SchemaMigrationError(
    `knex migrate:make succeeded but the created file could not be located.
stdout: ${stdout}`
  );
}
function parseKnexStatus(stdout) {
  const completed = [];
  const pending = [];
  let mode = null;
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^Found\s+\d+\s+Completed\s+Migration/i.test(line)) {
      mode = "completed";
      continue;
    }
    if (/^Found\s+\d+\s+Pending\s+Migration/i.test(line)) {
      mode = "pending";
      continue;
    }
    if (/^No\s+Pending\s+Migration\s+files\s+Found/i.test(line)) {
      mode = null;
      continue;
    }
    if (!line) continue;
    if (!/\.(js|ts|mjs|cjs)$/.test(line)) continue;
    if (mode === "completed") completed.push(line);
    if (mode === "pending") pending.push(line);
  }
  return { completed, pending };
}
function parseKnexFilename(filename) {
  const stem = filename.replace(/\.(js|ts|mjs|cjs)$/, "");
  const m = stem.match(/^(\d{14})_(.+)$/);
  const version = m ? m[1] : stem;
  const description = m ? m[2].replace(/[_-]/g, " ") : stem;
  return { version, description };
}
async function applyKnex(ctx) {
  const beforeOut = await runKnex(ctx, ["migrate:status"]);
  const before = parseKnexStatus(beforeOut.stdout);
  await runKnex(ctx, ["migrate:latest"]);
  const afterOut = await runKnex(ctx, ["migrate:status"]);
  const after = parseKnexStatus(afterOut.stdout);
  const newlyCompleted = after.completed.filter((f) => !before.completed.includes(f));
  if (newlyCompleted.length === 0) {
    return { applied: [], alreadyAtLatest: true, tool: "knex" };
  }
  const applied = newlyCompleted.map((filename) => {
    const { version, description } = parseKnexFilename(filename);
    return { version, description };
  });
  return { applied, alreadyAtLatest: false, tool: "knex" };
}
async function rollbackKnex(ctx) {
  const beforeOut = await runKnex(ctx, ["migrate:status"]);
  const before = parseKnexStatus(beforeOut.stdout);
  const rollbackArgs = ["migrate:rollback"];
  if (ctx.target === "all" || ctx.target === "0") {
    rollbackArgs.push("--all");
  }
  await runKnex(ctx, rollbackArgs);
  const afterOut = await runKnex(ctx, ["migrate:status"]);
  const after = parseKnexStatus(afterOut.stdout);
  const rolledBackFiles = before.completed.filter((f) => !after.completed.includes(f));
  const rolledBack = rolledBackFiles.map((filename) => {
    const { version, description } = parseKnexFilename(filename);
    return { version, description };
  });
  return { rolledBack, tool: "knex" };
}
async function statusKnex(ctx) {
  const { stdout } = await runKnex(ctx, ["migrate:status"]);
  const { completed, pending } = parseKnexStatus(stdout);
  const current = completed.length > 0 ? parseKnexFilename(completed[completed.length - 1]).version : void 0;
  const pendingOut = pending.map((filename) => {
    const { version, description } = parseKnexFilename(filename);
    return { version, filename, description };
  });
  return { current, pending: pendingOut, tool: "knex" };
}

// scripts/lakebase/adapters/knex-adapter.ts
async function buildDsn4(args) {
  const result = await getConnection({
    output: "dsn",
    instance: args.instance,
    branch: args.branch,
    database: args.database,
    endpointName: args.endpointName
  });
  return result.url;
}
var KNEXFILE_VARIANTS2 = ["knexfile.js", "knexfile.ts", "knexfile.mjs", "knexfile.cjs"];
function listKnexFiles(projectDir) {
  const dir = path23.join(projectDir, "migrations");
  if (!fs23.existsSync(dir)) return [];
  const files = fs23.readdirSync(dir).filter((f) => (f.endsWith(".js") || f.endsWith(".ts")) && !f.startsWith("."));
  return files.map((filename) => {
    const stem = filename.replace(/\.(js|ts)$/, "");
    const m = stem.match(/^(\d{14})_(.+)$/);
    const version = m ? m[1] : stem;
    const description = m ? m[2].replace(/[_-]/g, " ") : stem;
    const type = filename.endsWith(".ts") ? "TypeScript" : "JavaScript";
    return { version, filename, description, type, tool: "knex" };
  }).sort((a, b) => a.version.localeCompare(b.version));
}
var KnexAdapter = {
  id: "knex",
  languages: ["nodejs"],
  /**
   * A knexfile at the project root is the canonical Knex marker. A bare
   * package.json with no knexfile means "Node.js project, but not Knex"
   * and should NOT auto-route here. Callers can still force-select via
   * project.yaml#migration_tool.
   */
  detect(projectDir) {
    return KNEXFILE_VARIANTS2.some((name) => fs23.existsSync(path23.join(projectDir, name)));
  },
  async apply(args) {
    const dsn = await buildDsn4(args);
    try {
      const legacy = await applyKnex({ projectDir: args.projectDir, dsn });
      return {
        applied_migrations: legacy.applied,
        status: legacy.alreadyAtLatest ? "noop" : "ok",
        tool_specific: {
          alreadyAtLatest: legacy.alreadyAtLatest,
          tool: legacy.tool
        }
      };
    } catch (err) {
      return {
        applied_migrations: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async rollback(args) {
    const dsn = await buildDsn4(args);
    try {
      const legacy = await rollbackKnex({
        projectDir: args.projectDir,
        dsn,
        target: args.target
      });
      return {
        rolled_back: legacy.rolledBack,
        status: legacy.rolledBack.length === 0 ? "noop" : "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        rolled_back: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async status(args) {
    const dsn = await buildDsn4(args);
    try {
      const legacy = await statusKnex({ projectDir: args.projectDir, dsn });
      return {
        applied_version: legacy.current ?? null,
        pending: legacy.pending,
        applied: [],
        status: "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        applied_version: null,
        pending: [],
        applied: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async list(args) {
    return { files: listKnexFiles(args.projectDir) };
  },
  // baseline intentionally absent. Knex has no native baseline concept;
  // omitting it advertises that correctly via the optional-capability
  // protocol so callers won't attempt the operation.
  async newMigration(args) {
    try {
      const created = await createKnexMigration({ projectDir: args.projectDir, slug: migrationSlug2(args.slug) });
      const stem = path23.basename(created).replace(/\.(js|ts)$/, "");
      const version = stem.match(/^(\d{14})_/)?.[1] ?? stem;
      return { status: "ok", version, filename: path23.basename(created), path: created };
    } catch (err) {
      return {
        status: "error",
        version: "",
        filename: "",
        path: "",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
};
registerSchemaMigrationAdapter(KnexAdapter);

// scripts/lakebase/schema-migrate.ts
var SchemaMigrationError = class extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
    this.name = "SchemaMigrationError";
  }
  cause;
};
function detectLanguage(projectDir) {
  if (fs24.existsSync(path24.join(projectDir, "pom.xml"))) {
    return "java";
  }
  if (fs24.existsSync(path24.join(projectDir, "pyproject.toml")) || fs24.existsSync(path24.join(projectDir, "requirements.txt")) || fs24.existsSync(path24.join(projectDir, "alembic.ini"))) {
    return "python";
  }
  if (fs24.existsSync(path24.join(projectDir, "package.json"))) {
    return "nodejs";
  }
  throw new SchemaMigrationError(
    `Could not detect project language in ${projectDir}. Expected one of: pom.xml (java/kotlin), pyproject.toml or alembic.ini (python), package.json (nodejs). Pass {language} explicitly to override.`
  );
}
function toolForLanguage(language) {
  switch (language) {
    case "java":
    case "kotlin":
      return "flyway";
    case "python":
      return "alembic";
    case "nodejs":
      return "knex";
  }
}
function listSchemaMigrations(args = {}) {
  const projectDir = args.projectDir ?? process.cwd();
  const language = args.language ?? detectLanguage(projectDir);
  const tool = toolForLanguage(language);
  switch (tool) {
    case "flyway":
      return listFlywayMigrations(projectDir);
    case "alembic":
      return listAlembicMigrations(projectDir);
    case "knex":
      return listKnexMigrations(projectDir);
  }
}
function listFlywayMigrations(projectDir) {
  const dir = path24.join(projectDir, "src", "main", "resources", "db", "migration");
  if (!fs24.existsSync(dir)) return [];
  const files = fs24.readdirSync(dir).filter((f) => /^V\d+(\.\d+)*__.+\.sql$/.test(f));
  return files.map((filename) => {
    const m = filename.match(/^V(\d+(?:\.\d+)*)__(.+)\.sql$/);
    const version = m[1];
    const description = m[2].replace(/_/g, " ");
    return { version, filename, description, type: "SQL", tool: "flyway" };
  }).sort((a, b) => versionCompare2(a.version, b.version));
}
function listAlembicMigrations(projectDir) {
  const candidates = [
    path24.join(projectDir, "migrations", "versions"),
    path24.join(projectDir, "alembic", "versions")
  ];
  const dir = candidates.find((p) => fs24.existsSync(p));
  if (!dir) return [];
  const files = fs24.readdirSync(dir).filter((f) => f.endsWith(".py") && !f.startsWith("__"));
  return files.map((filename) => {
    const stem = filename.replace(/\.py$/, "");
    const sep2 = stem.indexOf("_");
    const version = sep2 === -1 ? stem : stem.slice(0, sep2);
    const description = sep2 === -1 ? "" : stem.slice(sep2 + 1).replace(/_/g, " ");
    return { version, filename, description, type: "Python", tool: "alembic" };
  }).sort((a, b) => a.filename.localeCompare(b.filename));
}
function listKnexMigrations(projectDir) {
  const dir = path24.join(projectDir, "migrations");
  if (!fs24.existsSync(dir)) return [];
  const files = fs24.readdirSync(dir).filter((f) => (f.endsWith(".js") || f.endsWith(".ts")) && !f.startsWith("."));
  return files.map((filename) => {
    const stem = filename.replace(/\.(js|ts)$/, "");
    const m = stem.match(/^(\d{14})_(.+)$/);
    const version = m ? m[1] : stem;
    const description = m ? m[2].replace(/[_-]/g, " ") : stem;
    const type = filename.endsWith(".ts") ? "TypeScript" : "JavaScript";
    return { version, filename, description, type, tool: "knex" };
  }).sort((a, b) => a.version.localeCompare(b.version));
}
function versionCompare2(a, b) {
  const ax = a.split(".").map(Number);
  const bx = b.split(".").map(Number);
  const len = Math.max(ax.length, bx.length);
  for (let i = 0; i < len; i++) {
    const av = ax[i] ?? 0;
    const bv = bx[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
function adapterFor(projectDir, language) {
  const override = language ? toolForLanguage(language) : void 0;
  return resolveSchemaMigrationAdapter(projectDir, override);
}
async function applySchemaMigrations(args) {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  const r = await adapter.apply({
    instance: args.instance,
    branch: args.branch,
    projectDir,
    database: args.database,
    endpointName: args.endpointName
  });
  if (r.status === "error") {
    throw new SchemaMigrationError(r.error ?? "apply failed");
  }
  return {
    applied: r.applied_migrations,
    alreadyAtLatest: r.status === "noop",
    tool: adapter.id
  };
}
async function rollbackSchemaMigration(args) {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  if (!adapter.rollback) {
    throw new SchemaMigrationError(
      `Adapter '${adapter.id}' does not support rollback. (Flyway Community Edition has no \`undo\`; other adapters may omit rollback by design.)`
    );
  }
  const r = await adapter.rollback({
    instance: args.instance,
    branch: args.branch,
    projectDir,
    target: args.target,
    database: args.database,
    endpointName: args.endpointName
  });
  if (r.status === "error") {
    throw new SchemaMigrationError(r.error ?? "rollback failed");
  }
  return {
    rolledBack: r.rolled_back,
    tool: adapter.id
  };
}
async function schemaMigrationStatus(args) {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  const r = await adapter.status({
    instance: args.instance,
    branch: args.branch,
    projectDir,
    database: args.database,
    endpointName: args.endpointName
  });
  if (r.status === "error") {
    throw new SchemaMigrationError(r.error ?? "status failed");
  }
  return {
    current: r.applied_version ?? void 0,
    pending: r.pending,
    tool: adapter.id
  };
}
function migrationTimestamp(now = /* @__PURE__ */ new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
}
function migrationSlug2(description) {
  return description.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "migration";
}
async function collapseMigrationHeads(args) {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  if (!adapter.collapseHeads) {
    return { status: "noop", headsBefore: [] };
  }
  const r = await adapter.collapseHeads({ projectDir, message: args.message, dryRun: args.dryRun });
  if (r.status === "error") {
    throw new SchemaMigrationError(r.error ?? "collapse heads failed");
  }
  return r;
}

// scripts/lakebase/infra-runner.ts
async function runInfraSuite(args) {
  const start = Date.now();
  const checks = [];
  checks.push(await runCheck("migrations-clean", async () => {
    const status = await schemaMigrationStatus({
      instance: args.instance,
      branch: args.branch,
      projectDir: args.projectDir
    });
    if (status.pending.length === 0) {
      return `no pending migrations (current=${status.current ?? "<none>"}, tool=${status.tool})`;
    }
    throw new Error(
      `${status.pending.length} pending migration(s): ` + status.pending.map((p) => p.version).slice(0, 5).join(", ") + (status.pending.length > 5 ? ", ..." : "")
    );
  }));
  checks.push(await runCheck("schema-diff-computable", async () => {
    const diff = await getSchemaDiff({
      instance: args.instance,
      branch: args.branch,
      comparisonBranch: args.comparisonBranch
    });
    return `diff computed against "${diff.comparisonBranchName || "<self>"}": +${diff.created.length} ~${diff.modified.length} -${diff.removed.length} tables`;
  }));
  checks.push(await runCheck("connection-reachable", async () => {
    const dsn = await getConnection({
      instance: args.instance,
      branch: args.branch,
      output: "dsn"
    });
    if (!dsn.url.startsWith("postgresql://")) {
      throw new Error(`getConnection returned non-DSN url: ${dsn.url.slice(0, 80)}`);
    }
    return `credential mint returned a DSN against ${dsn.host}:${dsn.port}/${dsn.database}`;
  }));
  const result = {
    passed: checks.every((c) => c.passed),
    checks,
    branch: args.branch,
    duration_ms: Date.now() - start
  };
  if (args.junitOutput) {
    fs25.mkdirSync(path25.dirname(args.junitOutput), { recursive: true });
    fs25.writeFileSync(args.junitOutput, formatJUnit(result), "utf8");
  }
  return result;
}
async function runCheck(name, body) {
  const start = Date.now();
  try {
    const detail = await body();
    return { name, passed: true, detail, duration_ms: Date.now() - start };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { name, passed: false, detail, duration_ms: Date.now() - start };
  }
}
function formatJUnit(result) {
  const failures = result.checks.filter((c) => !c.passed).length;
  const totalSeconds = (result.duration_ms / 1e3).toFixed(3);
  const suiteName = "lakebase-infra";
  const cases = result.checks.map((c) => {
    const seconds = (c.duration_ms / 1e3).toFixed(3);
    const detail = escapeXml(c.detail);
    if (c.passed) {
      return `    <testcase classname="${suiteName}" name="${c.name}" time="${seconds}"/>`;
    }
    return [
      `    <testcase classname="${suiteName}" name="${c.name}" time="${seconds}">`,
      `      <failure message="${detail}"/>`,
      `    </testcase>`
    ].join("\n");
  });
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites name="${suiteName}" tests="${result.checks.length}" failures="${failures}" time="${totalSeconds}">`,
    `  <testsuite name="${suiteName}" tests="${result.checks.length}" failures="${failures}" time="${totalSeconds}">`,
    ...cases,
    `  </testsuite>`,
    `</testsuites>`,
    ``
  ].join("\n");
}
function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// scripts/lakebase/scm-claim-feature.ts
import * as fs26 from "fs";
import * as path26 from "path";
var ScmClaimError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ScmClaimError";
  }
  code;
};
var STATES_ALLOWING_CLAIM = [
  "scaffold-complete",
  "merged"
];
async function resolveParentBranch(tierTopology, instance) {
  switch (tierTopology) {
    case 1: {
      const def = await getDefaultBranchId({ projectId: instance });
      if (!def) {
        throw new ScmClaimError(
          `Tier-1 project ${instance} has no default Lakebase branch. Has it been scaffolded?`,
          "missing-instance"
        );
      }
      return def;
    }
    case 2:
      return "staging";
    case 3:
      return "dev";
  }
}
function sanitizeFeatureSlug(featureId) {
  const trimmed = featureId.trim();
  if (trimmed.length === 0) {
    throw new ScmClaimError("feature-id is empty", "invalid-feature-id");
  }
  const sanitized = sanitizeBranchName(trimmed);
  if (!/[a-z0-9]/.test(sanitized)) {
    throw new ScmClaimError(
      `feature-id ${JSON.stringify(featureId)} contains no letters/digits; choose an identifier with at least one alphanumeric.`,
      "invalid-feature-id"
    );
  }
  return sanitized;
}
function featureBranchName(slug) {
  return sanitizeBranchName(`feature/${slug}`);
}
async function claimFeatureBranch(args) {
  const current = readWorkflowState(args.projectDir);
  if (!current) {
    throw new ScmClaimError(
      `No SCM workflow state found at ${path26.join(args.projectDir, ".lakebase/workflow-state.json")}. Run lakebase-create-project to scaffold, or re-seed via the substrate.`,
      "no-state-file"
    );
  }
  const slug = sanitizeFeatureSlug(args.featureId);
  const branch = featureBranchName(slug);
  const idempotent = args.idempotent !== false;
  if (current.state === "feature-claimed") {
    if (idempotent && current.branch === branch) {
      return {
        state: current,
        paired: alreadyClaimedSentinel(current),
        alreadyClaimed: true
      };
    }
    throw new ScmClaimError(
      `Cannot claim ${branch}: workflow is already at feature-claimed for "${current.feature_id ?? current.branch}". Finish it, or abandon it with lakebase-scm-abandon-feature.`,
      "already-claimed-other"
    );
  }
  if (!STATES_ALLOWING_CLAIM.includes(current.state)) {
    throw new ScmClaimError(
      `Cannot claim feature branch from state "${current.state}". Allowed predecessor states: ${STATES_ALLOWING_CLAIM.join(", ")}.`,
      "bad-precondition"
    );
  }
  const instance = args.instance ?? current.project_id;
  if (!instance) {
    throw new ScmClaimError(
      `LAKEBASE_PROJECT_ID is missing. Pass --instance or set it in .env.`,
      "missing-instance"
    );
  }
  const parentBranch = args.parentBranchOverride ?? await resolveParentBranch(current.tier_topology, instance);
  const paired = await createFeaturePairedBranch({
    instance,
    branch,
    parentBranch,
    cwd: args.projectDir
  });
  const now = (args.now ?? (() => /* @__PURE__ */ new Date()))();
  const next = {
    ...current,
    state: "feature-claimed",
    // Record the canonical feature id (case preserved, e.g. "F1-initial-domain")
    // so it matches the .tdd/features/<F> dir + downstream expectations. The
    // lowercased branch slug lives on `branch`, derived separately.
    feature_id: args.featureId.trim(),
    branch: paired.gitBranch,
    parent_branch: parentBranch,
    lakebase_branch_uid: paired.branch.uid,
    claimed_at: now.toISOString(),
    // Reset any later-state fields a previous merged cycle may have
    // left around. Keeping them would mark the new claim as past
    // pr-ready / ci-green which is not the case.
    pr_url: void 0,
    pushed_at: void 0,
    ci_run_url: void 0,
    ci_green_at: void 0,
    merged_at: void 0
  };
  writeWorkflowState(args.projectDir, next);
  return { state: next, paired, alreadyClaimed: false };
}
function alreadyClaimedSentinel(state) {
  return {
    branch: {
      // Reconstructed from the persisted state. Fields the CLI prints
      // (uid, name) are accurate; runtime-only fields (state) are
      // intentionally absent so a caller that diffs against a fresh
      // create cannot mistake this for a live branch.
      uid: state.lakebase_branch_uid,
      // Use the on-disk branch name so this looks legitimate to any
      // logger that just stringifies the result.
      name: state.branch ?? ""
      // Best-effort: leave optional fields blank; they're omitted from
      // the type's required surface so a stripped sentinel still
      // satisfies the structural contract.
    },
    gitBranch: state.branch ?? "",
    gitBranchCreated: false,
    envSynced: false,
    warnings: []
  };
}
function workflowStateFileExists(projectDir) {
  return fs26.existsSync(
    path26.join(projectDir, ".lakebase/workflow-state.json")
  );
}

// scripts/git/inspect.ts
async function getCurrentBranch(args) {
  try {
    const name = await exec2("git rev-parse --abbrev-ref HEAD", {
      cwd: args.cwd
    });
    return name === "HEAD" ? "" : name;
  } catch {
    return "";
  }
}

// scripts/lakebase/scm-adopt-state.ts
var ScmAdoptError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ScmAdoptError";
  }
  code;
};
function inferTierTopology(branches) {
  const names = new Set(
    branches.map((b) => b.name.split("/").pop() ?? "")
  );
  if (names.has("dev") && names.has("staging")) return 3;
  if (names.has("staging")) return 2;
  return 1;
}
function parentForTier(topology, branches) {
  if (topology === 3) return "dev";
  if (topology === 2) return "staging";
  const def = branches.find((b) => b.isDefault === true);
  return def?.name.split("/").pop() ?? "main";
}
var LONG_RUNNING_LEAFS = /* @__PURE__ */ new Set(["staging", "dev", "main", "master"]);
function leafName(b) {
  return b.name.split("/").pop() ?? b.name;
}
async function adoptScmState(args) {
  if (!args.instance) {
    throw new ScmAdoptError(
      "Lakebase project id required (pass --instance or set LAKEBASE_PROJECT_ID in .env).",
      "missing-instance"
    );
  }
  const existing = readWorkflowState(args.projectDir);
  if (existing && !args.force) {
    throw new ScmAdoptError(
      `Workflow state already present at .lakebase/workflow-state.json (state: ${existing.state}). Pass --force to overwrite.`,
      "already-adopted"
    );
  }
  const notes = [];
  const currentBranch = await getCurrentBranch({ cwd: args.projectDir });
  if (!currentBranch) {
    throw new ScmAdoptError(
      "Could not resolve current git branch (detached HEAD?).",
      "missing-current-branch"
    );
  }
  const branches = await listBranches({ instance: args.instance });
  const topology = inferTierTopology(branches);
  notes.push(`Inferred tier_topology=${topology} from Lakebase branches.`);
  const defaultBranch = branches.find((b) => b.isDefault === true);
  const defaultLeaf = defaultBranch ? leafName(defaultBranch) : null;
  const isLongRunningTier = LONG_RUNNING_LEAFS.has(currentBranch) || defaultLeaf !== null && currentBranch === defaultLeaf;
  const base = initWorkflowState({
    projectId: args.instance,
    tierTopology: topology
  });
  if (isLongRunningTier) {
    notes.push(
      `Current git branch "${currentBranch}" is a long-running tier (default / staging / dev). Adopted state: scaffold-complete.`
    );
    writeWorkflowState(args.projectDir, base);
    return { state: base, notes };
  }
  if (!currentBranch.startsWith("feature/")) {
    throw new ScmAdoptError(
      `Current git branch "${currentBranch}" is not a long-running tier or a feature/<slug> branch. The adopter cannot guess the workflow state; switch to the tier you want to seed from, or rename the working branch.`,
      "unrecognized-branch"
    );
  }
  const sanitizedLeaf = currentBranch.replace(/\//g, "-");
  let pair;
  try {
    pair = await getBranchByName(sanitizedLeaf, { instance: args.instance });
  } catch {
    pair = void 0;
  }
  if (!pair) {
    throw new ScmAdoptError(
      `Git branch "${currentBranch}" has no matching Lakebase branch "${sanitizedLeaf}". The orphan must be paired (claim) or deleted before adoption.`,
      "lakebase-pair-missing"
    );
  }
  const now = (args.now ?? (() => /* @__PURE__ */ new Date()))();
  const featureSlug = currentBranch.slice("feature/".length);
  const adopted = {
    ...base,
    state: "feature-claimed",
    feature_id: featureSlug,
    branch: currentBranch,
    parent_branch: parentForTier(topology, branches),
    lakebase_branch_uid: pair.uid,
    claimed_at: now.toISOString()
  };
  writeWorkflowState(args.projectDir, adopted);
  notes.push(
    `Current branch "${currentBranch}" recognized as feature-claimed. Real claim time is unknown; recorded ${adopted.claimed_at} as adoption time.`
  );
  return { state: adopted, notes };
}

// scripts/git/status.ts
async function getAheadBehind(args) {
  const { cwd } = args;
  try {
    const upstream = await exec2("git rev-parse --abbrev-ref @{u}", { cwd });
    const raw = await exec2("git rev-list --left-right --count HEAD...@{u}", {
      cwd
    });
    const parts = raw.trim().split(/\s+/);
    return {
      ahead: parseInt(parts[0], 10) || 0,
      behind: parseInt(parts[1], 10) || 0,
      upstream
    };
  } catch {
    return { ahead: 0, behind: 0, upstream: "" };
  }
}
async function isDirty(args) {
  try {
    const out = await exec2("git status --porcelain", { cwd: args.cwd });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

// scripts/lakebase/scm-abandon-feature.ts
var ScmAbandonError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ScmAbandonError";
  }
  code;
};
async function abandonFeatureBranch(args) {
  const current = readWorkflowState(args.projectDir);
  if (!current) {
    throw new ScmAbandonError(
      `No SCM workflow state found at ${args.projectDir}/.lakebase/workflow-state.json.`,
      "no-state-file"
    );
  }
  if (current.state !== "feature-claimed") {
    throw new ScmAbandonError(
      `abandon refuses state "${current.state}". Only feature-claimed is abandonable; later states must complete or be reverted via gh.`,
      "bad-precondition"
    );
  }
  if (!current.feature_id || !current.branch || !current.parent_branch || !current.lakebase_branch_uid) {
    throw new ScmAbandonError(
      "feature-claimed row is missing required invariants. Cannot abandon safely; consider re-adopting state first.",
      "missing-claim-fields"
    );
  }
  if (!args.force) {
    const dirty = await isDirty({ cwd: args.projectDir });
    if (dirty) {
      throw new ScmAbandonError(
        "Working tree has uncommitted changes; refusing to abandon (the branch delete would lose them). Commit / stash / discard first, or pass --force.",
        "dirty-working-tree"
      );
    }
  }
  const instance = args.instance ?? current.project_id;
  const switchTo = args.switchTo ?? current.parent_branch;
  const warnings = [];
  const headBranch = await getCurrentBranch({ cwd: args.projectDir });
  if (headBranch === current.branch) {
    try {
      await exec2(`git checkout ${JSON.stringify(switchTo)}`, {
        cwd: args.projectDir,
        timeout: 1e4
      });
    } catch (err) {
      warnings.push(
        `git checkout ${switchTo} failed: ${err instanceof Error ? err.message : String(err)}. Local branch delete may be skipped.`
      );
    }
  }
  const del = await deletePairedBranch({
    instance,
    branch: current.branch,
    cwd: args.projectDir
  });
  warnings.push(...del.warnings);
  const reset = {
    $schema: current.$schema,
    version: 1,
    state: "scaffold-complete",
    tier_topology: current.tier_topology,
    project_id: current.project_id
  };
  writeWorkflowState(args.projectDir, reset);
  return {
    state: reset,
    lakebaseDeleted: del.lakebaseDeleted,
    gitLocalDeleted: del.gitLocalDeleted,
    gitRemoteDeleted: del.gitRemoteDeleted,
    warnings
  };
}

// scripts/lakebase/scm-prepare-pr.ts
var ScmPreparePrError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ScmPreparePrError";
  }
  code;
};
async function preparePr(args) {
  const current = readWorkflowState(args.projectDir);
  if (!current) {
    throw new ScmPreparePrError(
      `No SCM workflow state at ${args.projectDir}/.lakebase/workflow-state.json. Claim a feature first.`,
      "no-state-file"
    );
  }
  if (current.state !== "feature-claimed") {
    throw new ScmPreparePrError(
      `prepare-pr refuses state "${current.state}". Allowed predecessor: feature-claimed.`,
      "bad-precondition"
    );
  }
  if (!current.branch || !current.parent_branch || !current.feature_id) {
    throw new ScmPreparePrError(
      "feature-claimed row missing branch / parent_branch / feature_id; refusing to push.",
      "bad-precondition"
    );
  }
  const headBranch = await getCurrentBranch({ cwd: args.projectDir });
  if (headBranch !== current.branch) {
    throw new ScmPreparePrError(
      `HEAD is on "${headBranch}" but workflow state says "${current.branch}". Checkout the feature branch first.`,
      "wrong-branch"
    );
  }
  if (!args.force) {
    const dirty = await isDirty({ cwd: args.projectDir });
    if (dirty) {
      throw new ScmPreparePrError(
        "Working tree has uncommitted changes; commit them before opening the PR (or pass --force).",
        "dirty-working-tree"
      );
    }
  }
  if (!args.allowNoCommits) {
    const ahead = await ensureAheadOfParent(
      args.projectDir,
      current.branch,
      current.parent_branch
    );
    if (ahead === 0) {
      throw new ScmPreparePrError(
        `Branch "${current.branch}" has 0 commits ahead of "${current.parent_branch}". Make at least one commit (or pass --allow-no-commits).`,
        "no-commits-ahead"
      );
    }
  }
  const ownerRepo = await getOwnerRepo(args.projectDir);
  if (!ownerRepo) {
    throw new ScmPreparePrError(
      "No GitHub remote found at origin (or origin is not a github.com URL). Add one before running prepare-pr.",
      "no-github-remote"
    );
  }
  const now = (args.now ?? (() => /* @__PURE__ */ new Date()))();
  let prUrl = args.prUrlOverride ?? "";
  let prCreated = false;
  if (!prUrl) {
    try {
      await exec2(
        `git push -u ${shellEscape(args.remote ?? "origin")} ${shellEscape(current.branch)}`,
        { cwd: args.projectDir, timeout: 6e4 }
      );
    } catch (err) {
      throw new ScmPreparePrError(
        `git push failed: ${err instanceof Error ? err.message : String(err)}`,
        "push-failed"
      );
    }
    const existing = await getPullRequest(ownerRepo, current.branch);
    if (existing) {
      prUrl = existing.url;
    } else {
      try {
        prUrl = await createPullRequest({
          ownerRepo,
          headBranch: current.branch,
          baseBranch: current.parent_branch,
          title: args.title ?? `feat: ${current.feature_id}`,
          body: args.body ?? defaultBody(current.feature_id, current.parent_branch)
        });
        prCreated = true;
      } catch (err) {
        throw new ScmPreparePrError(
          `Failed to create pull request: ${err instanceof Error ? err.message : String(err)}`,
          "pr-failed"
        );
      }
    }
  }
  const next = {
    ...current,
    state: "pr-ready",
    pr_url: prUrl,
    pushed_at: now.toISOString()
  };
  writeWorkflowState(args.projectDir, next);
  return { state: next, prUrl, prCreated };
}
async function ensureAheadOfParent(cwd, branch, parent) {
  try {
    const out = (await exec2(
      `git rev-list --count ${shellEscape(`${parent}..${branch}`)}`,
      { cwd, timeout: 1e4 }
    )).trim();
    return Number.parseInt(out, 10) || 0;
  } catch {
    try {
      const out = (await exec2(
        `git rev-list --count ${shellEscape(`origin/${parent}..${branch}`)}`,
        { cwd, timeout: 1e4 }
      )).trim();
      return Number.parseInt(out, 10) || 0;
    } catch {
      const ab = await getAheadBehind({ cwd });
      return ab.ahead;
    }
  }
}
function defaultBody(featureId, parentBranch) {
  return [
    `Feature: \`${featureId}\``,
    "",
    `Forks from \`${parentBranch}\`.`,
    "",
    "PR opened by `lakebase-scm-prepare-pr` (FEIP-7458 phase B+)."
  ].join("\n");
}
function shellEscape(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// scripts/lakebase/scm-wait-ci.ts
var ScmWaitCiError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ScmWaitCiError";
  }
  code;
};
var DEFAULT_TIMEOUT_MS2 = 30 * 60 * 1e3;
var DEFAULT_POLL_MS = 30 * 1e3;
async function waitForCi(args) {
  const current = readWorkflowState(args.projectDir);
  if (!current) {
    throw new ScmWaitCiError(
      "No SCM workflow state. Claim + prepare-pr first.",
      "no-state-file"
    );
  }
  if (current.state !== "pr-ready") {
    throw new ScmWaitCiError(
      `wait-ci refuses state "${current.state}". Allowed predecessor: pr-ready.`,
      "bad-precondition"
    );
  }
  if (!current.branch) {
    throw new ScmWaitCiError(
      "pr-ready row is missing branch; cannot resolve the PR.",
      "bad-precondition"
    );
  }
  const ownerRepo = await getOwnerRepo(args.projectDir);
  if (!ownerRepo) {
    throw new ScmWaitCiError(
      "No GitHub remote found at origin.",
      "no-github-remote"
    );
  }
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS2;
  const pollMs = args.pollMs ?? DEFAULT_POLL_MS;
  const fetchPr = args.fetchPr ?? getPullRequest;
  const now = args.now ?? (() => /* @__PURE__ */ new Date());
  const headBranch = current.branch;
  let lastPr;
  const result = await pollUntil({
    timeoutMs,
    intervalMs: pollMs,
    now,
    sleep: args.sleep,
    probe: async () => {
      lastPr = await fetchPr(ownerRepo, headBranch);
      if (!lastPr) {
        throw new ScmWaitCiError(
          `No open PR found for head=${headBranch} on ${ownerRepo}. Did the PR get closed?`,
          "pr-not-found"
        );
      }
      if (lastPr.ciStatus === "success") {
        return { done: true, value: lastPr };
      }
      if (lastPr.ciStatus === "failure") {
        const failed = lastPr.checks.filter((c) => /(FAILURE|TIMED_OUT|CANCELLED|ACTION_REQUIRED)/i.test(c.conclusion)).map((c) => `${c.name} (${c.conclusion})`);
        throw new ScmWaitCiError(
          `CI failed for PR ${lastPr.url}. Failed checks: ${failed.join(", ") || "(unknown)"}.`,
          "ci-failed"
        );
      }
      return { done: false };
    }
  });
  if (result.outcome === "timeout") {
    throw new ScmWaitCiError(
      `Timed out after ${Math.round(timeoutMs / 1e3)}s waiting for CI on PR ${lastPr?.url ?? current.pr_url ?? "(unknown)"}. Last status: ${lastPr?.ciStatus ?? "(no poll completed)"}.`,
      "timeout"
    );
  }
  const greenPr = result.value;
  const runUrl = pickRunUrl(greenPr);
  const next = {
    ...current,
    state: "ci-green",
    ci_run_url: runUrl,
    ci_green_at: now().toISOString()
  };
  writeWorkflowState(args.projectDir, next);
  return { state: next, pr: greenPr, polls: result.polls };
}
function pickRunUrl(pr) {
  const withUrl = pr.checks.find((c) => c.detailsUrl);
  return withUrl?.detailsUrl ?? pr.url;
}

// scripts/lakebase/scm-merge.ts
var ScmMergeError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ScmMergeError";
  }
  code;
};
var DEFAULT_MIGRATE_TIMEOUT_MS = 30 * 60 * 1e3;
var DEFAULT_MIGRATE_POLL_MS = 30 * 1e3;
function defaultMigratePredicate(run, mergedAt) {
  if (!run.createdAt) return false;
  const created = Date.parse(run.createdAt);
  if (!Number.isFinite(created)) return false;
  if (run.event && run.event !== "push") return false;
  return created >= mergedAt.getTime() - 5e3;
}
async function mergeFeature(args) {
  const current = readWorkflowState(args.projectDir);
  if (!current) {
    throw new ScmMergeError(
      "No SCM workflow state. wait-ci first.",
      "no-state-file"
    );
  }
  if (current.state !== "ci-green") {
    throw new ScmMergeError(
      `merge refuses state "${current.state}". Allowed predecessor: ci-green.`,
      "bad-precondition"
    );
  }
  if (!current.pr_url) {
    throw new ScmMergeError(
      "ci-green row is missing pr_url; cannot resolve the PR to merge.",
      "no-pr-url"
    );
  }
  if (!current.branch || !current.parent_branch) {
    throw new ScmMergeError(
      "ci-green row missing branch / parent_branch; refusing to merge.",
      "bad-precondition"
    );
  }
  const ownerRepo = await getOwnerRepo(args.projectDir);
  if (!ownerRepo) {
    throw new ScmMergeError(
      "No GitHub remote found at origin.",
      "no-github-remote"
    );
  }
  const pullNumber = extractPullNumber(current.pr_url);
  if (!pullNumber) {
    throw new ScmMergeError(
      `Could not extract PR number from URL: ${current.pr_url}`,
      "bad-pr-url"
    );
  }
  const instance = args.instance ?? current.project_id;
  let paired;
  try {
    paired = await mergePairedPullRequest({
      ownerRepo,
      pullNumber,
      lakebaseInstance: instance,
      method: args.method ?? "squash"
    });
  } catch (err) {
    throw new ScmMergeError(
      `mergePairedPullRequest failed: ${err instanceof Error ? err.message : String(err)}`,
      "merge-failed"
    );
  }
  const warnings = [...paired.warnings];
  let localBranchDeleted = false;
  let headAfter = current.branch;
  if (!args.skipLocalCleanup) {
    const switchTo = args.switchTo ?? current.parent_branch;
    const head = await getCurrentBranch({ cwd: args.projectDir });
    if (head === current.branch) {
      try {
        await exec2(`git checkout ${shellEscape2(switchTo)}`, {
          cwd: args.projectDir,
          timeout: 1e4
        });
        headAfter = switchTo;
      } catch (err) {
        warnings.push(
          `git checkout ${switchTo} failed: ${err instanceof Error ? err.message : String(err)}. Local branch was NOT deleted.`
        );
      }
    } else {
      headAfter = head || current.branch;
    }
    if (headAfter !== current.branch) {
      try {
        await exec2(
          `git branch -D ${shellEscape2(current.branch)}`,
          { cwd: args.projectDir, timeout: 1e4 }
        );
        localBranchDeleted = true;
      } catch (err) {
        warnings.push(
          `git branch -D ${current.branch} failed: ${err instanceof Error ? err.message : String(err)}.`
        );
      }
    }
  }
  const nowFn = args.now ?? (() => /* @__PURE__ */ new Date());
  const mergedAt = nowFn();
  let next = {
    ...current,
    state: "merged",
    merged_at: mergedAt.toISOString()
  };
  writeWorkflowState(args.projectDir, next);
  let migrate;
  const waitMigrate = args.waitMigrate !== false;
  if (waitMigrate) {
    const timeoutMs = args.migrateTimeoutMs ?? DEFAULT_MIGRATE_TIMEOUT_MS;
    const pollMs = args.migratePollMs ?? DEFAULT_MIGRATE_POLL_MS;
    const fetchRuns = args.fetchRuns ?? listWorkflowRuns;
    const predicate = args.migrateRunPredicate ?? defaultMigratePredicate;
    const elapsedSinceMerge = nowFn().getTime() - mergedAt.getTime();
    const remainingTimeoutMs = Math.max(0, timeoutMs - elapsedSinceMerge);
    let polls = 0;
    let matched;
    let lastSeen;
    try {
      const result = await pollUntil({
        timeoutMs: remainingTimeoutMs,
        intervalMs: pollMs,
        now: nowFn,
        sleep: args.sleep,
        probe: async () => {
          const runs = await fetchRuns(ownerRepo, 20);
          const candidates = runs.filter((r) => r.branch === current.parent_branch).filter((r) => predicate(r, mergedAt));
          if (candidates.length === 0) {
            return { done: false };
          }
          candidates.sort(
            (a, b) => Date.parse(b.createdAt ?? "0") - Date.parse(a.createdAt ?? "0")
          );
          lastSeen = candidates[0];
          const status = (lastSeen.status ?? "").toLowerCase();
          return status === "completed" ? { done: true, value: lastSeen } : { done: false };
        }
      });
      polls = result.polls;
      if (result.outcome === "done") {
        matched = result.value;
      }
    } catch (err) {
      warnings.push(
        `Downstream migrate poll errored: ${err instanceof Error ? err.message : String(err)}. Treating as advisory.`
      );
    }
    if (matched) {
      const runUrl = workflowRunUrl(ownerRepo, matched);
      const conclusion = (matched.conclusion ?? "").toLowerCase();
      migrate = {
        waited: true,
        runUrl,
        conclusion,
        polls
      };
      if (conclusion === "success") {
        next = {
          ...next,
          migrate_run_url: runUrl,
          migrate_completed_at: nowFn().toISOString()
        };
        writeWorkflowState(args.projectDir, next);
      } else {
        throw new ScmMergeError(
          `Downstream migrate workflow finished with conclusion=${conclusion}. Run ${runUrl} for details.`,
          "migrate-failed"
        );
      }
    } else {
      migrate = { waited: true, polls };
      throw new ScmMergeError(
        `Timed out after ${Math.round((args.migrateTimeoutMs ?? DEFAULT_MIGRATE_TIMEOUT_MS) / 1e3)}s waiting for the downstream migrate workflow on "${current.parent_branch}". Last seen status: ${lastSeen?.status ?? "(no matching run)"}.`,
        "migrate-timeout"
      );
    }
  } else {
    migrate = { waited: false, polls: 0 };
  }
  return {
    state: next,
    paired,
    localBranchDeleted,
    headAfter,
    migrate,
    warnings
  };
}
function workflowRunUrl(ownerRepo, run) {
  return `https://github.com/${ownerRepo}/actions/runs/${run.id}`;
}
function extractPullNumber(prUrl) {
  const m = prUrl.match(/\/pull\/(\d+)(?:[\/?#].*)?$/);
  if (!m) return void 0;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : void 0;
}
function shellEscape2(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// scripts/git/branches.ts
async function currentBranchName(cwd) {
  try {
    return await exec2("git rev-parse --abbrev-ref HEAD", { cwd });
  } catch {
    return "";
  }
}
async function listLocalBranches(args) {
  const { cwd } = args;
  let raw;
  try {
    raw = await exec2(
      'git branch --format="%(refname:short)|%(upstream:short)|%(upstream:track)"',
      { cwd }
    );
  } catch {
    return [];
  }
  if (!raw) return [];
  const current = await currentBranchName(cwd);
  return raw.split("\n").filter(Boolean).map((line) => {
    const [name, tracking, trackInfo] = line.split("|");
    let ahead = 0;
    let behind = 0;
    if (trackInfo) {
      const aheadMatch = trackInfo.match(/ahead (\d+)/);
      const behindMatch = trackInfo.match(/behind (\d+)/);
      if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
      if (behindMatch) behind = parseInt(behindMatch[1], 10);
    }
    return {
      name,
      isCurrent: name === current,
      isRemote: false,
      tracking: tracking || void 0,
      ahead,
      behind
    };
  });
}

// scripts/lakebase/scm-recover-orphans.ts
var ScmRecoverError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ScmRecoverError";
  }
  code;
};
var TIER_LEAFS = /* @__PURE__ */ new Set(["staging", "dev", "main", "master"]);
async function recoverOrphans(args) {
  if (!args.instance) {
    throw new ScmRecoverError(
      "Lakebase project id required (--instance / LAKEBASE_PROJECT_ID).",
      "missing-instance"
    );
  }
  const lakebaseBranches = await listBranches({ instance: args.instance });
  const tierTopology = inferTierTopology(lakebaseBranches);
  const lakebaseLeafs = new Set(
    lakebaseBranches.map((b) => leafName2(b))
  );
  const defaultLeaf = leafName2(
    lakebaseBranches.find((b) => b.isDefault === true)
  );
  const gitBranches = await listLocalBranches({ cwd: args.projectDir });
  const orphans = [];
  const skipped = [];
  for (const gb of gitBranches) {
    if (gb.isRemote) continue;
    const name = gb.name;
    if (TIER_LEAFS.has(name)) {
      skipped.push({ gitBranch: name, reason: "tier branch" });
      continue;
    }
    if (defaultLeaf && name === defaultLeaf) {
      skipped.push({ gitBranch: name, reason: "default branch" });
      continue;
    }
    const sanitized = sanitizeBranchName(name);
    if (lakebaseLeafs.has(sanitized)) {
      skipped.push({
        gitBranch: name,
        reason: `paired Lakebase branch "${sanitized}" exists`
      });
      continue;
    }
    orphans.push({
      gitBranch: name,
      sanitized,
      isCurrent: gb.isCurrent === true,
      reason: name.startsWith("feature/") ? "feature/<slug> branch with no Lakebase pair" : `non-tier git branch "${name}" with no Lakebase pair`
    });
  }
  const result = {
    tierTopology,
    orphans,
    skipped,
    claimed: []
  };
  if (!args.claim || orphans.length === 0) {
    return result;
  }
  const parentBranch = parentForTopology(tierTopology, defaultLeaf);
  const currentState = readWorkflowState(args.projectDir);
  const candidates = args.onlyBranch ? orphans.filter((o) => o.gitBranch === args.onlyBranch) : orphans;
  if (args.onlyBranch && candidates.length === 0) {
    throw new ScmRecoverError(
      `No orphan found for --only-branch ${args.onlyBranch}.`,
      "claim-conflict"
    );
  }
  const headOrphan = candidates.find((o) => o.isCurrent);
  const stateTargetOrphan = headOrphan ?? candidates[0];
  for (const orphan of candidates) {
    try {
      const paired = await createFeaturePairedBranch({
        instance: args.instance,
        branch: orphan.gitBranch,
        parentBranch,
        cwd: args.projectDir
        // The git branch already exists on disk; the substrate primitive
        // is idempotent on the git side (it'll checkout the existing
        // branch rather than fail) but if the project is not on this
        // branch, we want a no-op git side. Leaving the default true is
        // OK: if the git branch already matches, the checkout is a
        // no-op; if the branch isn't HEAD, the substrate switches to it
        // which is what the user implicitly asked for by including the
        // branch.
      });
      let stateUpdated = false;
      if (orphan === stateTargetOrphan) {
        const next = {
          ...currentState ?? {
            $schema: "./scm-workflow-state.schema.json",
            version: 1,
            state: "scaffold-complete",
            tier_topology: tierTopology,
            project_id: args.instance
          },
          state: "feature-claimed",
          feature_id: orphan.gitBranch.replace(/^feature\//, ""),
          branch: paired.gitBranch,
          parent_branch: parentBranch,
          lakebase_branch_uid: paired.branch.uid,
          claimed_at: (args.now ?? (() => /* @__PURE__ */ new Date()))().toISOString(),
          pr_url: void 0,
          pushed_at: void 0,
          ci_run_url: void 0,
          ci_green_at: void 0,
          merged_at: void 0
        };
        writeWorkflowState(args.projectDir, next);
        stateUpdated = true;
        result.stateUpdatedFor = orphan.gitBranch;
      }
      result.claimed.push({
        candidate: orphan,
        lakebaseBranchUid: paired.branch.uid,
        stateUpdated,
        warnings: paired.warnings
      });
    } catch (err) {
      throw new ScmRecoverError(
        `Substrate claim failed for ${orphan.gitBranch}: ${err instanceof Error ? err.message : String(err)}`,
        "substrate-failure"
      );
    }
  }
  return result;
}
function leafName2(b) {
  if (!b) return "";
  return b.name.split("/").pop() ?? b.name;
}
function parentForTopology(t, defaultLeaf) {
  if (t === 3) return "dev";
  if (t === 2) return "staging";
  return defaultLeaf || "main";
}

// scripts/lakebase/scm-doctor.ts
import * as fs27 from "fs";
import * as path27 from "path";

// scripts/tdd/stale-branches.ts
import { existsSync as existsSync28, readdirSync as readdirSync14, statSync as statSync8 } from "fs";
import { join as join30 } from "path";

// scripts/tdd/story-pipeline.ts
import { existsSync as existsSync26, readFileSync as readFileSync15, writeFileSync as writeFileSync16, mkdirSync as mkdirSync14, readdirSync as readdirSync12, statSync as statSync6 } from "fs";
import { dirname as dirname9, join as join28 } from "path";
function initPipeline(featureId) {
  return { version: 1, feature_id: featureId, stories: {}, build_queue: [], build_active: null };
}
function pipelinePath(tddDir, featureId) {
  return join28(tddDir, "features", featureId, "pipeline.json");
}
function readPipeline(tddDir, featureId) {
  const p = pipelinePath(tddDir, featureId);
  if (!existsSync26(p)) return initPipeline(featureId);
  return JSON.parse(readFileSync15(p, "utf8"));
}

// scripts/tdd/spike.ts
import { existsSync as existsSync27, mkdirSync as mkdirSync15, readdirSync as readdirSync13, readFileSync as readFileSync16, statSync as statSync7, writeFileSync as writeFileSync17 } from "fs";
import { join as join29 } from "path";
function listSpikes(tddDir) {
  const root = join29(tddDir, "spikes");
  if (!existsSync27(root)) return [];
  const out = [];
  for (const slug of readdirSync13(root)) {
    const dir = join29(root, slug);
    if (!statSync7(dir).isDirectory()) continue;
    const branchFile = join29(dir, "branch.txt");
    if (!existsSync27(branchFile)) continue;
    out.push({
      spike_slug: slug,
      branch_id: readFileSync16(branchFile, "utf8").trim(),
      created_at: statSync7(branchFile).birthtime.toISOString(),
      dir
    });
  }
  return out;
}

// scripts/tdd/stale-branches.ts
function listPipelineFeatures(tddDir) {
  const featuresDir = join30(tddDir, "features");
  if (!existsSync28(featuresDir)) return [];
  return readdirSync14(featuresDir).filter((d) => statSync8(join30(featuresDir, d)).isDirectory()).filter((d) => existsSync28(join30(featuresDir, d, "pipeline.json"))).sort();
}
function findStaleBranches(tddDir) {
  const findings = [];
  for (const featureId of listPipelineFeatures(tddDir)) {
    const pipeline = readPipeline(tddDir, featureId);
    for (const [storyId, story] of Object.entries(pipeline.stories)) {
      const exp = story.experiment;
      if (!exp) continue;
      const storyTerminal = story.status === "done" || story.status === "discarded";
      if (exp.status === "active" && storyTerminal) {
        findings.push({
          kind: "experiment",
          slug: exp.slug,
          feature_id: pipeline.feature_id,
          story_id: storyId,
          branch: exp.branch,
          reason: `story is ${story.status} but its experiment branch is still active (merge/discard teardown likely failed); a paired Lakebase branch may be lingering`
        });
      }
    }
  }
  for (const spike of listSpikes(tddDir)) {
    findings.push({
      kind: "spike",
      slug: spike.spike_slug,
      branch: spike.branch_id,
      reason: "spike has a paired branch; spikes are throwaway (only their learning carries forward), tear it down to reclaim the branch"
    });
  }
  return findings;
}

// scripts/lakebase/scm-doctor.ts
var FEATURE_PREFIX = "feature/";
var TIER_LEAFS2 = /* @__PURE__ */ new Set(["staging", "dev"]);
function readEnv(projectDir) {
  const envPath = path27.join(projectDir, ".env");
  const out = /* @__PURE__ */ new Map();
  if (!fs27.existsSync(envPath)) return out;
  const lines = fs27.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) out.set(m[1], m[2].replace(/^["']|["']$/g, ""));
  }
  return out;
}
function leafOf2(b) {
  return b.name.split("/").pop() ?? b.name;
}
function worstOf(a, b) {
  const order = ["ok", "warn", "fail"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
}
async function runDoctor(args) {
  const projectDir = args.projectDir;
  const findings = [];
  const env = readEnv(projectDir);
  const instance = args.instance ?? env.get("LAKEBASE_PROJECT_ID");
  const state = readWorkflowState(projectDir);
  const workflowStatePresent = state !== null;
  for (const stale of findStaleBranches(path27.join(projectDir, ".tdd"))) {
    const where = stale.feature_id ? ` ${stale.feature_id}/${stale.story_id}` : "";
    findings.push({
      id: `stale-${stale.kind}`,
      severity: "warn",
      message: `Stale ${stale.kind}${where} "${stale.slug}"${stale.branch ? ` (branch ${stale.branch})` : ""}: ${stale.reason}.`,
      suggestion: stale.kind === "experiment" ? `lakebase-tdd-experiment discard --feature ${stale.feature_id} --story ${stale.story_id} --slug ${stale.slug} --instance <id> --approver <you> --reason "doctor: stale experiment"` : "lakebase-tdd-spike teardown (or delete the spike's paired branch) once its learning has carried forward"
    });
  }
  if (!workflowStatePresent) {
    findings.push({
      id: "no-state-file",
      severity: "fail",
      message: "No .lakebase/workflow-state.json. Either the project pre-dates the SCM workflow or scaffold did not seed it.",
      suggestion: "lakebase-scm-adopt-state"
    });
  }
  if (!env.has("LAKEBASE_PROJECT_ID")) {
    findings.push({
      id: "env-missing-project-id",
      severity: "fail",
      message: ".env does not contain LAKEBASE_PROJECT_ID. The post-checkout hook will exit early; workflow CLIs will need an explicit --instance.",
      suggestion: "Set LAKEBASE_PROJECT_ID=<your project id> in .env"
    });
  }
  if (!instance) {
    return finalize({
      projectDir,
      workflowStatePresent,
      state: state ?? void 0,
      findings
    });
  }
  let lakebaseBranches = [];
  try {
    lakebaseBranches = await listBranches({ instance });
  } catch (err) {
    findings.push({
      id: "lakebase-unreachable",
      severity: "fail",
      message: `Could not list Lakebase branches for instance ${instance}: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: "databricks auth login (or check DATABRICKS_CONFIG_PROFILE)."
    });
    return finalize({
      projectDir,
      workflowStatePresent,
      state: state ?? void 0,
      findings
    });
  }
  const inferredTopology = inferTierTopology(lakebaseBranches);
  if (state && state.tier_topology !== inferredTopology) {
    findings.push({
      id: "tier-topology-mismatch",
      severity: "warn",
      message: `workflow-state records tier_topology=${state.tier_topology}, but the Lakebase tier inventory suggests ${inferredTopology}.`,
      suggestion: "lakebase-scm-adopt-state --force"
    });
  }
  const headBranch = await getCurrentBranch({ cwd: projectDir });
  if (state && state.state === "feature-claimed") {
    if (state.branch && headBranch && headBranch !== state.branch) {
      findings.push({
        id: "head-branch-drift",
        severity: "warn",
        message: `workflow says feature-claimed for "${state.branch}", but HEAD is on "${headBranch}".`,
        suggestion: `git checkout '${state.branch}'`
      });
    }
    if (state.branch) {
      const sanitized = sanitizeBranchName(state.branch);
      let pair;
      try {
        pair = await getBranchByName(sanitized, { instance });
      } catch {
        pair = void 0;
      }
      if (!pair) {
        findings.push({
          id: "lakebase-pair-missing",
          severity: "fail",
          message: `workflow says feature-claimed for "${state.branch}", but no Lakebase branch "${sanitized}" exists.`,
          suggestion: `lakebase-scm-abandon-feature  # reset state; re-claim if needed`
        });
      } else if (state.lakebase_branch_uid && pair.uid !== state.lakebase_branch_uid) {
        findings.push({
          id: "lakebase-uid-drift",
          severity: "warn",
          message: `workflow records lakebase_branch_uid=${state.lakebase_branch_uid}, but the live branch reports ${pair.uid}.`,
          suggestion: "lakebase-scm-adopt-state --force"
        });
      }
    }
  }
  if (state && state.state === "feature-claimed" && state.branch) {
    const envBranchId = env.get("LAKEBASE_BRANCH_ID");
    const sanitized = sanitizeBranchName(state.branch);
    if (envBranchId && envBranchId !== sanitized) {
      findings.push({
        id: "env-branch-drift",
        severity: "warn",
        message: `.env LAKEBASE_BRANCH_ID=${envBranchId} but workflow says ${sanitized}. The post-checkout hook may not have run since the last branch switch.`,
        suggestion: `git checkout '${state.branch}'  # re-fires post-checkout`
      });
    }
  }
  if (headBranch && !TIER_LEAFS2.has(headBranch) && headBranch.startsWith(FEATURE_PREFIX)) {
    const sanitized = sanitizeBranchName(headBranch);
    const paired = lakebaseBranches.some((b) => leafOf2(b) === sanitized);
    if (!paired) {
      findings.push({
        id: "orphan-current-branch",
        severity: "fail",
        message: `Current git branch "${headBranch}" has no Lakebase pair (post-checkout fallback retired in phase C).`,
        suggestion: `lakebase-scm-recover-orphans --claim --only-branch '${headBranch}'`
      });
    }
  }
  try {
    const heads = await collapseMigrationHeads({ projectDir, dryRun: true });
    if (heads.headsBefore.length > 1) {
      findings.push({
        id: "multiple-migration-heads",
        severity: "fail",
        message: `Migrations have ${heads.headsBefore.length} heads (${heads.headsBefore.join(", ")}); a sibling-feature merge left them un-collapsed. \`upgrade head\` will refuse until they are unified.`,
        suggestion: "lakebase-tdd-collapse-heads"
      });
    }
  } catch {
  }
  return finalize({
    projectDir,
    workflowStatePresent,
    state: state ?? void 0,
    inferredTierTopology: inferredTopology,
    findings
  });
}
function finalize(report) {
  let worst = "ok";
  for (const f of report.findings) {
    worst = worstOf(worst, f.severity);
  }
  return { ...report, worstSeverity: worst };
}
var ScmDoctorFixError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ScmDoctorFixError";
  }
  code;
};
var FIXABLE_FINDING_IDS = [
  "env-branch-drift",
  "head-branch-drift",
  "tier-topology-mismatch",
  "orphan-current-branch",
  "multiple-migration-heads"
];
async function fixFinding(args) {
  if (!FIXABLE_FINDING_IDS.includes(args.findingId)) {
    throw new ScmDoctorFixError(
      `Finding "${args.findingId}" is not supported by --fix. Supported: ${FIXABLE_FINDING_IDS.join(", ")}.`,
      "unsupported-finding"
    );
  }
  const report = args.report ?? await runDoctor({ projectDir: args.projectDir, instance: args.instance });
  const present = report.findings.find((f) => f.id === args.findingId);
  if (!present) {
    throw new ScmDoctorFixError(
      `Finding "${args.findingId}" is not present in the current report. Re-run lakebase-scm-doctor to see what needs fixing.`,
      "finding-not-present"
    );
  }
  let action = "";
  try {
    switch (args.findingId) {
      case "env-branch-drift": {
        const branch = report.state?.branch;
        if (!branch) {
          throw new ScmDoctorFixError(
            "Cannot fix: workflow state has no branch field.",
            "fix-failed"
          );
        }
        const sanitized = sanitizeBranchName(branch);
        updateEnvConnection({
          envPath: path27.join(args.projectDir, ".env"),
          branchId: sanitized,
          databaseUrl: "",
          username: "",
          password: ""
        });
        action = `rewrote .env LAKEBASE_BRANCH_ID=${sanitized} (credentials left empty; next post-checkout or manual mint refreshes them)`;
        break;
      }
      case "head-branch-drift": {
        const branch = report.state?.branch;
        if (!branch) {
          throw new ScmDoctorFixError(
            "Cannot fix: workflow state has no branch field.",
            "fix-failed"
          );
        }
        await exec2(`git checkout ${shellEscape3(branch)}`, {
          cwd: args.projectDir,
          timeout: 15e3
        });
        action = `git checkout ${branch} (re-fires post-checkout to resync HEAD)`;
        break;
      }
      case "tier-topology-mismatch": {
        const instance = args.instance ?? report.state?.project_id;
        if (!instance) {
          throw new ScmDoctorFixError(
            "Cannot fix: missing Lakebase project id.",
            "fix-failed"
          );
        }
        await adoptScmState({
          projectDir: args.projectDir,
          instance,
          force: true
        });
        action = `adopted state with --force to re-infer tier_topology`;
        break;
      }
      case "orphan-current-branch": {
        const instance = args.instance ?? report.state?.project_id;
        if (!instance) {
          throw new ScmDoctorFixError(
            "Cannot fix: missing Lakebase project id.",
            "fix-failed"
          );
        }
        const headBranch = await getCurrentBranch({ cwd: args.projectDir });
        if (!headBranch) {
          throw new ScmDoctorFixError(
            "Cannot fix: detached HEAD or no current branch.",
            "fix-failed"
          );
        }
        await recoverOrphans({
          projectDir: args.projectDir,
          instance,
          claim: true,
          onlyBranch: headBranch
        });
        action = `recovered orphan ${headBranch} via createFeaturePairedBranch`;
        break;
      }
      case "multiple-migration-heads": {
        const r = await collapseMigrationHeads({ projectDir: args.projectDir });
        if (r.status !== "ok" || !r.mergeRevision) {
          throw new ScmDoctorFixError(
            `Expected to create a merge revision but got status="${r.status}".`,
            "fix-failed"
          );
        }
        action = `collapsed ${r.headsBefore.length} heads into merge revision ${r.mergeRevision} (commit it)`;
        break;
      }
    }
  } catch (err) {
    if (err instanceof ScmDoctorFixError) throw err;
    throw new ScmDoctorFixError(
      `Remediation failed: ${err instanceof Error ? err.message : String(err)}`,
      "fix-failed"
    );
  }
  const postReport = await runDoctor({
    projectDir: args.projectDir,
    instance: args.instance
  });
  return { findingId: args.findingId, action, postReport };
}
function shellEscape3(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// scripts/lakebase/secret-auth.ts
var NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;
async function ensureLakebaseSecretAuth(args) {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const tokenLifetimeSeconds = args.tokenLifetimeSeconds ?? NINETY_DAYS_SECONDS;
  const tokenComment = args.tokenComment ?? `Lakebase auth (scope=${args.scopeName})`;
  const { profile, scopeName, keyName, servicePrincipalClientId } = args;
  let scopeCreated = false;
  try {
    await exec2(
      `databricks secrets create-scope "${escapeShellArg5(scopeName)}" --profile "${escapeShellArg5(profile)}"`,
      { timeout: timeoutMs }
    );
    scopeCreated = true;
  } catch (err) {
    const msg = err.message;
    if (!isAlreadyExistsError(msg)) throw err;
  }
  const tokenJson = await exec2(
    `databricks tokens create --comment "${escapeShellArg5(tokenComment)}" --lifetime-seconds ${tokenLifetimeSeconds} -o json --profile "${escapeShellArg5(profile)}"`,
    { timeout: timeoutMs }
  );
  const tokenStart = tokenJson.indexOf("{");
  if (tokenStart < 0) {
    throw new Error(`databricks tokens create returned no JSON: ${tokenJson.slice(0, 200)}`);
  }
  const parsed = JSON.parse(tokenJson.slice(tokenStart));
  const pat = parsed.token_value;
  if (typeof pat !== "string" || !pat) {
    throw new Error("databricks tokens create returned no token_value");
  }
  await exec2(
    `databricks secrets put-secret "${escapeShellArg5(scopeName)}" "${escapeShellArg5(keyName)}" --string-value "${escapeShellArg5(pat)}" --profile "${escapeShellArg5(profile)}"`,
    { timeout: timeoutMs }
  );
  let aclGranted = false;
  if (servicePrincipalClientId) {
    try {
      await exec2(
        `databricks secrets put-acl "${escapeShellArg5(scopeName)}" "${escapeShellArg5(servicePrincipalClientId)}" READ --profile "${escapeShellArg5(profile)}"`,
        { timeout: timeoutMs }
      );
      aclGranted = true;
    } catch {
    }
  }
  return {
    scope: scopeName,
    key: keyName,
    scopeCreated,
    patStored: true,
    aclGranted
  };
}
function isAlreadyExistsError(msg) {
  return /already exists|SCOPE_ALREADY_EXISTS|RESOURCE_ALREADY_EXISTS/i.test(msg);
}
function escapeShellArg5(s) {
  return s.replace(/"/g, '\\"');
}

// scripts/lakebase/update-commands.ts
import * as fs28 from "fs";
import * as path28 from "path";
var COMMAND_HOOK_FILE_PATTERN = /\.(pre|post)-hook\.md$/;
function findKitCommandsDir(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path28.join(
      dir,
      "templates",
      "project",
      "common",
      ".claude",
      "commands"
    );
    if (fs28.existsSync(candidate)) return candidate;
    const parent = path28.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project/common/.claude/commands/ relative to ${start}. Pass explicit kitDir.`
  );
}
function readKitVersion(kitCommandsDir) {
  let dir = kitCommandsDir;
  for (let i = 0; i < 5; i++) {
    dir = path28.dirname(dir);
  }
  try {
    const raw = fs28.readFileSync(path28.join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
function applyCommandPlaceholders(content, version) {
  return content.replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
}
function updateCommands(args) {
  const projectCommandsDir = path28.join(args.projectDir, ".claude", "commands");
  const here = path28.dirname(new URL(import.meta.url).pathname);
  const kitCommandsDir = args.kitDir ? path28.join(args.kitDir, "templates", "project", "common", ".claude", "commands") : findKitCommandsDir(here);
  const dryRun = args.dryRun === true;
  const force = args.force !== false;
  const templateFiles = fs28.existsSync(kitCommandsDir) ? fs28.readdirSync(kitCommandsDir).filter((f) => f.endsWith(".md") && !COMMAND_HOOK_FILE_PATTERN.test(f)) : [];
  if (!dryRun && templateFiles.length > 0 && !fs28.existsSync(projectCommandsDir)) {
    fs28.mkdirSync(projectCommandsDir, { recursive: true });
  }
  const version = readKitVersion(kitCommandsDir);
  const files = [];
  for (const name of templateFiles) {
    const projectPath2 = path28.join(projectCommandsDir, name);
    const templatePath = path28.join(kitCommandsDir, name);
    const templateRaw = fs28.readFileSync(templatePath, "utf-8");
    const desired = applyCommandPlaceholders(templateRaw, version);
    const existed = fs28.existsSync(projectPath2);
    const current = existed ? fs28.readFileSync(projectPath2, "utf-8") : "";
    let outcome;
    if (!existed) {
      outcome = "added";
    } else if (current === desired) {
      outcome = "unchanged";
    } else if (!force) {
      outcome = "preserved";
    } else {
      outcome = "updated";
    }
    if (!dryRun && (outcome === "added" || outcome === "updated")) {
      fs28.writeFileSync(projectPath2, desired);
    }
    files.push({ name, outcome });
  }
  const order = {
    added: 0,
    updated: 1,
    preserved: 2,
    unchanged: 3
  };
  files.sort((a, b) => order[a.outcome] - order[b.outcome] || a.name.localeCompare(b.name));
  const changed = files.some((f) => f.outcome === "added" || f.outcome === "updated");
  return { files, changed };
}

// scripts/lakebase/workflow-drift.ts
import * as fs29 from "fs";
import * as path29 from "path";
function findKitTemplatesDir(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path29.join(
      dir,
      "templates",
      "project",
      "common",
      ".github",
      "workflows"
    );
    if (fs29.existsSync(candidate)) return candidate;
    const parent = path29.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project/common/.github/workflows/ relative to ${start}. Pass explicit kitDir.`
  );
}
function unifiedDiff(name, projectContent, templateContent) {
  if (projectContent === templateContent) return "";
  const a = projectContent.split("\n");
  const b = templateContent.split("\n");
  const out = [`--- project/${name}`, `+++ template/${name}`];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === bv) continue;
    if (av !== void 0) out.push(`-${i + 1}: ${av}`);
    if (bv !== void 0) out.push(`+${i + 1}: ${bv}`);
  }
  return out.join("\n");
}
function detectWorkflowDrift(args) {
  const projectWorkflowsDir = path29.join(
    args.projectDir,
    ".github",
    "workflows"
  );
  const here = path29.dirname(new URL(import.meta.url).pathname);
  const kitWorkflowsDir = args.kitDir ? path29.join(
    args.kitDir,
    "templates",
    "project",
    "common",
    ".github",
    "workflows"
  ) : findKitTemplatesDir(here);
  const templateFiles = fs29.existsSync(kitWorkflowsDir) ? fs29.readdirSync(kitWorkflowsDir).filter((f) => f.endsWith(".yml")) : [];
  const projectFiles = fs29.existsSync(projectWorkflowsDir) ? fs29.readdirSync(projectWorkflowsDir).filter((f) => f.endsWith(".yml")) : [];
  const seen = /* @__PURE__ */ new Set();
  const files = [];
  for (const name of templateFiles) {
    seen.add(name);
    const projectPath2 = path29.join(projectWorkflowsDir, name);
    const templatePath = path29.join(kitWorkflowsDir, name);
    if (!fs29.existsSync(projectPath2)) {
      files.push({ name, status: "missing" });
      continue;
    }
    const projectContent = fs29.readFileSync(projectPath2, "utf8");
    const templateContent = fs29.readFileSync(templatePath, "utf8");
    if (projectContent === templateContent) {
      files.push({ name, status: "unchanged" });
    } else {
      files.push({
        name,
        status: "drifted",
        diff: unifiedDiff(name, projectContent, templateContent)
      });
    }
  }
  for (const name of projectFiles) {
    if (seen.has(name)) continue;
    files.push({ name, status: "extra" });
  }
  const order = {
    drifted: 0,
    missing: 1,
    extra: 2,
    unchanged: 3
  };
  files.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  const hasDrift = files.some((f) => f.status === "drifted" || f.status === "missing");
  return {
    overall: hasDrift ? "drift" : "ok",
    files
  };
}
function readKitVersion2(kitWorkflowsDir) {
  let dir = kitWorkflowsDir;
  for (let i = 0; i < 5; i++) {
    dir = path29.dirname(dir);
  }
  try {
    const raw = fs29.readFileSync(path29.join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
function applyPlaceholders(content, version) {
  return content.replace(/\{\{LAKEBASE_KIT_VERSION\}\}/g, version);
}
function applyCommandPlaceholders2(content, version) {
  return content.replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
}
var COMMAND_HOOK_FILE_PATTERN2 = /\.(pre|post)-hook\.md$/;
function findKitCommandsDir2(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path29.join(
      dir,
      "templates",
      "project",
      "common",
      ".claude",
      "commands"
    );
    if (fs29.existsSync(candidate)) return candidate;
    const parent = path29.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project/common/.claude/commands/ relative to ${start}. Pass explicit kitDir.`
  );
}
function parsePinnedVersion(content) {
  const m = content.match(/^\s*[*_>`\s]*pinned\s+to\s*:\s*[`*_]*([^\s`*_]+)[`*_]*\s*$/im);
  return m ? m[1] : void 0;
}
function detectCommandDrift(args) {
  const projectCommandsDir = path29.join(args.projectDir, ".claude", "commands");
  const here = path29.dirname(new URL(import.meta.url).pathname);
  const kitCommandsDir = args.kitDir ? path29.join(args.kitDir, "templates", "project", "common", ".claude", "commands") : findKitCommandsDir2(here);
  const kitVersion2 = readKitVersionFromCommandsDir(kitCommandsDir);
  const templateFiles = fs29.existsSync(kitCommandsDir) ? fs29.readdirSync(kitCommandsDir).filter((f) => f.endsWith(".md") && !COMMAND_HOOK_FILE_PATTERN2.test(f)) : [];
  const projectFiles = fs29.existsSync(projectCommandsDir) ? fs29.readdirSync(projectCommandsDir).filter((f) => f.endsWith(".md") && !COMMAND_HOOK_FILE_PATTERN2.test(f)) : [];
  const seen = /* @__PURE__ */ new Set();
  const files = [];
  for (const name of templateFiles) {
    seen.add(name);
    const projectPath2 = path29.join(projectCommandsDir, name);
    const templatePath = path29.join(kitCommandsDir, name);
    const templateRaw = fs29.readFileSync(templatePath, "utf8");
    if (!fs29.existsSync(projectPath2)) {
      files.push({ name, status: "missing", kit_version: kitVersion2 });
      continue;
    }
    const projectContent = fs29.readFileSync(projectPath2, "utf8");
    const pinned = parsePinnedVersion(projectContent);
    const versionForCompare = pinned ?? kitVersion2;
    const templateContent = applyCommandPlaceholders2(templateRaw, versionForCompare);
    if (projectContent === templateContent) {
      files.push({
        name,
        status: "unchanged",
        pinned_version: pinned,
        kit_version: kitVersion2
      });
    } else {
      files.push({
        name,
        status: "drifted",
        pinned_version: pinned,
        kit_version: kitVersion2,
        diff: unifiedDiff(name, projectContent, templateContent)
      });
    }
  }
  for (const name of projectFiles) {
    if (seen.has(name)) continue;
    files.push({ name, status: "extra", kit_version: kitVersion2 });
  }
  const order = {
    drifted: 0,
    missing: 1,
    extra: 2,
    unchanged: 3
  };
  files.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  const hasDrift = files.some((f) => f.status === "drifted" || f.status === "missing");
  return { overall: hasDrift ? "drift" : "ok", files };
}
function readKitVersionFromCommandsDir(kitCommandsDir) {
  let dir = kitCommandsDir;
  for (let i = 0; i < 5; i++) {
    dir = path29.dirname(dir);
  }
  try {
    const raw = fs29.readFileSync(path29.join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
function detectScaffoldedDrift(args) {
  const workflows = detectWorkflowDrift(args);
  const commands = detectCommandDrift(args);
  return {
    overall: workflows.overall === "drift" || commands.overall === "drift" ? "drift" : "ok",
    workflows,
    commands
  };
}
function updateWorkflows(args) {
  const projectWorkflowsDir = path29.join(
    args.projectDir,
    ".github",
    "workflows"
  );
  const here = path29.dirname(new URL(import.meta.url).pathname);
  const kitWorkflowsDir = args.kitDir ? path29.join(
    args.kitDir,
    "templates",
    "project",
    "common",
    ".github",
    "workflows"
  ) : findKitTemplatesDir(here);
  const substitute = args.substitute !== false;
  const dryRun = args.dryRun === true;
  const pruneExtras = args.pruneExtras === true;
  const templateFiles = fs29.existsSync(kitWorkflowsDir) ? fs29.readdirSync(kitWorkflowsDir).filter((f) => f.endsWith(".yml")) : [];
  const projectFiles = fs29.existsSync(projectWorkflowsDir) ? fs29.readdirSync(projectWorkflowsDir).filter((f) => f.endsWith(".yml")) : [];
  if (!dryRun && templateFiles.length > 0 && !fs29.existsSync(projectWorkflowsDir)) {
    fs29.mkdirSync(projectWorkflowsDir, { recursive: true });
  }
  const version = substitute ? readKitVersion2(kitWorkflowsDir) : "";
  const seen = /* @__PURE__ */ new Set();
  const files = [];
  for (const name of templateFiles) {
    seen.add(name);
    const projectPath2 = path29.join(projectWorkflowsDir, name);
    const templatePath = path29.join(kitWorkflowsDir, name);
    const templateRaw = fs29.readFileSync(templatePath, "utf-8");
    const desired = substitute ? applyPlaceholders(templateRaw, version) : templateRaw;
    const existed = fs29.existsSync(projectPath2);
    const current = existed ? fs29.readFileSync(projectPath2, "utf-8") : "";
    let outcome;
    if (!existed) {
      outcome = "added";
    } else if (current === desired) {
      outcome = "unchanged";
    } else {
      outcome = "updated";
    }
    if (!dryRun && outcome !== "unchanged") {
      fs29.writeFileSync(projectPath2, desired);
    }
    files.push({ name, outcome });
  }
  if (pruneExtras) {
    for (const name of projectFiles) {
      if (seen.has(name)) continue;
      const projectPath2 = path29.join(projectWorkflowsDir, name);
      if (!dryRun) {
        fs29.unlinkSync(projectPath2);
      }
      files.push({ name, outcome: "removed" });
    }
  }
  const order = {
    added: 0,
    updated: 1,
    removed: 2,
    unchanged: 3
  };
  files.sort((a, b) => order[a.outcome] - order[b.outcome] || a.name.localeCompare(b.name));
  const changed = files.some((f) => f.outcome !== "unchanged");
  return { files, changed };
}

// scripts/lakebase/uc-resources.ts
var DEFAULT_CREATE_COMMENT = "Created by lakebase-app-dev-kit";
async function catalogExists(args) {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  try {
    await exec2(
      `databricks api get /api/2.1/unity-catalog/catalogs/${escapeShellArg6(args.catalog)} --profile "${escapeShellArg6(args.profile)}"`,
      { timeout: timeoutMs }
    );
    return true;
  } catch (err) {
    if (isUcMissingError(err.message)) return false;
    throw err;
  }
}
async function tryCreateCatalog(args) {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const comment = args.comment ?? DEFAULT_CREATE_COMMENT;
  const payload = JSON.stringify({ name: args.catalog, comment });
  try {
    await exec2(
      `databricks api post /api/2.1/unity-catalog/catalogs --profile "${escapeShellArg6(args.profile)}" --json '${escapeSingleQuoted2(payload)}'`,
      { timeout: timeoutMs }
    );
    return { created: true };
  } catch (err) {
    return { created: false, error: err.message };
  }
}
async function ensureSchemaAndVolume(args) {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const comment = args.comment ?? DEFAULT_CREATE_COMMENT;
  const volumeType = args.volumeType ?? "MANAGED";
  const { profile, catalog, schema, volume } = args;
  let schemaCreated = false;
  let exists = await ucResourceExists(`/api/2.1/unity-catalog/schemas/${catalog}.${schema}`, profile, timeoutMs);
  if (!exists) {
    const payload = JSON.stringify({ name: schema, catalog_name: catalog, comment });
    await exec2(
      `databricks api post /api/2.1/unity-catalog/schemas --profile "${escapeShellArg6(profile)}" --json '${escapeSingleQuoted2(payload)}'`,
      { timeout: timeoutMs }
    );
    schemaCreated = true;
  }
  let volumeCreated = false;
  exists = await ucResourceExists(
    `/api/2.1/unity-catalog/volumes/${catalog}.${schema}.${volume}`,
    profile,
    timeoutMs
  );
  if (!exists) {
    const payload = JSON.stringify({
      catalog_name: catalog,
      schema_name: schema,
      name: volume,
      volume_type: volumeType,
      comment
    });
    await exec2(
      `databricks api post /api/2.1/unity-catalog/volumes --profile "${escapeShellArg6(profile)}" --json '${escapeSingleQuoted2(payload)}'`,
      { timeout: timeoutMs }
    );
    volumeCreated = true;
  }
  return { schemaCreated, volumeCreated };
}
var DEFAULT_APP_PERMS = [
  "USE_CATALOG",
  "USE_SCHEMA",
  "READ_VOLUME",
  "WRITE_VOLUME"
];
async function grantUcCatalogPermission(args) {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const permissions = args.permissions ?? DEFAULT_APP_PERMS;
  const payload = JSON.stringify({
    changes: [
      {
        principal: args.servicePrincipalName,
        add: permissions
      }
    ]
  });
  await exec2(
    `databricks api patch /api/2.1/unity-catalog/permissions/catalog/${escapeShellArg6(args.catalog)} --profile "${escapeShellArg6(args.profile)}" --json '${escapeSingleQuoted2(payload)}'`,
    { timeout: timeoutMs }
  );
  return { granted: true };
}
function catalogExplorerUrl(workspaceHost) {
  return `${workspaceHost.replace(/\/+$/, "")}/explore/data`;
}
async function ucResourceExists(apiPath, profile, timeoutMs) {
  try {
    await exec2(`databricks api get ${apiPath} --profile "${escapeShellArg6(profile)}"`, { timeout: timeoutMs });
    return true;
  } catch (err) {
    if (isUcMissingError(err.message)) return false;
    throw err;
  }
}
function isUcMissingError(msg) {
  return /RESOURCE_DOES_NOT_EXIST|does not exist|status:? 404\b|NOT_FOUND/i.test(msg);
}
function escapeShellArg6(s) {
  return s.replace(/"/g, '\\"');
}
function escapeSingleQuoted2(s) {
  return s.replace(/'/g, `'\\''`);
}
export {
  CONVENTION_TIER_DEFAULTS,
  FIXABLE_FINDING_IDS,
  InitializrNetworkError,
  InitializrParseError,
  LakebaseBranchError,
  LakebaseBranchTtlTooLongError,
  LakebaseProjectError,
  PLAYWRIGHT_TEMPLATE_FILES,
  PLAYWRIGHT_TEST_VERSION_RANGE,
  SCM_STATES,
  STATE_FILE_REL,
  SchemaMigrationError,
  ScmAbandonError,
  ScmAdoptError,
  ScmClaimError,
  ScmDoctorFixError,
  ScmMergeError,
  ScmPreparePrError,
  ScmRecoverError,
  ScmWaitCiError,
  SpringInitializrClient,
  _testMakeBrownfieldFixture,
  abandonFeatureBranch,
  addE2eToRunTestsScript,
  addInfraToPackageJson,
  addInfraToRunTestsScript,
  addPlaywrightToPackageJson,
  adoptLakebaseProject,
  adoptScmState,
  adoptTdd,
  applySchemaMigrations,
  assertAdoptionPreflight,
  cacheProjectRetention,
  catalogExists,
  catalogExplorerUrl,
  checkoutPaired,
  claimFeatureBranch,
  clearRetentionCache,
  createBranch,
  createFeatureBranch,
  createFeaturePairedBranch,
  createLakebaseProject,
  createLongRunningBranch,
  createPairedBranch,
  createPerfBranch,
  createPerfPairedBranch,
  createProject,
  createTestBranch,
  createTestPairedBranch,
  createUatBranch,
  createUatPairedBranch,
  cutBackup,
  deleteAppEndpoint,
  deleteBranch,
  deleteLakebaseProject,
  deletePairedBranch,
  deployClaudeAgents,
  deployClaudeCommands,
  deployDeployTargets,
  deployEnv,
  deployEnvExample,
  deployGitignore,
  deployLanguageProject,
  deployScripts,
  deploySpringStarter,
  deployVscodeSettings,
  deployWorkflows,
  deriveCiAppName,
  describeGates,
  detectCommandDrift,
  detectLanguage,
  detectScaffoldedDrift,
  detectWorkflowDrift,
  enableE2eForProject,
  enableInfraForProject,
  endpointPath,
  ensureAppEndpoint,
  ensureCachedArchive,
  ensureEndpoint,
  ensureLakebaseSecretAuth,
  ensureProfilePinned,
  ensureSchemaAndVolume,
  extractPullNumber,
  featureBranchName,
  findDefaultBranchName,
  findHistoryRetentionDuration,
  fixFinding,
  formatJUnit,
  formatSchemaDiffAsMarkdown,
  generateAppYaml,
  getAppEndpoint,
  getAppServicePrincipal,
  getBranchByName,
  getCachedProjectRetention,
  getCiAppEndpoint,
  getConnection,
  getCredential,
  getDefaultBranch,
  getDefaultBranchId,
  getDefaultBranchName,
  getEndpoint,
  getProjectInfo,
  getProjectRetentionDuration,
  getRunnerInfo,
  getSchemaDiff,
  getTargetNames,
  grantLakebasePermission,
  grantUcCatalogPermission,
  inferTierTopology,
  initWorkflowState,
  installHooks,
  installPlaywright,
  isLongRunningTierBranch,
  isLtsJavaVersion,
  isPrereleaseBootVersion,
  isRunning,
  isTier,
  isTtlTooLongError,
  listAppDeployments,
  listBranches,
  listSchemaMigrations,
  mergeFeature,
  minLakebaseTtl,
  mintCredential,
  normalizeHost,
  parseHostFromAuthDescribe,
  parseLakebaseTtl,
  parseTargetsYaml,
  patchWorkflowsForRunnerType,
  preparePr,
  projectPath,
  propagateCredentials,
  queryBranchSchema,
  queryBranchTables,
  readTargets,
  readWorkflowState,
  recoverOrphans,
  release,
  removeRunner,
  resolveBranchId,
  resolveBranchPath,
  resolveCurrentUser,
  resolveDatabricksHost,
  resolveEndpointHost,
  resolveJavaHome,
  resolveLatestBootVersion,
  resolveLatestLtsJavaVersion,
  resolveParentBranch,
  resolveProfileForHost,
  rollbackDeploy,
  rollbackSchemaMigration,
  runDoctor,
  runInfraSuite,
  runPlaywrightInstall,
  runnerDir,
  runnerName,
  sanitizeFeatureSlug,
  scaffoldAll,
  scaffoldStaticAll,
  schemaMigrationStatus,
  selectProfileForHost,
  setupRunner,
  stateFilePath,
  stopRunner,
  syncEnvToCurrentBranch,
  tierBranchNames,
  toolForLanguage,
  tryCreateCatalog,
  updateCommands,
  updateEnvConnection,
  updateWorkflows,
  uploadDirectory,
  validateApp,
  validateWorkflowState,
  verifyHooks,
  verifyProject,
  verifyWorkflows,
  waitForBranchAuthReady,
  waitForBranchReady,
  waitForCi,
  workflowStateFileExists,
  writeEnvFile,
  writePlaywrightTemplates,
  writeTargets,
  writeWorkflowState
};
//# sourceMappingURL=index.js.map