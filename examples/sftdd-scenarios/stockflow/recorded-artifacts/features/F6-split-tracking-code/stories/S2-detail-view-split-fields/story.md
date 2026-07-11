# S2-detail-view-split-fields

**As a** warehouse operator
**I want to** see batch and serial as distinct, separately labelled fields
on the SKU detail view wherever the combined tracking code used to appear
**So that** I can read a stock position's batch and serial each on its own
(R3, single unambiguous identity per stock position), with a clear "none"
shown when a code had no batch or serial rather than a blank region or a
crash.

E2E (UI) story: the operator opens the SKU detail screen and sees
`batch_number` and `serial_number` rendered as separate labelled fields in
place of the opaque combined code, with an explicit "none" state where a
row's batch or serial is NULL.
