# Stage177 — WNEAR funding oracle preflight

## Actual fault
Stage157 original pinned-block evidence (221842099) verified the LiNEAR liquidation route in Stage51. During later Stage52 collateral-capacity verification the WNEAR price, confidence and publish_time disagreed between the pinned NEAR archive and the local Workspaces clone. Local collateral funding had already been attempted. The original record did not include enough source storage evidence to prove why the two values diverged.

## Correction
The Stage37 runner now opts into Stage51 price parity for **wrap.near** as well as repay and seize tokens *before creating or funding an actor*. A mismatch prevents actor state mutation and local liquidation. It saves a redacted original-mismatch witness with changed field names and source block, without replacing real prices, modifying freshness bounds, introducing fabricated quote values or enabling real Mainnet spending. Both Stage157 artifact lanes preserve this witness.

## Important limitation
This is a fail-early integrity repair, **not** proof that cloned WNEAR values now match the source. The complete pinned oracle storage and temporal context still require validation to eliminate the divergence. A genuine source-vs-clone discrepancy must be treated as an unavailable executable candidate, not a transaction to force through. Stage93 independent old borrower success does not attest new larger payouts, usable flash lending, or real profit.

## Verification
The Stage51 regression deliberately alters WNEAR price, confidence and publish_time while leaving the selected liquidation feed unchanged; with the new opt-in, it rejects the actor *before* funding. The ordinary Stage51 API remains unchanged for callers without an actor collateral source requirement. Continue with original Stage157 Sandbox artifact diagnostics, not a fabricated large-transaction witness.
