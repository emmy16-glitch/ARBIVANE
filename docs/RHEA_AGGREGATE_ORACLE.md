# Stage 4 — current Pyth-style Rhea aggregate oracle adapter

**Status: locally tested parser and public-RPC read-only compatibility check, not an oracle audit and NOT a trade-ready feed.**

## Why this is needed

Stage 3 mainnet evidence found that `aggregate-oracle.near` did not support the older Burrow bot's `get_price_data({asset_ids})` interface. That is a real incompatibility, not a reason to silently downgrade to `priceoracle.near`.

The current `aggregate-oracle.near` is Pyth-compatible: on-chain Rhea receipts include `get_price_no_older_than` calls with `{price_id, age}` and Pyth-shaped responses with `price`, `conf`, `expo` and `publish_time` (Unix **seconds**). Rhea lending calls the aggregate oracle with feed IDs rather than token account IDs. The batch interface `list_prices_no_older_than({price_ids})` is documented in Pyth-compatible NEAR oracle sources.

**Sources:**

- On-chain Rhea-to-oracle receipt with exact arguments and example output: https://nearblocks.io/zh-hk/txns/7oZqGxpvQXCT1yguCkxSWUSgdcYPcgDNYUo1gA2mGFzA/execution
- Pyth NEAR oracle interface (`price_ids` and HashMap return): https://github.com/pyth-network/pyth-crosschain/blob/main/target_chains/near/receiver/src/ext.rs
- Rhea's mainnet contract directory: https://guide.rhea.finance/developers/contracts
- Pyth-compatible aggregate-oracle methods discussed in this source: https://github.com/out-layer/outlayer/blob/main/RFP_RESPONSE.md

## What is implemented

`src/rhea/aggregate-oracle.ts`: strictly parse a bounded map of requested 64-character feed IDs; preserve exact bigint price math and signed `expo`, and accept only positive prices with bounded confidence, fresh timestamps, complete maps and matching block heights.

`src/rhea/aggregate-probe.ts`: check lending and oracle account code hashes at a single finalized block, prove mapped assets are present in the lending market, then query the Pyth-compatible batch method and return a non-executing report. An operator may optionally supply approved code hash pins. An unpinned or partially mapped diagnostic explicitly warns that coverage/contract identity isn't approved.

`src/rhea/aggregate-probe-cli.ts`: no wallets, no secret keys, no transactions. A missing mapping or any unexpected format aborts. The existing legacy probe is retained for regression evidence; it is **not** a valid current oracle adapter.

## Running the read-only check

First independently verify the lending contract's actual **asset ID to oracle feed ID** mapping and current audited contract source. Do not guess from ticker symbols: the same feed can represent different bridged assets, a market can use different price configurations, and feed identifiers can change.

Only after validating mappings, supply explicit JSON; example below is syntactic, **not a pre-approved market oracle map**:

```bash
export NEAR_NETWORK=mainnet
export EXECUTION_ENABLED=false
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
export RHEA_OPERATOR_FEED_MAPPINGS_JSON='[{"assetId":"wrap.near","priceId":"c415de8d2efa7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750"}]'
npm run probe:rhea:aggregate
```

The `wrap.near` feed above is a public Pyth NEAR reference, *not proof* the deployed Rhea lending contract currently uses that feed. Do not use this example to value positions or authorize trades. The diagnostic distinguishes `PARTIAL_FEED_READS`, `ALL_LISTED_FEEDS_READ` and `INCOMPATIBLE_READS`. It never reports financial execution readiness, even when all listed feeds return valid prices.

## Limits and next stage

- The presence of one valid price does not establish price source correctness, contract freshness policy, asset decimals, liquidation price computation, or Rhea contract parity.
- Rhea has more than one lending asset. Partial mapping must never be used as a whole-market valuation source.
- The `maxAgeMs=60_000` and `maxConfidenceBps=250` settings are **our conservative diagnostic policies**, not a claim that Rhea implements those exact bounds.
- No function in this stage signs or sends a transaction; no automatic feed mapping/fallback exists.
- In Stage 5, inspect current deployed Rhea code and on-chain configuration, pin signed source/code hashes, derive validated oracle asset mappings, and differential-test Rhea's live health factor/rounding before building a policy contract that controls funds.

### Important economic distinction

A valid Pyth feed describes an oracle price, not a realizable swap route. ARBIVANE must later revalidate liquidity, gas, repay requirements, collateral disposition, liquidator account solvency and final receipts. A positive oracle spread is not profit.
