# Stage159 — executable LiNEAR source priority and funding-size guard

**Historical Stage159 record; the size floors in item 3 below were superseded by [Stage160](STAGE160_ANY_SIZE_SANDBOX_LIQUIDATION.md).** Stage159 remains the source of the verified LiNEAR-only route prioritization. Neither stage is evidence of profitable mainnet liquidation.

**Status:** Stage159 implementation was merged; Stage160 separately changes the old minimum-policy rule.

## Observed problem

Stage158 improved the Stage157 large-source search by targeting four historical windows containing 62 LiNEAR debt entries out of 320 indexed accounts. Stage38 ordinarily ranks positive source reference proposals by paper USD gross across **all assets**. This is valid for exploratory analysis, but a large WNEAR or cross-token paper route can lead its ranking even though the only independently exercised Stage37 Sandbox execution lane is `linear-protocol.near` repayment against `linear-protocol.near` seizure. The Stage157 gate then rejects that top-ranked proposal, potentially hiding an executable smaller LiNEAR proposal identified in the same current batch.

Historic indexed debt is *not* current liquidation eligibility, a fresh quote, a transaction receipt or trading profit.

## Stage159 implementation

1. Stage38 keeps its default all-asset exploratory behavior unchanged. An **explicit, opt-in** `STAGE157_REQUIRED_ROUTE=linear-protocol.near` admits only source-sized LiNEAR/LiNEAR proposals into `bestProposal` for the Stage157 Sandbox lane; the option rejects any other requested route and refuses wallet keys or mainnet execution.
2. Every original read-only evaluation still takes place. Positive but unsupported fresh source proposals stay in `rows` as `FRESH_SOURCE_UNSUPPORTED_SANDBOX_ROUTE` and increment `rejectedByRequiredRoute`; none become a replay plan. `positiveSourcePlans` and `sandboxPlanReady` now refer to supported-route plans when this option is enabled.
3. The Stage157 source admission gate additionally rejects any candidate with Rhea-internal repayment smaller than **ten times the prior verified Stage93 source size** or with `seizeInternal <= repayInternal`, even when reference USD repay/gross thresholds are met. Existing minimums of $1,000 reference repay and $10 reference gross stay unchanged. These internal units are not liquid LiNEAR wallet balances.
4. CI tests a larger unsupported WNEAR proposal outranking an admissible LiNEAR proposal; no supported proposal; invalid route options; insufficient internal repayment; and nonpositive source-token remainder. Stage157's workflow now includes the Stage38 route-selection regression tests.

## Verification and economic restrictions

These are static/fresh source *admission* guards, **not** proof that any sufficiently large borrower exists or a NEAR Workspaces clone actually settled. Each candidate still requires fresh pinned Rhea and Pyth source state, authentic deployed market reserve and permissions, exactly supported NEP-141 token denominations, original signed Sandbox FINAL receipts, borrower debt/collateral deltas, enough realized LiNEAR to return funding principal and accrued financing costs, and final zero Rhea partner borrowed shares.

The historical 100-test-LiNEAR trial failed financing-cost coverage against the same tiny borrower. Stage156's synthetic-clock receipt recovery is not a profitability fix. Stage159 does not increase loan sizes, subsidize remaining partner debt, relax the oracle, fabricate a large source borrower, or claim a flash lender. `EXECUTION_ENABLED=false`; mainnet wallets, signing, broadcast, treasury payouts and realized profits remain disabled.

After merging, inspect the *new* Stage157 workflow's four source artifacts for `rejectedByRequiredRoute`, fresh `bestProposal`, actual Sandbox receipts and residual debt before reporting any large execution success. If there is no eligible source, the correct result is `BLOCKED_NO_VERIFIED_LARGE_SOURCE`.
