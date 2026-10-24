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

## First real scan and rate-limit correction (24 October 2026)

Initial PR #17 full-market action scanned 5,100 / 72,768 accounts on
NEAR mainnet at pinned block `221352712` and recorded **zero debt hits**
in that incomplete window. It then failed with **NEAR RPC HTTP 429**. The
failed run is not a market-wide debt count, nor proof of zero borrowers.
The follow-up patch defaults the actual RPC workflow to at most two concurrent
page calls, one-second minimum spacing between batches, and increasing
rate-limit backoff before failing. These are throughput/safety controls
and do not guarantee that public RPC budgets will permit a complete read.
The reported final totals must be read from the completed workflow artifact.

## Stage 14.1 — Rate limit recovery and exact-block checkpoint restore (24 October 2026)

The initial live PR #17 workflow ([run 40071508836](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40071508836)) scanned **5,100 of 72,768** registered account indices at finalized NEAR block **221352712** and then failed with **HTTP 429** from the public FastNEAR RPC. Zero debt accounts were reported in **that incomplete range only**. There was **no valid full-market debt count**, and CI's original safety/unit job being green did not change that fact.

Stage 14.1 makes the public-RPC backfill less aggressive: 50-account pages, two parallel page reads, and a 1,250 ms delay between batches. Transient HTTP 429 uses the server's `Retry-After` header if provided, exponentially increasing delays with randomized jitter otherwise, a shared throttle barrier, and at most seven retries. These delays can still exhaust a workflow's time budget; **they do not bypass server quotas**. Use a legitimately provisioned, reliable archival NEAR RPC if free public rate limits remain insufficient.

Every written JSON checkpoint is attached as a GitHub Actions artifact, including when a run fails. To resume, go to **Actions → NEAR Rhea full market debt index → Run workflow**, set `resume_run_id` to the previous run's numeric ID, and keep `from_index` and `max_accounts` identical. The workflow retrieves that run's artifact and sets `RHEA_BACKFILL_RESUME=true`. Resume **requires access to the exact historical finalized block** used by the checkpoint. A provider without historical state will fail; it cannot silently merge another block's data. In that case start a new run from index zero or use a trustworthy archival provider. Checkpoint assets and code-hash invariants are rechecked on resume. Public borrower identifiers in the artifact must be treated as protocol analytics data, not private financial profiles.

If a **complete** account-index scan reports zero borrower debts while the same-block lending pools show nonzero borrowed shares/balances, the report now returns `BORROWER_DEBT_MISSING_UNVERIFIED`. This is a diagnostic incompatibility, not a successful debt count. Live opportunities, collateral health, oracle values, liquidation contract parity, pricing of legacy USN, and profitability remain unverified. Signing and execution stay disabled.

A successful automated CI test run proves only local code properties. Review the backfill job's JSON `status`, `completeSnapshot`, `invalidAccounts`, `debtAccounts`, `debtPositions`, and `blockHeight` before making any claim about live Rhea debt activity.
