// CLI self-invocation detection helper.
//
// CLI modules that ALSO export a callable `runXCli(argv)` function for
// tests need to gate their top-level `process.exit(main(...))` call so
// the function-import path does not exit the test process. The naive
// guard `process.argv[1].endsWith("foo.cli.js")` fails when the bin
// is invoked through an npm `.bin/<name>` symlink (e.g.
// `npx lakebase-scm-state`): Node sets `process.argv[1]` to the
// symlink path, which ends in `lakebase-scm-state`, NOT `foo.cli.js`,
// so the guard is false and the bin exits 0 with no output (a silent
// no-op). FEIP-7422 smoke caught this; all phase B/C bins shipped with
// the broken guard.
//
// `isCliEntry(import.meta.url)` resolves the invoking script's path
// through realpathSync (chases the symlink to the dist file) and
// compares against this module's own file path. Robust under any
// invocation: direct `node path/to/foo.cli.js`, npm `.bin/` symlink,
// or even the future-pnpm hardlink-flavored layouts.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Return true iff the current module is being executed as a Node.js
 * entry point (vs. imported as a library). Pass `import.meta.url`
 * from the caller so each module identifies itself unambiguously.
 *
 * Both sides of the comparison are realpath-resolved so a symlink at
 * either path (the .bin shim, or a project symlinking dist/ into a
 * sandbox) cannot break the match.
 */
export function isCliEntry(importMetaUrl: string): boolean {
  const invokedRaw = process.argv[1];
  if (!invokedRaw) return false;
  let invokedResolved: string;
  let moduleResolved: string;
  try {
    invokedResolved = realpathSync(invokedRaw);
  } catch {
    return false;
  }
  try {
    moduleResolved = realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
  return invokedResolved === moduleResolved;
}
