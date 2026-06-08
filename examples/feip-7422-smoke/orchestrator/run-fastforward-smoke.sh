#!/usr/bin/env bash
# FEIP-7422 FAST-FORWARD smoke: validate the TDD BUILD loop (cut-experiment +
# Navigator + Driver + the orchestration's RED/GREEN cycle recording + accept +
# deploy) WITHOUT paying for the plan + design LLM turns.
#
# Every stage UP TO the Navigator handoff is REPLAYED from pre-recorded
# artifacts (recorded-artifacts/); the project is REAL and the Navigator/Driver
# cycles run for real. This is the inner-loop rig: when the build substrate
# breaks (e.g. the cycle red_at/green_at stall, the experiment paired-branch
# cut), you find out in minutes, not after a full plan+design.
#
#   REAL (run live):   scaffold, project intake, paired feature-branch claim,
#                      the deterministic reconcile (sync-breakdown + per-story
#                      test-list scope), the per-story spec gate (Human Proxy),
#                      cut-experiment (paired Lakebase+git), Navigator + Driver
#                      TDD cycles, the orchestration's cycle recording, accept
#                      (merge), deploy + the deploy gate.
#   REPLAYED (no LLM): Spec Author, Architect, Test Strategist, UX Designer,
#                      Product Owner. Their OUTPUTS are dropped from the corpus
#                      and the deterministic reconcile is run so the driver's
#                      readState sees design as DONE and fast-forwards to build.
#
# The corpus covers ONE feature (F1-file-bug); this smoke is single-feature by
# design (the build loop is what it exercises). Re-record the corpus to retarget.
#
# Usage:
#   run-fastforward-smoke.sh --tiers 2 [--kit-ref <ref>] [--project-name <n>]
#                            [--project-dir <dir>] [--feature <id>] [--corpus <dir>]
#
# Env (same as run-smoke.sh): DATABRICKS_HOST, GITHUB_OWNER, a CLI profile.
# Exit: 0 ok; 1 scaffold failed; 2 a replay/reconcile/build/verify step failed.

set -euo pipefail

ORCHESTRATOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSERT_DIR="${ORCHESTRATOR_DIR}/assertions"
CORPUS_DIR="${ORCHESTRATOR_DIR}/../recorded-artifacts"

FEATURE_ID="F1-file-bug"
STORY_IDS=("S1-create-bug" "S2-view-bug-detail")
TIERS="${TIERS:-}"
KIT_REF="${LAKEBASE_KIT_REF:-}"
PROJECT_NAME="bug-tracker-ff-$(date +%Y%m%d-%H%M%S)"
PROJECT_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tiers)        TIERS="$2"; shift 2 ;;
    --kit-ref)      KIT_REF="$2"; shift 2 ;;
    --project-name) PROJECT_NAME="$2"; shift 2 ;;
    --project-dir)  PROJECT_DIR="$2"; shift 2 ;;
    --feature)      FEATURE_ID="$2"; shift 2 ;;
    --corpus)       CORPUS_DIR="$2"; shift 2 ;;
    -h|--help)      sed -n '1,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

PROJECT_DIR="${PROJECT_DIR:-$HOME/code/feip-7422-smoke/${PROJECT_NAME}}"
[[ -n "$TIERS" ]] || { echo "ff-smoke: --tiers 2 is required (bug-tracker is prod+staging)." >&2; exit 2; }
[[ -d "$CORPUS_DIR/features/$FEATURE_ID" ]] || { echo "ff-smoke: corpus missing $CORPUS_DIR/features/$FEATURE_ID" >&2; exit 2; }

# The kit npx URL (matches run-smoke.sh): empty ref => kit main.
KIT_NPX="github:databricks-solutions/lakebase-app-dev-kit${KIT_REF:+#${KIT_REF}}"
# Exported so the scaffolded scripts/lk + /design pre-hook resolve the same ref.
[[ -n "$KIT_REF" ]] && export LAKEBASE_KIT_REF="$KIT_REF"

# Deterministic bootstrap (no npx pack bug, no moving-ref staleness): the
# create-project scaffold runs through the kit's OWN committed lk resolver, the
# same one the scaffolded project + every drive turn use. lk resolves the kit via
# `npm install <committish>` (content-addressed for a SHA, never the `npx pack`
# path that throws "GitFetcher requires an Arborist constructor" on a SHA) and
# honors $LAKEBASE_KIT_DIR (a pre-built, guarded install) when set. One
# resolution path => the exact same bits run on every step of every run.
KIT_ROOT="$(cd "${ORCHESTRATOR_DIR}/../../.." && pwd)"
KIT_LK="${KIT_ROOT}/templates/project/common/scripts/lk"
# UI track on (this feature is browser-facing): exercises the UX design-guide
# replay + the Navigator/Driver building against it.
export LAKEBASE_TDD_UI=1
# Headless gates: the Human Proxy approves the spec + deploy gates.
export LAKEBASE_TDD_HUMAN_PROXY=1

log() { printf '\n\033[1;34m[ff-smoke]\033[0m %s\n' "$*" >&2; }
err() { printf '\n\033[1;31m[ff-smoke ERROR]\033[0m %s\n' "$*" >&2; }
lk()  { "$PROJECT_DIR/scripts/lk" "$@"; }

# ─── 1. scaffold a REAL project ───────────────────────────────
log "kit ref = ${KIT_REF:-main} (npx: ${KIT_NPX})"
if [[ -d "$PROJECT_DIR/.git" ]]; then
  err "project dir already exists: $PROJECT_DIR (use a fresh --project-name)"; exit 1
fi
: "${DATABRICKS_HOST:?ff-smoke: DATABRICKS_HOST required}"
: "${GITHUB_OWNER:?ff-smoke: GITHUB_OWNER required}"
log "scaffolding ${PROJECT_NAME} via lakebase-create-project (tiers=${TIERS})..."
# Warm the resolver once so the bootstrap (and a moving-branch ref) resolve the
# ref's CURRENT commit before scaffolding; a no-op under $LAKEBASE_KIT_DIR.
bash "$KIT_LK" --warm || { err "could not resolve the kit via lk (ref=${KIT_REF:-main})"; exit 1; }
(
  bash "$KIT_LK" lakebase-create-project \
    --project-name "$PROJECT_NAME" --parent-dir "$(dirname "$PROJECT_DIR")" \
    --databricks-host "$DATABRICKS_HOST" --github-owner "$GITHUB_OWNER" \
    --language python --runner self-hosted --tiers "$TIERS" \
    --agent-model spec-author=haiku --agent-model architect-reviewer=haiku \
    --agent-model test-strategist=haiku --agent-model ux-designer=haiku \
    --agent-model product-owner=haiku --agent-model release-engineer=haiku \
    --enable-e2e
) || { err "scaffold failed"; exit 1; }
cd "$PROJECT_DIR"

# ─── 2. project intake on trunk (REAL precondition) ───────────
# Same path as run-smoke.sh: the Human Proxy supplies the recorded intake docs.
log "staging project intake (product-overview + nfrs + design-brief) via human-proxy"
git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1 || true
proxy_supply() {
  lk lakebase-tdd-human-proxy supply --from "$1" --to "$2" --artifact "$3" --tdd-dir "${PROJECT_DIR}/.tdd"
}
proxy_supply "${ORCHESTRATOR_DIR}/product-overview.md" "${PROJECT_DIR}/.tdd/product-overview.md" "product-overview.md" \
  || { err "human-proxy refused product-overview.md"; exit 2; }
proxy_supply "${ORCHESTRATOR_DIR}/nfrs.md" "${PROJECT_DIR}/.tdd/nfrs.md" "nfrs.md" \
  || { err "human-proxy refused nfrs.md"; exit 2; }
proxy_supply "${ORCHESTRATOR_DIR}/design-brief.md" "${PROJECT_DIR}/.tdd/design/design-brief.md" "design-brief.md" \
  || { err "human-proxy refused design-brief.md"; exit 2; }
git add .tdd/product-overview.md .tdd/nfrs.md .tdd/design/design-brief.md 2>/dev/null || true
git commit -m "intake: project product-overview + nfrs + design-brief" >/dev/null 2>&1 || true

# ─── 3. feature-request on trunk, then claim the paired branch ─
# The feature branch (forked from main HEAD by the claim) must carry the
# Feature Requester's ask, exactly as a real run inherits it from /plan.
log "replay: feature-request.md -> trunk (the PO's committed ask)"
mkdir -p ".tdd/features/${FEATURE_ID}"
cp "${CORPUS_DIR}/features/${FEATURE_ID}/feature-request.md" ".tdd/features/${FEATURE_ID}/feature-request.md"
git add ".tdd/features/${FEATURE_ID}/feature-request.md"
git commit -m "plan: feature-request for ${FEATURE_ID}" >/dev/null 2>&1 || true

log "claim the paired feature branch for ${FEATURE_ID} (REAL substrate)"
lk lakebase-scm-claim-feature-branch "${FEATURE_ID}" --project-dir "$PROJECT_DIR" --json \
  || { err "claim-feature-branch failed"; exit 2; }
"${ASSERT_DIR}/verify-workflow-state.sh" "$PROJECT_DIR" feature-claimed "$FEATURE_ID"

# ─── 4. drive the feature in REPLAY mode (every stage runs; design is replayed) ─
# LAKEBASE_TDD_REPLAY_DIR makes the driver, at each DESIGN-lane role turn
# (Spec Author breakdown + per-story ACs, Architect, Test Strategist, UX
# Designer), copy that turn's recorded output from the corpus INSTEAD of
# spawning the model. The orchestrator still VISITS every stage as a real turn
# (logging, transitions, its deterministic effects: sync-breakdown, per-story
# test-list scope, the spec gate, dispatch, cut-experiment). The Navigator +
# Driver are NOT replayed, so the real TDD begins exactly at the Navigator
# handoff. A story the corpus does not cover (e.g. S2) falls back to the real
# agent automatically.
export LAKEBASE_TDD_REPLAY_DIR="${CORPUS_DIR}"
log "drive ${FEATURE_ID}: design REPLAYED per-stage, then REAL Navigator/Driver TDD + accept + deploy"
log "  (replay corpus: ${CORPUS_DIR})"
lk lakebase-tdd-drive --feature "${FEATURE_ID}" --project-dir "$PROJECT_DIR" \
  || { err "lakebase-tdd-drive failed for ${FEATURE_ID}"; exit 2; }

# ─── 7. verify + local test ───────────────────────────────────
log "local tests"
if [[ -x "./scripts/run-tests.sh" ]]; then ./scripts/run-tests.sh; else uv run pytest || python -m pytest; fi
log "verify deploy gate (migration + routes + tests + an E2E AC + approved PO deploy gate)"
"${ASSERT_DIR}/verify-deploy-gate.sh" "$PROJECT_DIR" "$FEATURE_ID"

lk lakebase-tdd-deploy --target local --project-dir "$PROJECT_DIR" --stop >/dev/null 2>&1 || true
log "✓ fast-forward smoke complete for ${FEATURE_ID}"
