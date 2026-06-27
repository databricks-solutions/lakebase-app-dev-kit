# Feature Proposals (Sprint 1)

Candidate features for the initial sprint. UI track is active (design-brief.md exists); all proposals are E2E stories.

## F1-stock-visibility

**One-line ask:** View inventory by location on a dashboard.

**Rationale:** "Know what they have, in what quantity, at which physical location at any point in time" (product overview). Foundational for V1; all other features reference this view.

**E2E story:** Yes.

**Priority:** P0

## F2-stock-adjustment

**One-line ask:** Adjust stock levels when discrepancies are discovered.

**Rationale:** "Adjust the stock level of one SKU at one location" (product overview). Demonstrates write path with immutable audit trail (R1). Enables cycle-count reconciliation.

**E2E story:** Yes.

**Priority:** P0

## F3-inbound-receipt

**One-line ask:** Record inbound shipments from suppliers, increasing stock at a chosen location.

**Rationale:** "Receive inbound goods from a supplier and put them somewhere recoverable" (product overview). Standard warehouse inbound workflow.

**E2E story:** Yes.

**Priority:** P1

## F4-outbound-pick

**One-line ask:** Pick stock for customer orders without overcommitting available quantity.

**Rationale:** "Pick goods off the shelf without overcommitting what is actually there" (product overview). R2 (no overcommit, no negative stock). Closes order fulfillment loop.

**E2E story:** Yes.

**Priority:** P1
