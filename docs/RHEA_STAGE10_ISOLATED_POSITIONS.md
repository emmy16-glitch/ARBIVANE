# Stage 10: Position-aware, deployed Rhea read-only comparison

**No transactions, no custodial keys, no liquidation authorization, no profit claims.**

## Why Stage 9 did not work

The Stage 9 first-40 borrower diagnostic at finalized block `221344597`
found 38 isolated-position records and 2 with no legacy top-level
collateral/borrowed fields. Its legacy view model produced zero independent
balance comparisons (`UNSUPPORTED_ACCOUNT_SCHEMA`). A green GitHub Actions
workflow only indicated the advisory step completed, not that the probe passed.
See [PR #11](https://github.com/emmy16-glitch/ARBIVANE/pull/11).

## Source-backed interface

Rhea Finance's `lending-sdk-golang/common/lending/models.go` describes:

- `AccountAllPositions`: top-level `supplied` plus `positions` keyed by position ID.
- `AccountPosition`: independent `supplied`, `collateral`, and `borrowed` arrays.
- `AccountAssetBalance`: `{token_id, shares, balance, apr}`.
- `get_account_all_positions({account_id})`: source SDK view helper.

Sources: [Rhea Go SDK account](https://github.com/rhea-finance/lending-sdk-golang/blob/main/common/lending/account.go),
[model](https://github.com/rhea-finance/lending-sdk-golang/blob/main/common/lending/models.go),
[2022 original Pool math](https://github.com/NearDeFi/burrowland/blob/main/contract/src/pool.rs).
The SDK is a schema **reference**, not proof that deployed Wasm has identical logic.

## What's implemented

`src/rhea/isolated-parity.ts`: position-specific parsing of `get_accounts_paged`
and same-block `get_account_all_positions` views. The result compares each
position by its **exact position ID**, role, token, and share count. The balance
comparator uses separately implemented historical pool/share rounding, for both
borrowed (round up) and collateral (round down) balances.

Failure cases include unknown assets, u128 overflow, duplicate tokens, absent
position IDs, ambiguous global debt/collateral, mismatched shares, mismatched
balances, missing detailed view and cross-block RPC inconsistency. It refuses to
merge different positions, or assume the absence of an account field means a
zero-sized debt. Reports aggregate failure categories without borrower IDs.

The bounded default sample covers the first 40 listed accounts and at most
8 detailed isolated borrowers. It is **not statistically representative** and
not evidence of no competition or real profit.

## Run (READ-ONLY)

```bash
npm run check
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_ORACLE_CONTRACT=aggregate-oracle.near
npm run probe:rhea:isolated-parity
```

Optional contract hash pins must first be independently approved. Observed
hashes are not automatically approved. The GitHub Actions probe step is
**advisory**, publishes its JSON evidence and may exit 2 despite a green
wrapper workflow. Verify the JSON `status` field explicitly.

## Still required before an executable liquidation engine

1. Compare current deployed contract Wasm against a reproducibly built, audited source; current 2022 source is only a historical reference.
2. Establish live lending asset conversions, isolated-position share accrual and current liquidation health/mutation rules.
3. Resolve the USN debt and missing price metadata in GitHub issue #7, and verify every price feed, derived token ratio and fresh oracle policy.
4. Prove liquidator financing, NEAR asynchronous receipt/failure handling, enforceable contract custody, gas/slippage limits and independent security review.
5. Only then consider a **separate** tiny-capital execution pilot; none is enabled by this stage.
