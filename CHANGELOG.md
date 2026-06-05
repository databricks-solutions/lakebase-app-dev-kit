# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0-beta.0] - 2026-06-05

First beta on the 0.3.0 line, graduating from the alpha series. Consume via
`npx github:databricks-solutions/lakebase-app-dev-kit#v0.3.0-beta.0`.

### Added

- **Artifact-conformance gate (FEIP-7508).** Per-artifact format registry: JSON
  artifacts are validated against their schema and narrative markdown against its
  required sections. The mock HITL approver hard-blocks a gate whose artifact
  exists but is malformed, rather than approving it.
- New schemas shipped in `dist`: `agent-log-event`, `architecture`,
  `design-guide`, `plan`. Shared schema loader removes duplicated validation
  wiring.
- `lakebase-tdd-gate-conformance` CLI to scan a feature's artifacts for
  conformance.
- **Structured agent logging.** JSON-lines events (role, timestamp, level,
  event) written to `.tdd/agent-log.jsonl`, with the `lakebase-tdd-log` CLI.
  HITL decisions are recorded (the mock reviewer validates expected elements and
  the human response is captured).
- **Per-role-agent contracts (FEIP-7510).** Relay headers on every role agent; a
  new Spec Author (Business Analyst) role and a conditional UX Designer (UI-only)
  role with token-level design adherence enforced at the Playwright layer.
- `feature-request.md` artifact: the Feature Requester's original ask, the Spec
  Author's read-only input.

### Changed

- **Explicit artifact authorship.** `spec.md` renamed to `product-overview.md`
  (Product Owner, project-level), and `feature.{md,json}` renamed to
  `feature-spec.{md,json}` (Spec Author). "spec" is now reserved for the Spec
  Author.
- NFRs moved off the spec-gated `feature-spec.json` / `story.json` onto
  `architecture.json` (the architect proposes, the HIL adjudicates at Gate 2),
  removing spec-gate drift.
- SCM feature-branch naming now goes through the shared sanitizer as the single
  source of truth; claim preserves the canonical `feature_id` case and is
  idempotent.

### Fixed

- The Spec Author no longer overwrites the Feature Requester's original ask: the
  requester's document is preserved as `feature-request.md` and never
  overwritten.

[0.3.0-beta.0]: https://github.com/databricks-solutions/lakebase-app-dev-kit/releases/tag/v0.3.0-beta.0
