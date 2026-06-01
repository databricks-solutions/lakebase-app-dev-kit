// Promise-wrapped child_process.exec. Ports src/utils/exec.ts from the
// extension. The script substrate uses this for git/databricks shell-outs;
// pure-API calls go through Octokit / @databricks/lakebase instead.

import * as cp from "node:child_process";

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Milliseconds before SIGTERM. Default: 60_000. */
  timeout?: number;
}

/**
 * Common args shape for substrate functions that need only the working
 * directory. Re-used across scripts/git/* modules so multiple
 * `interface CwdOnly { cwd: string }` declarations don't collide at the
 * barrel level.
 */
export interface CwdOnly {
  cwd: string;
}

/**
 * POSIX-shell single-quote escape. Wraps `s` in single quotes and
 * escapes any literal single quotes as `'\''`. Resulting string is
 * safe to interpolate as a single argv element under /bin/sh: variable
 * expansion ($x), command substitution (`x`), backslash escapes, and
 * glob/tilde expansion are all suppressed.
 *
 * Use this instead of JSON.stringify when building git / databricks
 * shell commands. JSON.stringify produces double-quoted output, which
 * leaves $ and ` shell-active and corrupts messages containing them.
 *
 * Windows note: this helper assumes a POSIX shell. The kit's CLI
 * surface is currently POSIX-only (macOS / Linux / GitHub-hosted
 * runners). Callers that target cmd.exe should pre-escape themselves.
 */
export function shq(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function exec(command: string, opts: ExecOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const options: cp.ExecOptions = {
      cwd: opts.cwd,
      timeout: opts.timeout ?? 60_000,
    };
    if (opts.env) {
      options.env = { ...process.env, ...opts.env };
    }
    cp.exec(command, options, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message);
        reject(new Error(`${command}: ${msg}`));
        return;
      }
      resolve(String(stdout).trim());
    });
  });
}
