# Stage 35 — first tiny active-Pyth Rhea liquidation reference quantity

**Goal:** progress from Stage34 same-block godlike reference health (~89%) to specific bounded repay and collateral take quantities before attempting a full-fidelity NEAR Sandbox transaction.

## Source-checked quantity generation

- Gather current lending code-hash-verified borrower position, active Pyth quotes, pricing multipliers and asset volatility at **one** new finalized block. No cross-block mixing.
- Recheck all debt and collateral legs independently using exact `sourceFromBalancePrice`, `sourceMulRatio` and `sourceDivRatio` from public Burrow source, and ensure their sums equal the Stage29 actively repriced adjusted collateral/debt.
- Enumerate candidate repay-debt/collateral-seize pairs. Cap repay at **1% of the individual recorded borrower's internal debt-token balance** per candidate. Keep positive, u128-bounded BigInt quantities, use bisection to find the greatest possible collateral amount below an extra 0.75% buffer of the *reference* discounted-collateral bound.
- Simulate updated adjusted collateral/debt and apply **all four archived source checks**, including strict initial undercollateralization, discounted seized collateral no higher than repaid, final health remaining below 100%, and health strictly improving.
- Emit only the highest positive-gross **paper** candidate or a blocked result, with the exact chosen token IDs and **lending internal-unit** quantities. Do not infer native NEP-141 transfer atomic units or wallet-borrow amounts from these until current token precision and share conversion are independently attested.
- Keep a `minimumPaperGrossUsdE27` floor. This is **not a tradable net profit**: gas, funding, price impact, swaps, competition, partial NEAR receipts and settlement remain missing.

## Reproducibility

The new `rhea-stage35-atomic-reference-sizing.yml` workflow runs unit tests and a new mainnet **read-only** proof on `godlike.near`. It uploads `stage35-sizing.json`, which records risk, four-rule mathematical checks, candidate internal quantities, warnings and non-execution flags. For a healthy borrower, bad quotes or poor spread, the correct result is zero proposals.

The live contract is configured for `enable_pyth_oracle=true` and `enable_price_oracle=false`, making the archived liquidation bot's `priceoracle.near.oracle_call` path unfit for direct production reuse. New execution adapter must follow current `execute_with_pyth` branch. Current Rhea Go SDK documents action methods and at-least-18-digit internal borrowed-amount normalization but does **not** prove deployed liquidation action semantics.

## Hard blockers before user-authorized real mainnet trading

1. Verify live `execute_with_pyth` with `Liquidate` action ABI and confirmed successful liquidation receipts at the deployed Wasm.
2. Independently reconcile calculated **internal lending units** with executable action amount precision and available liquidator funding/collateral share rounding.
3. Import verified relevant contract state and run *that action* with funded temporary signer in NEAR Sandbox, proving full receipt/final balance parity and gas.
4. Verify executable financing and swaps, conservative real **net** profit, gas/storage/competition downside, and expiry.
5. Set a funded owner-controlled NEAR account, explicit maximum capital/loss, wallet signing policy and settlement controls. Never place private keys in repository or CI.

**This stage is not real liquidation execution.** No keys, no state changes, no assertions that paper gross spread is realized money. Execution enabled/sign/broadcast are all hardcoded false.
