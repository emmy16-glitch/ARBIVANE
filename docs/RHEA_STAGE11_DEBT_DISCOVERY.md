# Stage 11 — Bounded Rhea debt discovery (read only)

**Security status: READ ONLY, NOT TRADE READY.** This code discovers **nonzero borrowed shares**, not profitable liquidations, unsafe accounts, USD values, or executable opportunities.

## Why this exists

The Stage 10 public-mainnet check sampled 100 of roughly 72,768 accounts and found no debt-bearing isolated position in that deterministic sample. That is not evidence no loans exist. The next step is a cursor-based, bounded account-index scanner that can cover deliberately selected index ranges instead of repeatedly sampling the same spread windows. NEAR account-index ordering is **not** an order of liquidation opportunity or risk.

The modern Rhea Go SDK `common/lending/models.go` defines `AccountAllPositions` with a `positions` map of independent `AccountPosition` records. The Stage 10 comparator already preserves isolated position boundaries. Stage 11's discovery respects the same separation, while allowing explicitly present legacy account-wide `borrowed` shares when no isolated debt exists. It does **not** label positions as liquidatable. Source: https://github.com/rhea-finance/lending-sdk-golang/blob/main/common/lending/models.go

## Implemented

`src/rhea/debt-discovery.ts`:

1. Pins the lender account code hash, asset pools, account count and paged borrower reads to **one finalized NEAR block**.
2. Scans from an operator-supplied integer `fromIndex` over a bounded range (up to 1,000 accounts per run, pages of at most 50).
3. Validates exact unsigned 128-bit share strings, token IDs against the listed lending pools, account ID uniqueness, and isolated position identifiers.
4. Preserves position boundaries: reports borrower account ID, isolated `positionId` (or **null**, meaning a distinct account-wide position), and borrowed token IDs. No USD amounts or profitability estimates are created.
5. Rejects mixed account-wide debt and nonempty isolated positions as an ambiguous schema. Rejects missing legacy debt fields instead of inventing zero exposure. A malformed row is counted as an error and the whole window is marked `SCHEMA_ERRORS_DETECTED`.
6. Emits the **exact `nextOffset` of the last processed account**, even when the finder hits `maxFindings` midway through a fetched page. This prevents accidentally skipping unseen entries.

## Run one window locally

Requires Node.js 22.16 or later. No wallet or private key is needed.

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_DISCOVERY_FROM_INDEX=0
export RHEA_DISCOVERY_MAX_ACCOUNTS=200
export RHEA_DISCOVERY_PAGE_SIZE=25
export RHEA_DISCOVERY_MAX_FINDINGS=20
npm run probe:rhea:debt-index
```

Record the report's `nextOffset`, `blockHeight`, `totalAccounts` and `observedLendingCodeHash`. For the next **new** window, set `RHEA_DISCOVERY_FROM_INDEX` to the prior `nextOffset`. Each run obtains its **own finalized block**; borrower indices may be inserted, deleted, or reordered between runs. Therefore a collection of sequential cursors does **not** establish an atomic, no-gap full-market historical snapshot. Add block-anchored indexing or replayable event/indexer evidence before attempting continuous full coverage.

Optional `RHEA_EXPECTED_LENDING_CODE_HASH` rejects a mismatch but **must** be independently reviewed rather than copied from an unaudited observation.

## Status vocabulary

- `WINDOW_SCANNED_UNAPPROVED`: processed the requested range with no observed schema errors. **Not** proof of liquidation eligibility.
- `FINDING_LIMIT_REACHED`: discovery stopped because its finding limit was reached. Resume at `nextOffset` to avoid skipping accounts.
- `SCHEMA_ERRORS_DETECTED`: at least one borrower had malformed/ambiguous data; **that run is incomplete for risk purposes**. Review `schemaReasons`; never count those accounts as debt-free.

All results include `executionEnabled:false`, `liquidationParityVerified:false`, `pricesVerified:false` and `eligibilityVerified:false`. No transactions, account private keys, financing requests, liquidator actions or settlement instructions exist in the module. Public account IDs are included to permit subsequent read-only checks; treat reports as public-chain observations, not personal data enrichment.

## GitHub Actions

The manual workflow `.github/workflows/rhea-debt-discovery.yml` accepts a starting index and window length, and publishes the JSON evidence as an artifact. It is deliberately **manually dispatched** rather than an unattended trading loop. The ordinary safety CI runs all offline tests. Neither a green test run nor a successful page scan establishes deployed liquidation parity.

## Remaining blockers / next engineering stage

- Verify every debt-bearing position against `get_account_all_positions` at the same block, with full pool share-to-balance conversion and source/Wasm provenance; do not flatten isolated debt.
- Establish the deployed Pyth asset price source, including unresolved USN legacy debt (issue #7), and exact liquidation mutation/rounding under code-hash-pinned audited source (issue #12).
- Build a durable, reorg-aware account indexing strategy; an offset scan across changing blocks may miss accounts.
- Prove costs, financing, realizable collateral sale, custody controls, contract policy and final receipt reconciliation before enabling any execution.
