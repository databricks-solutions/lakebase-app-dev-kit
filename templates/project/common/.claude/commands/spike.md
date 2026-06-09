# /spike : throwaway exploration outside the TDD loop

A spike is a time-boxed experiment to answer an unknown (a library, an approach,
a feasibility question) on its OWN throwaway paired Lakebase branch. It is NOT
part of the `design` -> `build` -> `deploy` loop and has no gates. The rule:
**code from a spike is never promoted as-is, only the learning carries forward.**

## Usage

```
/spike <slug> [--for <feature-id>] [--parent <branch>] [--ttl <duration>]
/spike list
/spike delete <slug> [--keep-branch]
```

`--for <feature-id>` tags the spike's notes so the learning is picked up at that
feature's design-spec gate (the Architect surfaces it as a spike input). Omit it
for a free-standing exploration.

## How it runs

`/spike` wraps the `lakebase-tdd-spike` CLI (it does NOT go through the driver,
a spike is outside the workflow state machine):

```bash
# cut a spike (its own paired branch spike/<slug> + a notes.md)
./scripts/lk lakebase-tdd-spike cut \
  --slug "<slug>" --instance "<lakebase-project>" \
  ${FEATURE:+--for "$FEATURE"} --project-dir "$PWD" --json

# list spikes / delete one when done (drops the branch unless --keep-branch)
./scripts/lk lakebase-tdd-spike list --project-dir "$PWD"
./scripts/lk lakebase-tdd-spike delete --slug "<slug>" --instance "<lakebase-project>" --project-dir "$PWD"
```

After cutting, explore freely on the spike branch. Capture what you learned in
`.tdd/spikes/<slug>/notes.md` BEFORE deleting the branch, the notes survive the
teardown and (with `--for`) feed the next design's spec gate. Then delete the
spike to drop its throwaway branch.

## Next

Fold the learning into a real feature: **`/design <feature-id>`** (or `/plan` if
the spike reshaped the backlog). Do not merge spike code into a feature branch.

## Substrate version

Pinned to: `${KIT_VERSION_AT_SCAFFOLD}`
