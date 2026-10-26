# Stage165 — borrower-scoped, source-authenticated pricing closure

## Why Stage164 was incomplete

[Stage164](STAGE164_DERIVED_PRICE_CLONE_CLOSURE.md) fixed the omission of `meta-pool.near` in the genuine [Stage157 source run #40382961811](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40382961811). But it naively selected **every** extra price method listed in Rhea's full-market `get_all_token_pyth_infos`. In the next authentic [Stage93 run #40386381267](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40386381267), the original evidence (artifact #12681790821) failed before importing any contracts: `STAGE164_UNSUPPORTED_DEPENDENCY_CLOSURE_SIZE` at `SANDBOX_STATE_CLONE`. This was a regression. **The pre-existing Stage93 run had passed before Stage164.**

## Repair

1. Use the already-authenticated `get_account_all_positions` for the **exact candidate borrower and exact pinned source block**. Walk each recorded position's `collateral` and `borrowed` entries, strictly validating token IDs and array/object shapes.
2. Include source-declared extra pricing contracts only if their token occurs in the borrower's pinned positions, or in the preexisting base execution assets (Rhea lending, aggregate oracle, LiNEAR, wrapped NEAR funding).
3. Continue cloning the original deployed contract code and actual source state; witness and verify each required dependency's identical pinned block hash, exact read/write closure and original derived price. **No fake quote, no artificial price adapter, no unknown mainnet signers.**
4. Keep the bounded 6-contract safety ceiling; fail closed for an unusually diverse relevant borrower rather than silently skipping an actual dependency.
5. Regression-test market-wide unrelated price assets, selected borrower `meta-pool.near` stNEAR dependency, malformed borrower positions, missing source ratio, wrong block, modified cloned ratios and no preemptive signing.

The source snapshot is never changed. Any output describing a `SANDBOX_STATE_CLONE` rejection must remain a rejection; do not claim settlement or profit. The Stage160 source-value policy has no arbitrary financial minimum. There remains no live flash loan partner or production mainnet trading.

## Verification required

- Full PR tests and Stage157 source-gate test pass.
- Run the Stage93 historical small borrower again and confirm it does not fail `STAGE164_UNSUPPORTED_DEPENDENCY_CLOSURE_SIZE`.
- Run the independent Stage157 source test for the genuine borrower that required `meta-pool.near`, and inspect the clone and execution evidence. Successful contract import alone is not liquidation.
- Original Rhea `FINAL` callback receipts, state deltas, wallet FT increase, zero actor financing debt and all interest/fees remain necessary for an end-to-end claim.

`EXECUTION_ENABLED=false`; original mainnet accounts are only used for pinned read-only views.