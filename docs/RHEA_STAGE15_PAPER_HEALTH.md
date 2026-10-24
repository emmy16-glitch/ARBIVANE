# Stage 15 — NEAR Rhea paper health screen

**Status: implemented as a strictly read-only research layer. This is not executable contract health parity.**

## What this stage adds

Stage 15 composes the bounded Stage 11 debt index, Stage 12 same-position detailed evidence, and Stage 13 lending-owned Pyth quote validation. It pins every public blockchain view to the same NEAR finalized block. For positions with verified debt/collateral scope and complete direct-price quotes, it requests `get_account_all_positions` again at that block, applies exact share-to-amount comparisons against pool balances, and evaluates **historical Burrow** 27-decimal price/volatility arithmetic with integers only.

The calculation emits `PAPER_HEALTHY_UNAPPROVED` or `PAPER_AT_RISK_UNAPPROVED` and reports the unadjusted view evidence through conservative adjusted collateral/debt values (27-decimal fixed point), a health ratio in basis points, and a source-model discount. No position is ever marked liquidatable, executable, profitable or financially approved. A complete result is **not** today's deployed liquidation contract parity. `liquidationEligible=false`, `estimatedProfit=null`, and `executionEnabled=false` are permanent properties.

## How it rejects unsafe evidence

- No fallback to contract default, derived token price guesses, missing price metadata, or stale/unconfident Pyth feeds.
- No float conversions of token/share amounts or financial prices; exact signed-integer strings and bounded BigInt arithmetic.
- Compare detailed share balances against independent source pool conversion; a mismatch **blocks**, rather than auto-correcting the account.
- Reject duplicate/missing assets, duplicate oracle quotes, unsupported positions, invalid volatility or decimals, and wrong block or changed lending code hash.
- Limit detailed reads, price reads, index pages, and account samples. Budget exhaustion reports a blocker rather than healthy status.
- No private keys, transaction signing, liquidation construction, flash loan calls, or custody interaction.

## Run manually

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
export RHEA_HEALTH_FROM_INDEX=0
export RHEA_HEALTH_MAX_ACCOUNTS=200
npm run check
npm run probe:rhea:paper-health
```

Manual GitHub workflow `Rhea paper health evidence (read only)` saves JSON. A green advisory run does not imply it found a debt position: inspect the JSON status and `paperAtRisk`, `paperHealthy`, and `blockedPositions` counts.

## Where it remains blocked

The deployed Wasm/source build is not reproducibly attested; the modern isolated-position liquidation rules and rounding may differ from historical Burrow. Pyth feeds may be reused for assets with different derivative conversion semantics; this code does **not** attest price binding for production liquidations. Legacy USN/default-oracle/derivative paths remain unresolved. Large market backfill and verified debt-account collection are separate prerequisites. A paper-health value cannot establish executable profits without funding, transaction simulation, competitor checks, fee estimation, and receipt reconciliation. Do not connect funds.

This feature can be sampled independently while the full-market backfill's conditional monitor remains active.
