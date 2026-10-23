# Stage 5 — Rhea lending metadata and oracle feed discovery

**Safety status: READ ONLY.** This milestone does not produce transaction instructions, executable candidates, approved prices, health parity or actual earnings.

## Why the Stage 4 approach was insufficient

The previous oracle diagnostic accepted an operator-supplied `{assetId,priceId}` map. That only proved that a selected asset was listed and a selected oracle feed could be read. It did not prove the deployed lending contract actually used that feed for that asset.

Rhea's current open-source Go SDK provides a better route: it uses `get_all_token_pyth_infos` on the lending contract and consumes `price_identifier`, `default_price`, `decimals` and `fraction_digits`. It also consults `get_config.enable_pyth_oracle` before choosing Pyth-derived prices. The SDK computes special token-to-NEAR ratios for some liquid staking assets, so a direct Pyth price is **not** sufficient for those assets. Its price helper also mentions a separate `pyth-oracle.near` contract; contract identities and composition must be verified independently.

Primary upstream references:
- [Rhea Go SDK price.go](https://github.com/rhea-finance/lending-sdk-golang/blob/main/common/lending/price.go)
- [Rhea Go SDK config.go](https://github.com/rhea-finance/lending-sdk-golang/blob/main/common/lending/config.go)
- [Rhea developer docs](https://guide.rhea.finance/developers/contracts)

## Code implemented

`src/rhea/market-metadata.ts` reads the **finalized** lending contract code hash and pins the oracle account lookup, asset list, config and metadata to the *same* block ID. This avoids mixing prices and configuration from different blocks during discovery.

It classifies observed assets as `DIRECT_PYTH`, `CONTRACT_DEFAULT`, or `UNRESOLVED`. As required by the current Rhea SDK, `default_price` takes precedence over `price_identifier` when both are present; a shared price ID is intentionally permitted across different token IDs. It reports extra/stale metadata separately from missing entries. Any malformed feed ID, unsupported price struct, duplicate token ID, code-hash pin mismatch, inconsistent block or RPC method failure aborts the probe.

`src/rhea/market-metadata-cli.ts` is a public **read-only** CLI. It requires `EXECUTION_ENABLED=false` and `NEAR_NETWORK=mainnet`. No credentials, wallet imports or signed transaction methods appear in the module. In CI, a failing live probe is **advisory** and will not be mistaken for a passed integration.

## Run this check

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
npm run probe:rhea:metadata
```

Optional strict observed-code-hash pins: `RHEA_EXPECTED_LENDING_CODE_HASH` and `RHEA_EXPECTED_ORACLE_CODE_HASH`. Record the exact hashes in an auditable review before treating them as approved. The tool never approves its own discovered hash.

## What it does NOT prove

- A complete list of all historical or available assets: the configured `get_assets_paged` response may have pagination limits.
- The deployed Pyth oracle address/method and actual price source for every token. The SDK contains multiple price paths.
- The safety or liveness of a price, default value, bridged token, synthetic token or derivative conversion ratio.
- Precise deployed-contract liquidation math, close factors, borrow/repay limits, or liquidator ability to finance a borrow.
- Executable net profit. Oracle valuations are not realizable swap proceeds; storage deposits, gas, fees, slippage and competition still matter.

## Next verification gate

Inspect recorded CI output. If `get_all_token_pyth_infos` does not exist on the deployed contract, mark the method incompatible and audit the actual deployed code before creating another adapter. Do not infer success from the SDK docs alone.

If metadata reads succeed, independently reproduce selected on-chain position values against contract state at identical block IDs and compare with contract-level computation or audited source. Document divergence explicitly; do **not** silently change rounding to obtain matching fixtures.

Financial permissions, custody, Shade/TEE and real NEAR Intents settlement remain future independent milestones.

**October 23 live-probe correction:** The first CI run rejected assets that legally include both a default price and feed identifier. The SDK explicitly prioritizes the default price; the adapter and regression test now mirror that precedence. This alone does not establish deployed liquidation parity.
