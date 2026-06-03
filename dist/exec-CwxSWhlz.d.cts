interface ExecOptions {
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
interface CwdOnly {
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
declare function shq(s: string): string;
declare function exec(command: string, opts?: ExecOptions): Promise<string>;

export { type CwdOnly as C, type ExecOptions as E, exec as e, shq as s };
