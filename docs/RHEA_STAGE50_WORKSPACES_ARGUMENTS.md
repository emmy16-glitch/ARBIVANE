# Stage 50 — executable NEAR Workspaces argument types and strict Rhea action integrity

Stage49 (PR #71) added source-pinned `can_borrow`, `can_withdraw`, local pool balance inspection, and registration of the disposable Sandbox liquidator with Rhea lending and both NEP-141 assets. These are actual execution prerequisites but **not** proof of profitable liquidation.

## Two additional execution defects fixed

1. **NEAR Workspaces v5 requires bigint amounts in function calls.** Stage37 was passing `gasUnits` and `depositYocto` as JSON strings to `actor.callRaw`. The real Sandbox call now converts both explicitly with `BigInt(...)`, matching the existing successful Stage44 test contract call and the published Workspaces TypeScript API.
2. **Route integrity beyond token identities.** Stage49 used to verify the borrowed and seized token IDs but not that the actual `Borrow`, `Liquidate` and `Withdraw` amounts agreed or that the liquidation target was the plan's borrower. It now enforces a single debt asset and a single collateral asset, exact `Borrow.amount == Liquidate.in_assets[0].amount`, `Liquidate.out_assets[0].amount == Withdraw.amount`, strictly positive internal quantities, U128 bounds, and identical borrower account identity. Missing, extra or malformed action legs fail closed.

The validation handles only **Rhea internal lending units**, not raw FT amounts. It cannot create financing, restore stale candidate profitability, override a disabled token, attest Pyth, assert collateral repayment or authorize mainnet spending. Stage35 positive-source admission, Stage41 actual debt/FT delta checks, and Stage48 finalized Sandbox persistence remain mandatory.

## Verification

`npm run check` covers normal and adversarial action consistency, exact argument types and safety gates. A fully imported local Rhea contract replay with actual successful Pyth callback and post-balance changes remains a future empirical condition; neither unit tests nor an unrelated Sandbox contract count as completed liquidation.

Reference: [near-workspaces v5 functionCall accepts bigint gas/deposit](https://near.github.io/near-workspaces-js/functions/index.functionCall.html). Never place wallet secrets in GitHub workflows.
