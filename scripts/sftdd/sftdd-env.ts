// SFTDD runtime env accessor with legacy back-compat.
//
// The kit's env knobs were historically prefixed `LAKEBASE_TDD_*` (from the
// pre-rename `lakebase-tdd-workflows` skill). The skill, dirs, bins, and config
// file are now `sftdd`, so the canonical prefix is `LAKEBASE_SFTDD_*`. This
// accessor reads the new name and falls back to the legacy `LAKEBASE_TDD_*` one,
// so existing scripts / shells / scaffolded projects that still export the old
// names keep working (the same dual-read convention `resolveSftddDir` uses for the
// `.tdd` -> `.sftdd` artifact-root rename). Prefer this over `process.env.X`.
export function sftddEnv(
  suffix: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env[`LAKEBASE_SFTDD_${suffix}`] ?? env[`LAKEBASE_TDD_${suffix}`];
}
