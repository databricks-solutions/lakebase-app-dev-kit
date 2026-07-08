#!/usr/bin/env bash
# Single source for pinning a LOCAL-ONLY kit ref (default: sftdd-capture-local) to
# a working tree. Sourced by capture-scenario.sh (the launcher) AND the teardown/
# restart coordinators, so the wiring lives in exactly one place.
#
# A local ref exists nowhere on GitHub, so it resolves ONLY via a cache symlink
# (~/.cache/lakebase-app-dev-kit/<ref>/node_modules/@databricks-solutions/...).
# If that symlink is lost mid-run (an external rm, a cache sweep), lk cannot
# GitHub-re-resolve it and would hard-fail a whole capture. To make that
# recoverable, record_local_kit_hint also writes .lakebase/kit-local-dir into the
# project; the scaffolded scripts/lk shim self-heals the symlink from that hint
# (see templates/project/common/scripts/lk).

LOCAL_KIT_REF_DEFAULT="sftdd-capture-local"

# The cache slot (node_modules/<pkg> symlink target) for a local ref.
local_kit_cache_link() {
  local ref="${1:-$LOCAL_KIT_REF_DEFAULT}"
  local cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/lakebase-app-dev-kit"
  printf '%s\n' "${cache_root}/${ref}/node_modules/@databricks-solutions/lakebase-app-dev-kit"
}

# Plant (idempotent) the cache symlink -> the working tree, so a bin run finds
# dist with no GitHub install. Fails loud if the kit has no built dist.
pin_local_kit_cache() {
  local kit_root="$1" ref="${2:-$LOCAL_KIT_REF_DEFAULT}" link
  [ -d "${kit_root}/dist" ] || { echo "pin-local-kit: kit dist missing at ${kit_root}/dist , run 'npm run build' in the kit first." >&2; return 2; }
  link="$(local_kit_cache_link "$ref")"
  mkdir -p "$(dirname "$link")"
  rm -rf "$link"
  ln -s "$kit_root" "$link"
  echo "[pin-local-kit] ref '${ref}' -> ${kit_root} (cache symlink)" >&2
}

# Record the ref + recovery hint into a scaffolded project: kit-ref so the
# env-less agents resolve the ref, kit-local-dir so lk can re-plant the cache
# symlink if it is ever lost. Idempotent.
record_local_kit_hint() {
  local project_dir="$1" kit_root="$2" ref="${3:-$LOCAL_KIT_REF_DEFAULT}"
  mkdir -p "${project_dir}/.lakebase"
  printf '%s\n' "$ref" > "${project_dir}/.lakebase/kit-ref"
  ( cd "$kit_root" && pwd -P ) > "${project_dir}/.lakebase/kit-local-dir"
}
