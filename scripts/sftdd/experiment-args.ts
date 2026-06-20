// Pure arg parsing + the required-argument CONTRACT for the experiment CLI
// (lakebase-sftdd-experiment cut|merge|discard). Lives in its own module (not the
// .cli entrypoint, which self-executes main() on import) so BOTH the CLI and the
// orchestrator-glue contract test import the SAME parser + validator. A driver
// command missing a required flag fails validateExperimentArgs in a hermetic
// test, not only in a live run.

export interface ExperimentArgs {
  cmd?: string;
  feature?: string;
  story?: string;
  slug?: string;
  branch?: string;
  experimentBranch?: string;
  featureBranch?: string;
  parent?: string;
  instance?: string;
  ttl?: string;
  approver?: string;
  reason?: string;
  at?: string;
  revise?: boolean;
  projectDir?: string;
  tddDir?: string;
}

/** Parse the experiment CLI argv (argv[0] is the subcommand). */
export function parseExperimentArgs(argv: string[]): ExperimentArgs {
  const out: ExperimentArgs = { cmd: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--feature") out.feature = argv[++i];
    else if (a === "--story") out.story = argv[++i];
    else if (a === "--slug") out.slug = argv[++i];
    else if (a === "--branch") out.branch = argv[++i];
    else if (a === "--experiment-branch") out.experimentBranch = argv[++i];
    else if (a === "--feature-branch") out.featureBranch = argv[++i];
    else if (a === "--parent") out.parent = argv[++i];
    else if (a === "--instance") out.instance = argv[++i];
    else if (a === "--ttl") out.ttl = argv[++i];
    else if (a === "--approver") out.approver = argv[++i];
    else if (a === "--reason") out.reason = argv[++i];
    else if (a === "--at") out.at = argv[++i];
    else if (a === "--revise") out.revise = true;
    else if (a === "--project-dir") out.projectDir = argv[++i];
    else if (a === "--tdd-dir") out.tddDir = argv[++i];
  }
  return out;
}

/**
 * The required-argument contract for each experiment subcommand, in ONE place.
 * Returns an error message when args are incomplete, or null when valid. Both
 * the CLI `main()` and the orchestrator-glue contract test call this, so a
 * command the driver emits is validated against the SAME rules the CLI enforces.
 */
export function validateExperimentArgs(args: ExperimentArgs): string | null {
  if (!args.cmd) return "missing subcommand";
  if (!args.feature || !args.story || !args.slug) return "missing --feature / --story / --slug";
  if (!args.instance) return "missing --instance";
  switch (args.cmd) {
    case "cut":
      if (!args.branch || !args.parent) return "cut needs --branch and --parent";
      return null;
    case "merge":
      if (!args.experimentBranch || !args.featureBranch) return "merge needs --experiment-branch and --feature-branch";
      if (!args.approver) return "merge needs --approver";
      return null;
    case "discard":
      if (!args.approver) return "discard needs --approver";
      if (!args.reason) return "discard needs --reason";
      return null;
    default:
      return `unknown subcommand: ${args.cmd}`;
  }
}
