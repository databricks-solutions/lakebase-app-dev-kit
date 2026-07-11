"""Infra-layer, read-only migration tooling.

Kept separate from `app/services` and `app/models` (architecture.md: the
split migration's diagnostic/reporting concerns are observability tooling,
never running domain code). Currently home to the split migration's
nonconforming-inventory_code integrity probe.
"""
