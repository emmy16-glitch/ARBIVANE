# Stage 29 — active `execute_with_pyth` valuation

Stage 28 proved that `priceoracle.near` returns explicit null prices for all seven
assets in the observed borrower position. That is expected for the inactive
legacy branch: the deployed lending configuration has `enable_price_oracle=false`,
`enable_pyth_oracle=true`, and points `pyth_oracle_account_id` at
`aggregate-oracle.near`.

`probe:rhea:active-pyth-valuation` now reconstructs the price representation used
by the active branch from the lending contract's own `TokenPythInfo` rows. It uses
integer arithmetic only:

```text
multiplier = trunc(pyth_price × 10^pyth_exponent × 10^fraction_digits)
decimals   = token_decimals + fraction_digits
```

For a configured `extra_call`, the returned U128 ratio is composed at a 1e24
scale before the single final truncation. This is required for
`meta-pool.near` (`get_st_near_price`) in the observed position. The asset's
`extra_decimals` is then applied by the lending BigDecimal balance valuation.
The implementation matches the current public Rhea Go and Python SDK formula;
it does not use JavaScript floating point.

## Reproduced evidence

At finalized mainnet block `221433162`, with lending code hash
`6Nek1MZ8cwJJ2xMQAUWup9V5AToYS9rkTxJfwo6BCpFa` and aggregate oracle code hash
`9vafnXzrPYQ4ErDqt2triRkQJHdxtG7tfkyb24t5Ttrg`, the seven-asset regular
position for `tmp-owner.main.burrow.near` required six unique Pyth feeds and one
staking-ratio view. It produced:

- adjusted collateral: `80427003646651900306081204528` E27
- adjusted debt: `59018056385909889501231235471` E27
- health factor: `13627` basis points

These magnitudes are economically plausible (roughly $80.43 and $59.02), unlike
the prior 10^51-scale output. The previous 97.27% paper health was caused by
using the raw Pyth exponent as the lending `Price.decimals` and by omitting the
configured derivative ratio. The refreshed account is healthy under this
reconstruction and must not be liquidated.

The command pins lending state, borrower detail, price metadata, Pyth quotes,
and derivative ratio calls to one finalized block; verifies code hashes,
freshness, confidence, share rounding, and a value sanity bound; and retains
`executionEnabled=false`, `maySign=false`, and `mayBroadcast=false`.

## Remaining boundary

The deployed Wasm exposes `execute_with_pyth`, `callback_execute_with_pyth`, the
current `Liquidate` action, and the same Pyth metadata fields, but a reproducible
source-to-Wasm build is not available. This result therefore establishes the
correct active price-unit reconstruction and rejects the false candidate. It
does not prove liquidation action semantics, Sandbox transaction success,
financing, swap proceeds, gas, competition, or realized profit.

No wallet or private key is used. Mainnet signing remains disabled.
