#!/usr/bin/env node
/** Run the CLI. Returns the process exit code (no process.exit inside), so it is
 *  unit-testable , mirroring runHumanProxyCli. */
declare function runApproveGateCli(argv: string[]): number;

export { runApproveGateCli };
