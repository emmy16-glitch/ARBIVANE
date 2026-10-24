# Stage 8 — pinned upstream source math and fourth liquidation invariant

**Status: offline reference model; trade execution and wallet signing are disabled.**

## Concrete defect corrected

The earlier `assessPaperLiquidation()` implementation checked the initial borrower risk, the discounted-collateral inequality, and that *final* health remained below 100%. It **did not** check the *fourth* requirement: the liquidated borrower's health factor must strictly **increase** (equivalently, the new liquidation discount must be strictly smaller). This allows a formally unhealthy position to become **more** unhealthy while satisfying the other three checks. Stage 8 adds `FINAL_HEALTH_NOT_IMPROVED` using cross-multiplication of integer-adjusted collateral/debt sums, without rounded/displayed basis points.

This rejection is grounded in the upstream `Contract::internal_liquidate` source (`new_max_discount < max_discount`) and the official four-rule documentation.

## Source snapshot and exactly what is replicated

Source repository: https://github.com/NearDeFi/burrowland

Pinned **historical upstream commit**: [`0dbfa1803bf26353ffbee2ffd4f494bab23b2756`](https://github.com/NearDeFi/burrowland/tree/0dbfa1803bf26353ffbee2ffd4f494bab23b2756) (2022-07-07).

Relevant reviewed source files:

- [`contract/src/big_decimal.rs`](https://github.com/NearDeFi/burrowland/blob/0dbfa1803bf26353ffbee2ffd4f494bab23b2756/contract/src/big_decimal.rs): 27-decimal fixed-point scale, `mul_ratio`, `div_ratio`, division and half-up rounding rules, balance/price conversion.
- [`contract/src/pool.rs`](https://github.com/NearDeFi/burrowland/blob/0dbfa1803bf26353ffbee2ffd4f494bab23b2756/contract/src/pool.rs): collateral shares-to-amount rounding down, borrowed shares-to-amount rounding up and full-share redemption special case.
- [`contract/src/actions.rs`](https://github.com/NearDeFi/burrowland/blob/0dbfa1803bf26353ffbee2ffd4f494bab23b2756/contract/src/actions.rs): `compute_max_discount` and all four liquidation pre/post constraints. Its `internal_repay`, `asset_amount_to_shares` and `internal_decrease_collateral` mutate lending pools and are **not** fully simulated here.
- [`tests/liquidation.rs`](https://github.com/NearDeFi/burrowland/blob/0dbfa1803bf26353ffbee2ffd4f494bab23b2756/tests/liquidation.rs): example successful liquidation plus a negative test for deteriorating health.

These are **historical open-source contract formulas**, not verified source-to-WASM equivalence for today's `contract.main.burrow.near`. A historic repository commit SHA is **not** a deployed NEAR `code_hash` and should never be treated as one. No claim of audit, verified mainnet source linkage, or complete execution simulation is made.

## Implemented

1. `src/rhea/source-math.ts` — independent bigint transcription of the upstream 27-decimal arithmetic and pool share conversions. It never signs, transfers, constructs a trade instruction, or grants approval. Inputs are bounded and malformed values are rejected.
2. `src/rhea/source-differential.ts` — compare the independent source-model adjusted collateral/debt and display health to Stage 2's conservative micro-USD arithmetic, with **no tolerance-based auto-accept**. Divergent rounding is reported explicitly.
3. `src/rhea/liquidation.ts` — fourth fail-closed liquidation invariant using exact unrounded ratio comparison, independent of source-model approximations.
4. `tests/rhea-source-math.test.mjs` — zero/overflow cases, ratio round-half-up behavior, full pool redemption, published liquidation fixture, deteriorating-health regression, precision divergence, and proof that passing models never authorizes real funds.
5. `npm run audit:rhea:source` — prints a clearly labeled **offline synthetic fixture** report. `EXECUTION_ENABLED=false` is mandatory.

## Why this is not mainnet parity

- Stage 8 synthetic oracle values do not come from today's on-chain aggregate oracle. Modern Rhea can include default-price assets, Pyth metadata and special derivative conversion paths.
- The historical Rust source may differ from currently deployed WASM. Source-to-WASM verification, including a code-hash pin and reviewed upgrade history, remains undone.
- The model does not replay complete mutation of global lending pools, interest accrual, position-isolation rules, storage deposits, token payouts or wallet/treasury funding. These can change final health and realized net profit.
- `sourceCheckLiquidationRules` accepts explicit **pre/post** reference values; satisfying the four algebraic checks does not prove the pre/post values are executable or achievable.
- Micro-USD conservative arithmetic and source 27-decimal arithmetic use intentionally different rounding policies. A mismatch is evidence to investigate, never a signal to send a transaction.

## Next independent proof required

1. Identify the mainnet `code_hash` of the deployed Rhea lending contract at a documented finalized block and establish verified source-to-WASM correspondence.
2. Validate all required asset-specific price/ratio paths, especially legacy USN debt and isolated positions. Issue #7 remains open.
3. Obtain **independent** same-block financial pre/post reference values from audited source or a deterministic WASM sandbox, then compare full liquidation *pool mutations* and risk checks on real fixture snapshots.
4. Verify liquidator solvency/funding, gas, transaction finality and custody-enforcing contract design before switching on any execution pathway.

There is no transaction executor in this change. A passing workflow does **not** establish profitable liquidations or readiness to custody funds.
