# Stage 20: Independent NEAR borrower research from persisted partial shards

## Why it exists

A live detailed-position scan confirmed that the old paged account view missed actual debts. Twelve large scanner jobs timed out after processing around 1,200 accounts per job; even the 96-way full-market scan may have slow or missing shards. Waiting for full-market reconciliation need not prevent **read-only research** on an individual saved borrower shard.

`observed-shard-evidence.ts` validates one Stage 19 shard checkpoint, including its chain, lending contract, pinned block, code hash, true index range for the declared shard ID/count, contiguous scanned prefix, exact account membership and uniqueness, and detailed-only isolated debt asset scope. It rejects tampered counters, missing/duplicated account IDs, injected debt findings, schema errors, and false completed-market claims. A fully processed *individual shard* is still **partial coverage of the market**.

`observed-shard-health-cli.ts` independently rechecks the lending code hash and market account count at the pinned historical NEAR block. It can then submit up to eight observed debt accounts to Stage 17's existing same-block detailed balance and price checks, recording blocked, healthy, or paper-risk diagnostics. If there are no accounts with debt in the shard, it still verifies the NEAR source before saying that this shard observed zero debt.

### Run from GitHub

Go to Actions > **NEAR Rhea partial-shard debt evidence (read only)** > Run workflow. Enter a real detailed-index run ID (for example Stage 19 run `40087656497`) and a shard ID from `0` to `95` that has uploaded its `near-rhea-shard-N` artifact. A shard file that has not yet been persisted cannot be analyzed. The workflow downloads only this repository's artifact, validates it, and uploads `near-rhea-stage20-partial-evidence` when the check runs successfully.

Use source run IDs only if the artifact really exists; do not substitute a manually edited JSON report. To run locally, set `EXECUTION_ENABLED=false`, `NEAR_NETWORK=mainnet`, the NEAR RPC URL, lending contract `contract.main.burrow.near`, oracle contract `aggregate-oracle.near`, and the exact `RHEA_OBSERVED_SHARD_FILE`, `RHEA_OBSERVED_SHARD_ID`, and `RHEA_OBSERVED_SHARD_COUNT=96`, then run `npm run probe:rhea:observed-shard`.

## Trust boundaries

- Observed borrower counts are counts **within one scanned prefix**, not complete market counts or a projection of 72,768 accounts.
- Saved block heights and code hashes must match the NEAR RPC view, otherwise the probe stops.
- Historical Pyth quotes may be stale against wall-clock time, and are not upgraded to fresh by changing timestamps. Health remains based on historical Burrow source math, not deployed-contract parity.
- Nothing is sent, signed, traded, funded, liquidated or declared net profitable. `executionEnabled` is always false.
- The separate 96-way reconciler remains the only path to a complete index; Stage 20 never bypasses its checks.
