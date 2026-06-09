# FEIP scope: thin `post-checkout.sh` onto `checkoutPaired`

**Status:** scoping only (no code). Suggested labels: LADT, lakebase-for-agile-dev.
Cross-refs: (substrate-only / thin-wrap shells) (SCM
workflow state machine + Phase C orphan refusal).

## Why

`templates/project/common/scripts/post-checkout.sh` is 423 lines and is the
last fat shell that **reimplements substrate logic** instead of delegating to
the kit's TypeScript. It independently:

- pulls + parses the Lakebase branch list (jq, with array/object unwrap),
- classifies trunk / tier / feature,
- resolves the feature parent (base-branch precedence),
- ensures/creates the endpoint and waits for ACTIVE,
- mints the credential,
- builds the DSN and rewrites the `.env` connection block,
- projects Spring `application-local.properties`.

Every one of those already exists in `scripts/lakebase/paired-branch.ts`
(`checkoutPaired`). The duplication is not theoretical: it is exactly why the
`DATABRICKS_CONFIG_PROFILE` bug needed a separate bash-side heal. post-checkout
is a **second `.env` writer** that drifts from the TS path. Collapsing it onto
`checkoutPaired` removes that whole class of drift and leaves one substrate
implementation.

## Coverage map: what `checkoutPaired` already does vs what the hook adds

`checkoutPaired(args)` already covers the entire substrate body:

| Hook responsibility (post-checkout.sh lines)                | In `checkoutPaired`? |
|-------------------------------------------------------------|----------------------|
| instance resolution (`LAKEBASE_PROJECT_ID`)                 | yes                  |
| branch resolve + sanitize                                   | yes (`sanitizeBranchName`) |
| one branch-list pull then trunk/tier/feature mode (227-304) | yes (`listBranches` + `isTier`) |
| default-branch (trunk) resolution (231-237, 254-275)        | yes                  |
| tier discovery + connect (277-304)                          | yes (`tierMatch`)    |
| feature parent precedence (314-337)                         | yes (`resolveFeatureParent`) |
| READY wait (372-385)                                        | yes (`waitForBranchReady`) |
| endpoint ensure/create + wait (195-221)                     | yes (`ensureEndpoint`) |
| credential mint (186-192)                                   | yes (`mintCredential`) |
| DSN build + `.env` write (145-183)                          | yes (`buildDsn` + `updateEnvConnection`) |
| profile pin                                                 | yes (`ensureProfilePinned`) |

### Hook-only concerns that legitimately STAY in bash

These are git-hook / shell plumbing, not substrate. Keep them:

- checkout-type guard (`$3 == 1`), detached-HEAD skip (7-22)
- `.env` / `.env.example` bootstrap-and-exit (24-36)
- env-clobber of inherited `LAKEBASE_*` / `DATABRICKS_*` (38-50)
- auth preflight + re-auth message (112-124)
- profile self-heal, already TS-delegated via `--write-env` (87-110)
- `TRUNK_ALIAS` derivation from `origin/HEAD` (66-75), now **passed to the CLI**
- `maybe_npm_install` for `client/` (129-139, 273/302/423), pure project concern
- translating the CLI's structured "orphan-refused" result into the Phase C
  refusal message (343-369), the UI/messaging layer

## Gaps to close BEFORE the hook can call the CLI

The current `checkout-paired` CLI case (`branch.cli.ts:385`) only passes
`cwd/branch/instance`. Four gaps:

1. **`--no-auto-create` (CRITICAL, safety invariant).** `checkoutPaired`
   defaults `autoCreate: true` and will CREATE a feature branch. Phase C
   deliberately made the hook REFUSE out-of-band creation. The CLI
   must expose `--no-auto-create` mapping to `checkoutPaired({autoCreate:
   false})`, and when the branch is missing it must return a **structured
   "orphan-refused" outcome** (a `mode`/result field or a typed exit code), NOT
   a raw throw, so the hook can print the exact Phase C recovery text and
   `exit 1`. Detection in TS; message stays in the hook.

2. **`--trunk-alias <name>`.** `checkoutPaired` takes `trunkAlias` but the CLI
   does not parse/pass it. The hook derives it from `origin/HEAD` and must pass
   it so non-`main` trunks (e.g. `release/v3`) classify correctly.

3. **Base-branch precedence parity.** Bash precedence is
   `LAKEBASE_BASE_BRANCH` > previous-branch-if-exists-and-READY > default.
   `checkoutPaired` reads `previousBranch` from `.env` but takes `baseBranch`
   only as an arg. Either the CLI reads `LAKEBASE_BASE_BRANCH` from `.env` and
   passes it, or `checkoutPaired` does. Pick one; cover with a test.

4. **Spring `application-local.properties` projection.** NOT in TS today
   (`updateEnvConnection` only mentions it in a comment). It is duplicated in
   BOTH `post-checkout.sh` (173-182) and `refresh-token.sh` (the "Spring
   tail"). Extract one `writeSpringLocalProperties({projectDir, host, user,
   pass, branchId})` helper, call it from `checkoutPaired` +
   `syncEnvToCurrentBranch`, and delete both bash copies. This kills a 3-way
   duplication, not just the post-checkout one.

## Decision points (need a call before implementing)

- **psql connection verify + credential retry (403-419):** not in
  `checkoutPaired`. Options: (a) drop it (the mint+DSN is deterministic; this
  was belt-and-braces), (b) add optional `--verify` to `checkoutPaired`,
  (c) move it to `lakebase-doctor`. Recommend (a) or (c).
- **Where the orphan-refusal text lives:** recommend keeping the multi-line
  recovery message in the hook (UI), with the CLI only signalling the
  condition. Avoids putting human-facing copy in the substrate.

## Proposed phases

0. Capture the decision-point answers (psql verify; orphan signalling shape).
1. CLI gaps in `branch.cli.ts`: `--no-auto-create`, `--trunk-alias`,
   base-branch-from-env; structured orphan-refused result. Unit tests.
2. `writeSpringLocalProperties` TS helper + wire into `checkoutPaired` and
   `syncEnvToCurrentBranch`. Unit test (Java vs non-Java project).
3. Rewrite `post-checkout.sh`: keep the hook-only prelude (guard, bootstrap,
   clobber, preflight, profile-heal, trunk-alias derive), replace lines
   126-422 with one `lakebase-branch checkout-paired --cwd . --trunk-alias
   "$TRUNK_ALIAS" --no-auto-create` call, map orphan-refused to the Phase C
   message, keep `maybe_npm_install`. Target: well under 150 lines.
4. Remove the Spring tail from `refresh-token.sh` (now in TS).
5. Live parity tests (the gate): trunk-to-default, tier (staging/dev), feature
   existing-READY, feature orphan (REFUSE + exact message + exit 1),
   base-branch precedence (all three arms), Spring project writes
   `application-local.properties`, non-`main` trunk via `origin/HEAD`,
   monorepo `.env`-in-subdir scope guard (bash, unchanged).
6. Typecheck + full vitest + bundle smoke. PAUSE for review before any version
   bump (user owns SemVer).

## Risk

Highest-risk shell to thin (it runs on every developer `git checkout`), so the
live parity suite in phase 5 is the real deliverable, not the line reduction.
The orphan-refusal invariant (gap 1) is the one that must not regress: a wrong
`autoCreate` default would silently re-open the out-of-band branch creation
Phase C closed.
