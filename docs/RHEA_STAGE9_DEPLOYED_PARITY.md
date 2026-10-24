# Stage 9 — Deployed Rhea account balance differential

**Status: READ-ONLY, RESEARCH-ONLY. No liquidation, wallet, treasury or policy contract integration.**

## Why this test exists

A historical mathematical model can agree with its own synthetic tests while differing
from the upgraded lending contract currently on NEAR. This stage compares one **independently
computed** property — account shares converted into token balances — against the public
`get_account` view at one finalized block. It does not conflate a match with all of Rhea's
contract, asset valuation, oracle aggregation, or liquidation mechanics.

## References (not a deployed Wasm provenance attestation)

- Historical pool share code, pinned historical source location:
  https://github.com/NearDeFi/burrowland/blob/0dbfa1803bf26353ffbee2ffd4f494bab23b2756/contract/src/pool.rs
- Historical detailed account `get_account` code:
  https://github.com/NearDeFi/burrowland/blob/0dbfa1803bf26353ffbee2ffd4f494bab23b2756/contract/src/account_view.rs
- Rhea's current SDK typed `GetAccountTyped` function:
  https://github.com/rhea-finance/lending-sdk-golang/blob/main/common/lending/account.go
- Stage 5/6 asset metadata and missing-price evidence: `docs/RHEA_MARKET_METADATA.md`, `docs/RHEA_STAGE6_COVERAGE.md`.

## Implementation and evidence procedure

1. A public RPC `view_account` read chooses one finalized block. The lending and
   aggregate-oracle account code hashes are recorded at that block; optional operator
   hash pins cause a hard mismatch error. **Merely observing a code hash does not
   establish a verified build or vetted contract code.**
2. Reads `get_assets_paged` and `get_num_accounts` at that pinned block; all asset
   share and balance values must fit unsigned 128-bit bounds and pool invariants.
3. Reads a bounded **first N index order** page of `get_accounts_paged` at that block,
   skipping accounts with no debt, not claiming representative coverage.
4. For each selected account, reads `get_account` **at the same block**, checks
   token IDs and exact share amounts, computes `shares_to_amount` with the separate
   Stage 8 historical model, and compares integers to observed detailed balances.
   Missing/duplicate tokens, malformed values, isolated-position schema and page
   inconsistencies **cannot be silently treated as parity**.
5. Report states: `SAMPLED_SHARE_MATCH`, `SAMPLED_SHARE_MISMATCH`,
   `NO_BORROWERS_SAMPLED`, `UNSUPPORTED_ACCOUNT_SCHEMA`, or `INCOMPATIBLE_RPC`.
   Every status permanently carries `deployedLiquidationParityVerified=false` and
   `executionEnabled=false`. Failure exits 2; GitHub Action is advisory.
6. Report summarizes aggregate counts, NOT borrower IDs or raw borrower balances.

### Run manually (no secrets)

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
export RHEA_STAGE9_MAX_ACCOUNTS=40
export RHEA_STAGE9_PAGE_SIZE=10
export RHEA_STAGE9_MAX_DETAILS=8
npm run check
npm run probe:rhea:share-parity
```

Optionally set `RHEA_EXPECTED_LENDING_CODE_HASH` and `RHEA_EXPECTED_ORACLE_CODE_HASH`
**only when independently reviewed**. They are not preconfigured because no reproducible,
validated deployed Wasm build has yet been linked to the observed code hash.

## Coverage and known blockers

- First-N sample is not a random or complete audit. A missing USN borrower in this
  sample does **not** resolve the standing debt exposure or price metadata gap.
- Comparing the `get_account` view may be affected by protocol upgrades,
  view-simulation accrual and account schema changes. If it disagrees, investigate;
  do **not** suppress the mismatch or change rounding merely to get green checks.
- A successful share match does not establish code provenance, interest accrual parity,
  liquidation mutation/rounding, `execute_with_pyth` call correctness, solvency of the
  liquidator, oracle aggregation, flash liquidity, NEAR cross-contract outcomes or net profit.
- There is no signed transaction, gas estimator, wallet import, candidate construction,
  or custody authorization in this stage. The live CI job's `continue-on-error`
  explicitly means a green workflow is **not** a completed financial integration.

## Next research gate

Obtain actual current deployed contract source/Wasm provenance and pin an audited
version; separately establish active Pyth price valuation, legacy USN position logic,
share mutations and post-liquidation health checks using same-block reference data.
Only after independent custody and financing proofs should transaction execution be
considered.

**Initial live probe correction:** The first advisory run returned an on-chain `get_num_accounts` JSON number, not a numeric string. The strict parser now accepts bounded, safe-integer `u32`-style numbers for the account count only, retaining exact string-only `u128` validation for all share and token balances.

## Stage 9 live CI verification outcome (2026-10-24)

The first live sampling run on PR #11 did **not** pass: 40 sampled accounts
produced 40 schema failures and zero completed balance comparisons. GitHub
Actions showed a green *advisory workflow* because the live step explicitly
used `continue-on-error`; the Stage 9 JSON result was
`UNSUPPORTED_ACCOUNT_SCHEMA`. This is not evidence of deployed parity.

A follow-up diagnostic now classifies failures into bounded, non-identifying
categories (e.g. isolated positions, missing top-level borrowed/collateral,
unsupported detailed row). The categories do not relax any guardrail or
authorize a transaction. Inspect the JSON report and adapt only to a
verified, source-backed current schema; do not assume the historical
`get_account` view is compatible with modern isolated positions.
