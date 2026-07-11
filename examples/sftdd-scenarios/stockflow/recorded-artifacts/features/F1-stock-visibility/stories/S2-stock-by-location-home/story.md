# S2-stock-by-location-home

**As a** warehouse operator
**I want to** open a home screen that lists stock by location in a
scannable table of SKU, location and right-aligned quantity
**So that** I can read back at a glance what is on the shelves, with an
explicit empty state when there is none.

E2E (UI) story: the operator loads the home screen and sees the
stock-by-location table, or an explicit "No stock at this location"
state instead of a blank page.

## Independence

Distinct from S1: S1 is the record form plus its save confirmation. This
story is the separate aggregate listing view (all records, right-aligned
quantities, empty state), which building S1 does not deliver.
