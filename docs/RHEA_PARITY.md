# Stage 2: Rhea liquidation arithmetic and integration evidence

**Status: documentation-aligned indicative mathematics. Not a deployed-contract parity audit and not an executable liquidation bot.**

## Evidence and version split (October 23, 2026)

- Current Rhea developer contract list describes lending as `contract.main.burrow.near` and price oracle as `aggregate-oracle.near`: https://guide.rhea.finance/developers/contracts
- Old Burrow bot (`src/libs/config.js`) used `priceoracle.near`, plus `contract.main.burrow.near`: https://github.com/burrowHQ/burrowland-liquidation-bot/tree/main/src/libs
- Old bot's account/math source: https://github.com/burrowHQ/burrowland-liquidation-bot/blob/main/src/libs/account.js
- Rhea's lending guide specifies health factor below 100%, discounted collateral no greater than debt repaid, final health factor below 100%; discount equals `(1 - health_factor) / 2`: https://guide.rhea.finance/near-chain-guides/lending-and-borrowing/how-lending-and-borrowing-works/liquidations
- Older parser of price data: https://github.com/burrowHQ/burrowland-liquidation-bot/blob/main/src/libs/priceData.js
- Rhea experienced a major exploit in April 2026. Do not equate a published contract ID with an assurance of contract safety. Consult current official security reports and verify deployed upgrades and market flags.

**Current oracle compatibility is NOT established.** The documentation lists an oracle address but does not prove that `aggregate-oracle.near::get_price_data` serves the historical `{ timestamp, prices: [{asset_id, price:{multiplier, decimals}}] }` structure used by the old bot. If it differs, the scanner must fail and we must implement a reviewed adapter for that deployed interface. Do not quietly switch back to the legacy oracle or mix quotes from different feeds.

## Arithmetic and rounding (what was built)

- Shares to pool units: supplied collateral rounded **down**, borrowed debt rounded **up**.
- Position USD values: integer micro-USD; priced collateral rounded **down**, debt **up**. No JS floats.
- Collateral risk-adjusted USD: `floor(collateralUSD * volatilityRatioBps / 10000)`.
- Debt risk-adjusted USD: `ceil(debtUSD * 10000 / volatilityRatioBps)`.
- Health: adjusted collateral divided by adjusted debt; exactly 100% is **not** eligible.
- Discount: `(adjustedDebt - adjustedCollateral) / (2 * adjustedDebt)` for underwater accounts, compared using exact rational arithmetic rather than rounded percentages.
- Proposed repayment/seizure is evaluated against the **documented three liquidation conditions**, with post-repayment health recomputed. All legs are restricted to priced borrower positions and available balances.
- Returned results are `INDICATIVE_ONLY` or `PAPER_RULES_ONLY`, with `exactContractParityVerified: false` and no write transaction payload.
- The gross incentive is **not** realized profit. Network fees, swap liquidity, oracle price moves, market race, liquidator financing, borrowing constraints, attached gas/deposits and refunds are all outside this stage.

## Reproduction

```bash
npm run check
# The Rhea guide's hypothetical example must yield 8750 health bps,
# 625 discount bps, a valid 1000 DAI / 152 wNEAR action,
# and 9893 post-liquidation health bps.
```

With VERIFIED currently supported read endpoints only:

```bash
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.near.org
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
export EXECUTION_ENABLED=false
npm run scan:indicative
```

The command deliberately refuses stale/missing oracle timestamps and incompatible schemas; reads are pinned to one final NEAR block. The example addresses above are from current Rhea documentation, **not** this project's successful RPC probe. No live RPC call was possible in this research environment. Avoid uploading any keys.

## Mandatory checks before describing positions as real liquidation candidates

1. Query actual live mainnet `get_assets_paged`, `get_account(s)_paged`, `get_price_data`, and confirm final block pinning works with the current oracle. On any failure stop and document the exact issue.
2. Pin lending/oracle deployed **code hashes**, version and any upgrade permissions. Confirm asset config fields and oracle freshness units from deployed sources.
3. Obtain deployment-specific Rust contract code or an audited reference implementing the current liquidation call, risk ratios, price normalization, accrued share accounting and rounding. The older bot is insufficient proof.
4. Differential-test at least 100 borrower valuations against a live contract-derived authoritative health factor or an audited independently implemented simulator, with fixtures covering empty pools, missing feeds, stale prices, multiple assets and rounding boundaries.
5. Confirm market-wide liquidation enable/paused state and live oracle safety; verify no confusion between NEAR and cross-chain lending markets.
6. Verify liquidator financing and custody policy enforceability before producing **any** change-call payload.
7. Perform secure quote/fee/slippage and gas accounting; no claimed profit until post-finality asset balances are reconciled.

## Scope boundary

Stage 2 deliberately introduces *no* signing key, wallet, `oracle_call`, `execute`, cross-contract action, deposit, funding strategy, liquidation size optimization or mainnet write access. Passing tests establishes only a mathematical implementation of the documented rules, not deployment suitability.
