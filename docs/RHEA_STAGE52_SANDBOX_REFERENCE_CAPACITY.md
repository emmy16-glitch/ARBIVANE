# Stage 52 — source-priced local liquidator collateral and pre-Borrow capacity gate

## Real blocker addressed

Stage49E (merged PR #80) funds a disposable Sandbox actor with **one Sandbox NEAR**, wraps it on the imported authentic `wrap.near` contract, and deposits the resulting NEP-141 token into imported Rhea lending. The subsequent borrower preflight checked only that **some positive collateral** existed. A genuinely positive Rhea liquidation reference plan can ask that actor to borrow much more than its deposited collateral supports, causing a predictable `Borrow` rejection after expensive multi-contract imports.

Stage52 adds a conservative, fail-closed *reference* capacity screen directly between actual wrapped-NEAR funding and `Borrow → Liquidate → Withdraw`, without issuing a mainnet transaction or faking local collateral.

## Strict same-source-block valuation

- Read the **actual newly funded Sandbox actor's** lending positions. Require only `wrap.near` collateral, positive internal balances and shares, and no preexisting outstanding actor debt. Do not infer collateral from simply sending a deposit transaction.
- Verify `wrap.near` and repay asset configurations in the proposal's exact pinned mainnet lending assets: `can_use_as_collateral`, `can_borrow`, `volatility_ratio`, and collateral `extra_decimals`.
- Independently re-read the active-Pyth lending config and `get_all_token_pyth_infos` from source and imported Sandbox lender. For the actual local collateral, derive the same integer-only multiplier/decimals representation as the current source-Pyth valuation implementation, using a source-pinned and locally matched aggregate Pyth feed and any whitelisted token-derived ratio. Validate quote confidence. Explicit on-chain default prices are validated separately.
- Compute actual deposited WNEAR collateral reference USD using `sourceFromBalancePrice`, risk-adjust it with `sourceMulRatio`, and compare with the originally source-reconciled repay-leg USD adjusted by `sourceDivRatio` for the borrow risk parameter.
- Require the actor collateral reference limit to cover the proposed intermediate borrow by **at least 125%**. This additional cushion is a conservative policy gate, **not** the deployed lending health formula or a guarantee that the real callback succeeds.
- Write an auditable `stage52-actor-borrow-capacity.json` with the exact integer collateral and debt values, buffer pass/fail and explicit nonexecution flags; include in Stage37/40/42/44 artifacts.

## Still missing

A source reference estimate cannot substitute for Rhea's deployed borrow path, Pyth callback, loan share rounding, actual Sandbox liquidation or final FT balance settlement. No current positive borrower, successful liquidation, financing, swap profitability or mainnet profit is claimed. **No mainnet keys, funding or signing.**

Stage49E's fixed one-NEAR collateral may be inadequate for many proposals. Stage52 **blocks** those instead of silently increasing collateral from an uncontrolled budget or inventing a local balance. The final acceptance criteria remain actual imported-state Sandbox receipts, debt and collateral changes and a debt-free liquidator, followed by independently verified financing and gas-adjusted net profitability for any future operator-authorized mainnet trade.
