# Stage 14: NEAR-first, same-block, full Rhea debt backfill

**Read-only. No wallet signing, orders, liquidations, fund custody, or proof of profit.**

## Goal and truthful counts

Rhea's lending contract has tens of thousands of indexed accounts; Stage 13's first 200 accounts produced no debt hits. We cannot infer that no loans exist or claim thousands of debt accounts. Stage 14 scans the complete available on-chain `get_accounts_paged` index when `from_index=0` and `max_accounts` covers the actual `get_num_accounts` value. It records the **real** number of distinct debt-bearing accounts, independent isolated debt positions, and debt asset IDs, without labeling any of them eligible for liquidation.

The included 12,000-account / 4,000-debt test is entirely **synthetic**. It checks scalability and arithmetic counts, NOT actual mainnet lending activity.

## How the NEAR-native indexer works

1. Use NEAR JSON-RPC public `view_account` and `call_function` only. Capture one finalized NEAR block and the on-chain lending contract code hash.
2. Pin `get_assets_paged`, `get_num_accounts` and **every** account-page read to this same block, and enforce pool token membership and u128 share validation.
3. Request bounded pages concurrently (1–12 worker requests; up to 50 borrowers per page), with bounded retry/backoff on rate limiting. Merge page results **in ascending account index** and reject duplicate borrower identifiers.
4. Preserve isolated position ID per debt finding and never merge independent positions. Use Rhea's current lending SDK public account schema as a compatibility reference; unknown response formats are errors, not debt-free findings.
5. Save one atomic checkpoint after each group of pages, with `nextIndex`, original block height, code hash, seen IDs, findings and errors. Resuming **requires** the original block height to remain queryable and every source identity to match. Never append a different block silently.
6. Produce `rhea-debt-index.report.json` for public borrow-share evidence and `rhea-debt-index.checkpoint.json` for read-only checkpointing. Reports are NOT execution instructions or liquidation candidates.

### Run manually

Requirements: Node.js 22.16+, TypeScript (for `npm run typecheck`), access to the public NEAR mainnet RPC.

```bash
export EXECUTION_ENABLED=false
export NEAR_NETWORK=mainnet
export NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
export RHEA_LENDING_CONTRACT=contract.main.burrow.near
export RHEA_BACKFILL_FROM_INDEX=0
export RHEA_BACKFILL_MAX_ACCOUNTS=100000
export RHEA_BACKFILL_PAGE_SIZE=50
export RHEA_BACKFILL_CONCURRENCY=6
npm run probe:rhea:full-debt-index
```

You can use `RHEA_BACKFILL_RESUME=true` only with a previously saved complete/partial checkpoint and the **same** configuration; the RPC must still support reads of that historical block. Re-running from index zero at a new finalized block is necessary for a new current-state snapshot. A numeric index cursor is not a stable lifetime account identifier.

The GitHub Action `rhea-full-market-index.yml` runs for changed indexer PRs or manual dispatch. It has a 30-minute cap and stores a report/checkpoint as short-lived artifacts. A timed-out run or RPC archive failure cannot claim full coverage. `invalidAccounts > 0` means incomplete financial classification even if all indexes were visited.

## Existing strong open-source sources and what we actually reuse

- **Rhea Finance lending SDK**: https://github.com/rhea-finance/lending-sdk-golang — authoritative *SDK schema guidance* for separate isolated positions, debt shares, and on-chain view names. Its Go implementation is **not** imported as a JS dependency, and its signing/API examples are not used.
- **NEAR Lake Framework JS**: https://github.com/near/near-lake-framework-js — suitable **next stage** for replaying contract events/block updates after initial full snapshot. The npm package is **not yet installed or integrated**; index freshness, storage/costs, event semantics, and reconciliation need design.
- **NEAR RPC**: native read-only NEAR blockchain interface for consistent finalized-block snapshots. No dependency on Ethereum/EVM flash loans.

## Critical unresolved execution blockers

Even a full, correct index cannot tell whether *thousands of debt accounts exist* until the actual run finishes. A debt account may be safe, frozen, undercollateralized, inactive, or missing a trustworthy price. Exact current Rhea oracle conversion, share mutations, liquidation-health parity, legacy USN debt pricing, financing, competitor priority and post-execution profit are **not verified**. All real-money actions remain disabled.
