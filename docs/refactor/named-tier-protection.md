# Redefine "protected tier" = named AND long-running

Status: planned. Owner: SCM substrate + extension. Cross-repo (kit + lakebase-scm-extension).

## Decision (confirmed with the user)

Today a branch is a protected "tier" iff it is **long-running** (Lakebase: non-default + no `expireTime`; i.e. cut with `no_expiry`). Name is ignored, so ANY long-running branch (e.g. a `scratch` spike someone left no-expiry) is treated as a protected tier.

New definition: a branch is a protected tier iff
```
protectedTier(b) = b.isDefault
                 OR ( longRunning(b) AND leafName(b) in ProtectedNames )
```
- `longRunning(b) = !isDefault && !expireTime` (unchanged raw signal).
- The Lakebase **default branch is always protected** (production), regardless of name.
- `ProtectedNames = DEFAULT_SET ∪ {configured trunk/staging/base} ∪ tierNames` (per-project extension).
- **DEFAULT_SET = { main, master, staging, dev }** (Candidate A; test/uat/perf are opt-in per project, NOT protected by default).

A long-running branch whose name is NOT in `ProtectedNames` is treated as an **ordinary branch** (deletable, renamable, not read-only, auto-paired like a feature) , the pre-tier behavior.

### Per-project extension (source of names)
- Kit env / `.env`: `LAKEBASE_TRUNK_BRANCH`, `LAKEBASE_STAGING_BRANCH`, `LAKEBASE_BASE_BRANCH` (existing) + **new** `LAKEBASE_TIER_NAMES` (comma-separated extra protected leaf names).
- Extension settings: `lakebaseSync.trunkBranch` / `stagingBranch` / `baseBranch` (existing) + **new** `lakebaseSync.tierNames` (string array). Both union into `ProtectedNames`.
- All names normalized (trim + lowercase) before comparison.

### Worked example (project bug-tracker-20260611-210436, 2-tier, NO tier config in .env)
| branch | long-running | today | new (Cand. A) |
|---|---|---|---|
| production (default) | n/a | protected | protected (isDefault) |
| staging | yes | protected | protected (named) |
| feature-f1-file-bug | no (expires) | ordinary | ordinary |
| experiment-s1-file-bug-exp1 | no (expires) | ordinary | ordinary |
| scratch (hypothetical no-expiry) | yes | **protected** | **ordinary** (behavior change) |
| uat (hypothetical no-expiry) | yes | protected | ordinary unless added via tierNames/config |

## Kit changes (lakebase-app-dev-kit)
1. `scripts/lakebase/branch-utils.ts` (or new `tier-names.ts`): export `DEFAULT_PROTECTED_TIER_NAMES` + `resolveProtectedTierNames(extra?)` (union + normalize) + `protectedTierNamesFromEnv(env)` (reads LAKEBASE_TIER_NAMES + trunk/staging/base). Keep `isLongRunningTierBranch` (raw signal). Make `isTier(name, branches, protectedNames?)` + `tierBranchNames(branches, protectedNames?)` require name ∈ protectedNames (default = DEFAULT_SET).
2. `scripts/lakebase/paired-branch.ts` `checkoutPaired`: resolve protected names from env + pass to `isTier`, so a long-running off-convention branch resolves to **feature** mode (gets a paired feature branch), not tier mode.
3. `templates/project/common/scripts/post-checkout.sh`: filter discovered non-default branches to leaves in (DEFAULT_SET ∪ `$LAKEBASE_TIER_NAMES` ∪ `$LAKEBASE_STAGING_BRANCH`/`$LAKEBASE_BASE_BRANCH`/`$LAKEBASE_TRUNK_BRANCH`). Bash mirror of the TS rule.
4. DRY the hardcoded name sets onto the constant: `scm-adopt-state.ts` `LONG_RUNNING_LEAFS` (already main/master/staging/dev = the default set) and `scm-doctor.ts` `TIER_LEAFS` (staging/dev , widen to the default set).
5. Tests: `tier-discovery.test.ts` + branch-utils tests , off-convention long-running branch is NOT a tier; staging/dev still are; `tierNames`/config extension adds protection; default branch always protected.

## Extension changes (lakebase-scm-extension)
ARCHITECTURE RULE (confirmed): the kit is the SINGLE source of truth for the
default protected set + the matching logic. The extension does NOT duplicate
either; it only supplies per-project OVERRIDE DATA and feeds it to the kit's
resolver. "Overrides" are where a project/person legitimately deviates (a tier
named `qa`, a renamed staging). The default set (uat NOT protected) + the
named-AND-long-running predicate always come from the kit.

1. `src/utils/config.ts`: add `tierNames: string[]` (from `lakebaseSync.tierNames`
   + `LAKEBASE_TIER_NAMES` csv). This is OVERRIDE DATA, not logic , allowed.
2. `src/utils/theme.ts`: DELETE the local `TIER_FALLBACK_NAMES` literal; re-export
   the kit's `DEFAULT_PROTECTED_TIER_NAMES` under that name (single source). uat/perf
   drop out automatically because the kit default is {main,master,staging,dev}.
3. `src/services/lakebaseService.ts`: feed the tier cache via the kit's
   `tierBranchNames(branches, resolveProtectedTierNames([trunkBranch, stagingBranch,
   baseBranch, ...tierNames]))` , so the cache is exactly the kit-defined protected
   tiers (named AND long-running). No extension-side name logic.
4. `src/providers/branchTreeProvider.ts` `isLongRunningTier`: cache membership, with
   the pre-list fallback computed by the kit's `resolveProtectedTierNames(overrides)`
   + `normalizeTierName` (imported), not a local list/predicate.
5. DRY: remove the duplicate local `isLongRunningTier` in `extension.ts` (~3381);
   the schemaDiffService guard switches to the kit-derived check too.
6. `package.json`: contribute `lakebaseSync.tierNames` (array) , the override knob.
7. Tests: off-convention long-running = ordinary; staging/dev = tier; tierNames /
   trunk-staging-base overrides extend; default-set + uat-excluded assertions.

DELIVERY: the extension consumes the kit from its pinned dep, so this lands only
after the kit change is published and the extension RE-PINS to it (the standard
re-pin step) + `npm install`. The thin consumer change does not compile against
the old pin (alpha.57). No extension-side duplication is added in the interim.

## Verification
- Kit: `npm run typecheck` + full `vitest run` green; new tier-discovery cases pass.
- Extension: `npm run typecheck` + mocha unit suite green; new classification cases pass; webpack compile clean.
- Behavior: a no-expiry branch named `scratch` is ordinary (deletable/renamable, auto-paired); `staging`/`dev` stay protected; a project that sets `LAKEBASE_TIER_NAMES=qa` protects `qa`.

## Gates
- New branch each repo (kit: off current HEAD; extension: off main). Commit local; no version bump / push / VSIX publish without explicit go.
