// [Infra]-tag runner: the third entry in the tagToRunner map alongside
// [API] (vitest / mvnw / pytest) and [E2E] (Playwright).
//
// An [Infra]-tagged AC asserts a database-side contract that does not
// belong in unit-level tests: "migrations apply cleanly," "the
// introspection seam still works," "credentials still mint." These are
// the invariants the substrate itself guarantees on behalf of the
// project, so the runner sits in the kit (not the project) and the
// scaffolder wires `test:infra` to invoke this bin.
//
// v1 ships three checks; future versions can extend the list without
// changing the surface shape:
//   - migrations-clean: schemaMigrationStatus reports no pending
//     migrations for the branch (a clean apply was the last action).
//   - schema-diff-computable: getSchemaDiff returns a SchemaDiffResult
//     without throwing (the introspection seam is healthy).
//   - connection-reachable: getConnection mints a DSN against the branch
//     (the credential mint path is healthy).
//
// The runner emits a JUnit-shape XML file when `junitOutput` is set so
// outcomes.json's `by_tag.infra` counter and any CI consumer (GitHub
// Actions, the agent-quality eval pyramid) can read the same shape that
// vitest emits for [API] runs.

import * as fs from "node:fs";
import * as path from "node:path";
import { getConnection } from "./get-connection.js";
import { getSchemaDiff } from "./schema-diff.js";
import { schemaMigrationStatus } from "./schema-migrate.js";

export interface InfraCheckResult {
  /** Stable check identifier; matches the test name in the JUnit XML output. */
  name: "migrations-clean" | "schema-diff-computable" | "connection-reachable";
  passed: boolean;
  /** Human-readable summary (one line). */
  detail: string;
  /** Wall-clock duration in milliseconds. */
  duration_ms: number;
}

export interface InfraSuiteResult {
  /** True iff every check passed. */
  passed: boolean;
  /** Per-check outcomes in canonical (registration) order. */
  checks: InfraCheckResult[];
  /** Branch the suite ran against. */
  branch: string;
  /** Total wall-clock duration for the suite, in milliseconds. */
  duration_ms: number;
}

export interface RunInfraSuiteArgs {
  /** Lakebase project id. */
  instance: string;
  /** Branch to test against. */
  branch: string;
  /** Optional project root for schemaMigrationStatus's language detection. */
  projectDir?: string;
  /** Optional comparison branch override forwarded to getSchemaDiff. */
  comparisonBranch?: string;
  /**
   * When set, the suite writes a JUnit XML file at this path summarising
   * every check. The shape mirrors vitest's `junit` reporter so a CI
   * consumer can ingest [API] and [Infra] results uniformly.
   */
  junitOutput?: string;
}

/**
 * Run the [Infra]-tag suite against a Lakebase branch and report
 * per-check outcomes. Each check runs sequentially (the dependencies
 * matter: migrations-clean must succeed before connection-reachable
 * means anything in a fresh-branch context, and schema-diff-computable
 * is its own seam). A check failure does not short-circuit the suite;
 * every check runs so the JUnit report covers them all.
 */
export async function runInfraSuite(args: RunInfraSuiteArgs): Promise<InfraSuiteResult> {
  const start = Date.now();
  const checks: InfraCheckResult[] = [];

  checks.push(await runCheck("migrations-clean", async () => {
    const status = await schemaMigrationStatus({
      instance: args.instance,
      branch: args.branch,
      projectDir: args.projectDir,
    });
    if (status.pending.length === 0) {
      return `no pending migrations (current=${status.current ?? "<none>"}, tool=${status.tool})`;
    }
    throw new Error(
      `${status.pending.length} pending migration(s): ` +
        status.pending.map((p) => p.version).slice(0, 5).join(", ") +
        (status.pending.length > 5 ? ", ..." : "")
    );
  }));

  checks.push(await runCheck("schema-diff-computable", async () => {
    const diff = await getSchemaDiff({
      instance: args.instance,
      branch: args.branch,
      comparisonBranch: args.comparisonBranch,
    });
    return (
      `diff computed against "${diff.comparisonBranchName || "<self>"}": ` +
      `+${diff.created.length} ~${diff.modified.length} -${diff.removed.length} tables`
    );
  }));

  checks.push(await runCheck("connection-reachable", async () => {
    const dsn = await getConnection({
      instance: args.instance,
      branch: args.branch,
      output: "dsn",
    });
    if (!dsn.url.startsWith("postgresql://")) {
      throw new Error(`getConnection returned non-DSN url: ${dsn.url.slice(0, 80)}`);
    }
    return `credential mint returned a DSN against ${dsn.host}:${dsn.port}/${dsn.database}`;
  }));

  const result: InfraSuiteResult = {
    passed: checks.every((c) => c.passed),
    checks,
    branch: args.branch,
    duration_ms: Date.now() - start,
  };

  if (args.junitOutput) {
    fs.mkdirSync(path.dirname(args.junitOutput), { recursive: true });
    fs.writeFileSync(args.junitOutput, formatJUnit(result), "utf8");
  }

  return result;
}

async function runCheck(
  name: InfraCheckResult["name"],
  body: () => Promise<string>
): Promise<InfraCheckResult> {
  const start = Date.now();
  try {
    const detail = await body();
    return { name, passed: true, detail, duration_ms: Date.now() - start };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { name, passed: false, detail, duration_ms: Date.now() - start };
  }
}

/**
 * Render an InfraSuiteResult as a JUnit-shape XML document. One
 * testsuite element with a testcase per check; failed checks include a
 * <failure> child with the detail string. The format matches vitest's
 * `junit` reporter output (single suite, no nesting) so a CI consumer
 * can apply the same parsers to [API] and [Infra] results.
 */
export function formatJUnit(result: InfraSuiteResult): string {
  const failures = result.checks.filter((c) => !c.passed).length;
  const totalSeconds = (result.duration_ms / 1000).toFixed(3);
  const suiteName = "lakebase-infra";
  const cases = result.checks.map((c) => {
    const seconds = (c.duration_ms / 1000).toFixed(3);
    const detail = escapeXml(c.detail);
    if (c.passed) {
      return `    <testcase classname="${suiteName}" name="${c.name}" time="${seconds}"/>`;
    }
    return [
      `    <testcase classname="${suiteName}" name="${c.name}" time="${seconds}">`,
      `      <failure message="${detail}"/>`,
      `    </testcase>`,
    ].join("\n");
  });
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites name="${suiteName}" tests="${result.checks.length}" failures="${failures}" time="${totalSeconds}">`,
    `  <testsuite name="${suiteName}" tests="${result.checks.length}" failures="${failures}" time="${totalSeconds}">`,
    ...cases,
    `  </testsuite>`,
    `</testsuites>`,
    ``,
  ].join("\n");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
