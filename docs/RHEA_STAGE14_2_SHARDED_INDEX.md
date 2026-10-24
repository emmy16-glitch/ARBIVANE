# Stage 14.2 — NEAR Rhea borrower index recovery and independent schema witness

**Status: research only. No wallet, transaction, or liquidation approval.**

## What failed and what the saved evidence proves

- The first single-job full-market scan [run 40071508836](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40071508836) reached index 5,100/72,768 before FastNEAR returned HTTP 429.
- A slower, checkpointed run [40072333263](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40072333263) was cancelled by the GitHub Actions 30-minute job timeout with checkpoint at **62,100/72,768** at block **221354065**.
- Its artifact recorded **0 borrower debt accounts, 0 parse errors, and positive borrowed lending-pool balances**. This combination is **not reliable evidence that the market has no borrowers**. The remaining 10,668 accounts were not inspected in that same-block run, and the paged borrower schema has not been independently proved to capture current isolated debt.

## New defenses

1. `debt-schema-witness.ts` takes bounded, deterministic account samples spread from index 0 to the final index; it re-queries each sample via `get_account_all_positions` at the identical finalized block. It independently validates debt share strings, assets, position IDs and collateral shape, then compares per-position debt asset sets to the paged enumeration. It does not log borrower IDs in the summary, and rejects unavailable, mismatched or malformed detailed views. *A matching sample is not proof of the entire market.* Default samples: 24 of total accounts.
2. `rhea-sharded-index.yml` uses a read-only `preflight` job to pin one finalized block, code hash and total account count, then **six distinct index-range jobs** for a manually initiated full-market scan. Every shard uses the same block height, with one request at a time and protective RPC pacing. Each shard uploads a checkpoint even if other shards fail.
3. `market-shards.ts` independently proves contiguous, disjoint coverage with one code hash/block, catches duplicate account IDs and incomplete shards, and refuses a clean result where the market has positive borrowed pool balances yet no debtor has been observed.
4. The `reconcile` job only runs if **all six scans and the witness succeed**, producing a separate aggregate JSON artifact. **The aggregate's `COMPLETE_UNAPPROVED` means only that the pinned-block index was enumerated**; it says nothing about borrower health or liquidation eligibility.
5. Public RPC may rate-limit, fail to serve historical block IDs, or throttle parallel runners. If any shard fails, inspect its individual artifact, reduce load or use an authorized archival RPC. Do not silently merge snapshots from different heights and label them a single market snapshot.

## Why not blindly import another bot?

The Rhea Finance open-source [lending-sdk-golang](https://github.com/rhea-finance/lending-sdk-golang) is used as an independent schema reference for the detailed isolated-position view. Its account shape is not automatically proof of the exact current deployed NEAR Wasm.

The official [NEAR Lake JavaScript framework](https://github.com/near/near-lake-framework-js) is intended for incremental block-event ingestion after backfill, not as a drop-in replacement for the Rhea account registry: logs alone do not recreate historical borrowers without the relevant past events and full state. Lake also requires S3 access with potential costs. It is not falsely described as already integrated.

## Running the workflows

- A PR change to the witness module triggers a lightweight `preflight` and bounded `witness` check. Heavy full-market jobs only run on manual `workflow_dispatch` to avoid repeatedly issuing 70,000+ account reads during ordinary development.
- From GitHub Actions, choose **NEAR Rhea sharded borrower index (read only)** → **Run workflow**. Review the `near-rhea-borrower-witness` artifact and the six `near-rhea-shard-N` checkpoints. Only when every job succeeded inspect `near-rhea-shard-verified-aggregate`.
- To run locally set `EXECUTION_ENABLED=false`, `NEAR_NETWORK=mainnet`, `NEAR_RPC_URL` to your HTTPS RPC and `RHEA_LENDING_CONTRACT=contract.main.burrow.near` and invoke `npm run probe:rhea:borrower-witness`. Never use this command for transaction signing.

## Hard blockers

Independent source-to-Wasm attestation, oracle/USN mapping, share and liquidation mutation parity, real financing, custody, and realized profit all remain unverified. Neither debt discovery nor synthetic unit tests authorizes live trading.
