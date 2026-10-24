# Stage 12 — Read-only debt position triage

**Research status: NOT A LIQUIDATION EXECUTOR.** No transaction signing, wallet access,
contract authorization, oracle-price approval, or profitability claims are introduced.

## Purpose

Stage 11 locates public accounts with nonzero debt shares. That alone says nothing
about their health or liquidation eligibility. Stage 12 separately cross-checks
borrower debt **position identifiers and asset sets** using Rhea's
`get_account_all_positions`, and examines the lending contract's
`get_all_token_pyth_infos` and `get_config` at the **same finalized block**.
It refuses to combine isolated and account-wide debt, or assume that an
`unresolved` or fixed-price feed is live, solvent, or tradable.

## What it actually checks

1. Uses the Stage 11 bounded discovery window and its exact `nextOffset`.
2. Rechecks lending/oracle identities and optional reviewed code-hash pins at
   the discovered block. Mixed heights abort.
3. Reads lending-owned Pyth metadata and its activation config at the same block.
4. Retrieves bounded `get_account_all_positions` borrower views. Parses strict
   JSON array-based debt and collateral records, exact unsigned share strings,
   token-pool membership, and unique position/token IDs.
5. Verifies the discovered *sets* of debt tokens inside isolated position IDs
   exactly match detail. Verifies collateral's **presence**, not numerical
   collateral shares, because Stage 11 does not expose those figures.
6. Assigns one **non-executable** label: `DEBT_SET_OBSERVED_UNPRICED`,
   `PRICE_METADATA_GAP`, `NO_COLLATERAL_RECORDED`, `DETAIL_INCOMPATIBLE`,
   `DETAIL_UNAVAILABLE`, or `DETAIL_BUDGET_EXHAUSTED`.
7. Returns `liquidationEligible: false`, `expectedProfitUsd: null`,
   `priceParityVerified: false` and `executionEnabled: false` for every record.

A direct Pyth feed identifier means **only** that the lending contract lists
an asset-to-feed identifier. It is not a current price, a reviewed on-chain
valuation formula, a verified feed-to-asset provenance proof, or executable
profit. `CONTRACT_DEFAULT` and missing feed rows are blocked as incomplete
metadata. Existing USN exposure is particularly important.

## Run an explicit read-only window

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
export RHEA_TRIAGE_FROM_INDEX=0
export RHEA_TRIAGE_MAX_ACCOUNTS=200
export RHEA_TRIAGE_PAGE_SIZE=25
export RHEA_TRIAGE_MAX_FINDINGS=12
export RHEA_TRIAGE_MAX_DETAILS=8
npm run check
npm run probe:rhea:triage
```

For GitHub, run `Rhea position evidence triage (read only)` manually with a
bounded start index, or inspect its pull-request advisory run. Its workflow
uses `continue-on-error`, so **green workflow != valid oracle or parity**.
The artifact contains the actual status. Do not infer successful sample from
CI conclusion.

## Remaining blockers before any trading

- Verified deployed Wasm provenance and code hashes and isolated position
  financial calculations, including exact balances and post-liquidation health.
- Correct price paths for USN, LST/derived assets and frozen/legacy tokens;
  current oracle quote freshness, confidence and source authorization.
- Fresh competitive liquidation detection, financing source, execution/gas
  constraints, settlement custody, replay prevention and transaction receipts.
- Independent enforceable policy/treasury limits and contract security review.

Stage 12 is an **evidence quality improvement**, not a finished arbitrage bot.
