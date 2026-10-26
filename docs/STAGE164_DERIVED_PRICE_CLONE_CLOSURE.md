**Superseded scope note (Stage165):** The initial Stage164 global-market extra-call selection exceeded the 6-contract Sandbox limit for a Stage93 borrower and caused a real regression. [Stage165](STAGE165_BORROWER_SCOPED_PRICE_DEPENDENCIES.md) narrows the imported pricing contracts to the pinned borrower's debt/collateral tokens plus execution assets. All pinned-code/source-price parity requirements remain.

# Stage164 — Rhea derived-price dependency closure for real local Sandbox execution

## Original evidence, 26 October 2026

The original [Stage157 independent source run #40382961811](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40382961811), shard 0, archived artifact #12679488157, rechecked authentic Rhea/Pyth state and found one same-token LiNEAR liquidation proposal among twelve historical borrowers. Stage51 source-vs-Sandbox Pyth parity passed for the LiNEAR route; Stage52 actor collateral capacity passed and the **actual Sandbox transaction was submitted**. The original Rhea execution failed with:

```
Can't complete the action because account meta-pool.near doesn't exist
meta-pool.near|get_st_near_price cross call failed!
```

This is **not** a bad oracle quote, lender denial, a missing live flash lender or evidence of a profitable trade. It is an incomplete historical NEAR Workspaces contract dependency clone. Rhea revalues underlying collateral assets beyond the chosen LiNEAR repay/seize pair when `execute_with_pyth` runs, and one of those assets uses a real extra-call method on `meta-pool.near`.

## Stage164 repair

- Read original deployed Rhea `get_all_token_pyth_infos` from the **identical pinned source block** already used for borrower, prices and state import.
- Discover additional pricing-contract IDs **from source token metadata**, not guessed IDs, and include contracts exposing the recognized `get_st_near_price`, `get_nearx_price`, `ft_price` or `get_high_precision_virtual_price` derived-price view methods.
- Include the source-derived contracts in the Stage88 witnessed/Stage76 bounded, source-block-pinned imports. A single failed code identity, source hash, patch count or snapshot blocks execution; no fake price or mock contract is ever deployed.
- Recheck each declared derived-price view on source and its imported local contract at identical pinned provenance **before** actor collateral funding or the Rhea transaction, and refuse missing, zero or mismatched ratios.
- Archive separate `stage164-derived-price-parity.json` and the complete `stage88-sandbox-clone-witness.json` with each Sandbox attempt, including blocked attempts.
- Bound the entire dependency closure to six authenticated contracts, retaining the existing Stage76/88 budgets; if additional required contracts exceed the cap, fail explicitly instead of silently skipping them.

New tests prove `meta-pool.near` is added when its source metadata declares `get_st_near_price`, that exact pinned source/clone pricing values match, and that a forged source block, missing contract, tampered value, unsupported method or unbounded graph is rejected. They also check the recovery check executes before `sandboxTransactionSubmitted=true`.

## Economic truth and trade safety

The historic source proposal is a tiny reference gross amount and **not realized net income**. A green Stage164 unit test or cloned oracle view does not imply that an end-to-end NEAR Sandbox liquidation settled: only original `FINAL` receipts, source-borrower state deltas, actual FT balances, a fully repaid partner loan **including fees/interest**, and zero remaining debt can establish that. If a subsequent original Sandbox run fails later in Borrow/Liquidate/Repay/Withdraw, preserve the failure as new evidence; never remove the safety checks or call it profit.

Mainnet signing, custody, broadcast and user wallet transfers remain disabled via `EXECUTION_ENABLED=false`. Stage160's any-positive-size screening is unchanged. This stage fixes historical Sandbox completeness only; it does **not** supply live flash liquidity or unlimited safe transaction amounts.
