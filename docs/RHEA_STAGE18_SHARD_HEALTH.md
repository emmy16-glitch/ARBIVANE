# Stage 18: NEAR detailed debt shard to paper health

**Research only. Real-money liquidation is disabled.** This stage repairs Stage 17's assumption that the public paged account registry contains isolated borrowing shares. A same-block Rhea diagnostic on 24 October 2026 detected 0 debt-bearing accounts in paged summaries and 3 using the detailed get_account_all_positions view, in a small sample. Those counts are not market-wide statistics.

## How it works

1. Download the 12 exact near-rhea-shard-0 through near-rhea-shard-11 artifacts from a completed GitHub Actions run within this repository.
2. Invoke the existing mergeDebtShards validation. All shards must agree on NEAR finalized block, lending code hash, account count, index coverage, account identity, schema validity and borrowed-pool state. Missing, incomplete or conflicting evidence is rejected.
3. Compose a unified checkpoint containing the *actual* collected borrower findings and original account indices. This does not invent debt positions.
4. For each bounded candidate, recheck the original account ID at its registry index and read get_account_all_positions at the original finalized NEAR block. Validate exact isolated position IDs, debt token sets and collateral presence.
5. Verify detailed balance/share conversion with the historical source maths, then require complete direct Pyth metadata and price freshness checks before calculating explicitly non-executable **PAPER_AT_RISK_UNAPPROVED**, **PAPER_HEALTHY_UNAPPROVED**, or **BLOCKED** evidence.
6. Output a JSON report with read-only flags. No wallet, signer, liquidation transaction, funding, competing liquidator estimate or promised profit is involved.

## Running

\`npm run probe:rhea:sharded-health\` requires EXECUTION_ENABLED=false, NEAR_NETWORK=mainnet, NEAR_RPC_URL, RHEA_LENDING_CONTRACT, RHEA_ORACLE_CONTRACT, RHEA_SHARD_ROOT, and RHEA_SHARD_COUNT. Optional bounded RHEA_INDEX_FINDING_CURSOR, RHEA_INDEX_MAX_FINDINGS and RHEA_INDEX_MAX_FEEDS control review scope.

The GitHub Actions workflow **NEAR Rhea detailed debt to paper health (read only)** can be manually dispatched with a source sharded-index run ID. It also triggers from a successful main-branch sharded-index run; PR-only scans do not automatically trigger it. All input shards must still exist, and the RPC must support historical reads. A successful preflight or green witness is not a valid market index.

**Known blockers:** historical finalized blocks may become unavailable from public RPC endpoints; prices published at older blocks may be stale under current-time freshness rules. Never combine old debt with today's prices silently. Deployed Wasm source parity, contract-specific liquidatability, dynamic costs, liquidator competition, actual funding and realized profit remain unverified.
