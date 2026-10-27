# Stage170 — bounded, source-backed scaling for larger LiNEAR liquidations

## Why the same mechanism does not imply any amount works

Successful historical Stage93 local Rhea Borrow→Liquidate→Repay→Withdraw proves one source-qualified small borrower could be liquidated in original NEAR Sandbox. It does not establish executable collateral/debt, borrow-pool liquidity or funding for another borrower. Stage157 run [#40402755800](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40402755800) genuinely reverted because Rhea discounted collateral exceeded actual repaid value. That original rounding problem was independently repaired upstream in merged [Stage169 PR #259](https://github.com/emmy16-glitch/ARBIVANE/pull/259), with a **source-level discounted repayment reserve** and four rule rechecks. Stage170 **preserves** that merged Stage169 fix without applying a second seizure haircut.

## Stage170 bounded scan expansion

- The regular Stage38 read-only candidate pipeline retains its 1%-of-debt reference sizing (`maxRepayBps:100`); no unexpected changes for other scans.
- Only Stage157 **source-backed same-token LiNEAR/LiNEAR** discoveries opt into up to 10%-of-debt reference sizing (`sourceMaxRepayBps:1000`). This is an upper bound, not a minimum or target. The actual chosen amount can be arbitrarily smaller or zero, depending on borrower debt, collateral, exact source Rhea liquidation rules, available source pool borrow capacity and four-rule health and discounted-value checks.
- The Stage169 discounted-value rounding reserve is recalculated by Stage35 at **each** source repayment size. No 10x multiplier of balances, no fabricated opportunities, no bypass of `requiredSameTokenId`.
- Maximum 10% opt-in is rejected for other execution assets and by the generic Stage38 route validator. The source scanner persists `maximumSourceRepayBps`, `bestSourceRepayUsdE27` and an explicit `sourceRepayScaleIsNotFundingAuthorization:true` marker. This prevents internal asset units from being casually labeled as dollars or realized profit.
- Regression tests compare 1% and 10% source sizing for an internally consistent authentic LiNEAR same-token source fixture, requiring larger actual **source** repayment and Stage169 nonzero reserve while preserving original four Rhea rules and all mainnet-disabled flags.
- Stage93 original small Sandbox workflow is triggered for changes to the core Stage35 source planner, so larger-source adjustments must not quietly regress the previously verified small path.

## Non-negotiable execution and economic bounds

Current Stage157 uses an isolated Workspaces Sandbox actor, normally funded with **1 NEAR of local wrapped collateral**, not a mainnet flash loan. Stage50 verifies actual original Rhea repay-token reserves, Stage51 confirms active Pyth source/clone parity, Stage52 must reject insufficient actor collateral borrowing capacity, and Stage41/48 require genuine completed Rhea execution and independent receipts, FT deltas and zero residual actor debt. Enlarged *source previews* do not bypass any of those gates.

No mainnet signer, wallet capital, gas/loan quotes or realized profit is authorized. A failed source recheck, funding-capacity check, or deployed contract callback stays BLOCKED with original evidence. In particular, a historically larger internal LiNEAR quantity may still have only pennies of nominal USD value and may be economically unprofitable after fees.

Stage170 is a bounded research increase. A profitable larger liquidation will be claimed only after original local receipt verification, independently repaid financing and positive net economics. Mainnet spending remains disabled.
