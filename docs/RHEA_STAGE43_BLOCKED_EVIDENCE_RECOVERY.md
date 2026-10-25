# Stage 43 — Recover blocked current Rhea observations without fabricating market coverage

Stage 42 reconciles four exact historical debt windows (320 real accounts) to a single verified Stage 30 registry, but reports `blockedInitialReads` and `failedRiskRefreshes` when public RPC, active Pyth or protocol checks fail. **Neither count means the corresponding borrowers were liquidated, healthy, or found unprofitable.**

Stage 43 reads the exact Stage 42 shard artifacts, recomputes the Stage 42 aggregate attestation and **rejects any mismatch**. It does not invent borrower addresses or randomly sample different accounts. The selected retry set consists of:

- **Previously blocked initial pricing**: any account classified `BLOCKED_*` in an original Stage 32 shard.
- **Previously blocked risk refresh**: an actually paper-at-risk account whose subsequent Stage 38 fresh sizing was `BLOCKED_FRESH_READ`.

The complete set is sorted by its verified historical finding index. If more targets exist than the configured hard budget (up to 320), the run fails visibly rather than silently skipping unresolved accounts or claiming coverage.

## What each retry does

1. Observe **fresh** finalized NEAR mainnet state through the read-only RPC adapter, with pacing and bounded transient retries. Historical source and fresh observations are never treated as the same snapshot.
2. Previously unpriced accounts undergo active-Pyth valuation with live deployed lending/oracle code-hash checks, price/position identity checks and integer health-factor validation. Healthy and no-current-debt observations remain **paper-only**.
3. Only current paper-risk accounts are submitted to the existing Stage 35 conservative reference sizing. Previously failed Stage 38 risk rechecks go straight to fresh Stage 35 sizing.
4. A source-positive plan must also pass the Stage 37 exact **Sandbox-only** action gate. One best source proposal can reach the already-existing isolated Workspaces replay, which records genuine receipt or state-import failures rather than silently declaring a trade.
5. The report preserves every attempted borrower, origin, retry count, bounded reason code, and final outcome. It reports remaining blocked counts separately. Only the Stage 43 targeted cohort is covered; **the full Rhea market is not reindexed or repriced**.

No mainnet transaction is ever signed or broadcast. A source-positive spread is neither deployed liquidation eligibility nor a realized profit. Sandbox seized FT inventory cannot be represented as cash until actual financing, swap execution, storage/gas and other costs reconcile into a realized settlement asset.

## Trigger and evidence

The workflow `.github/workflows/rhea-stage43-blocked-recovery.yml` starts after a **successful Stage 42 workflow_run from this repository's main branch**, or can be manually dispatched with a completed Stage 42 run ID. It downloads the original verified full-account source from scan `40128285853`, the four Stage 42 shard artifacts, and the aggregate reconciliation from the same Stage 42 run. A clean Stage 42 report with no blocked items generates a zero-target result and does not call an RPC for borrowers.

One runner processes targets serially with globally paced mainnet **view calls only**. Retry backoff respects `Retry-After`; deterministic parity and oracle/source errors are not automatically retried. All Stage 43 results, progress and optional authentic Sandbox receipts are saved as GitHub Actions artifacts.

```sh
npm run check
```

For an actual live workflow result, consult [Stage43 Actions](https://github.com/emmy16-glitch/ARBIVANE/actions/workflows/rhea-stage43-blocked-recovery.yml) and inspect the JSON artifact. Passing unit tests do not establish that Stage 42 has finished or that a recoverable live liquidation exists.
