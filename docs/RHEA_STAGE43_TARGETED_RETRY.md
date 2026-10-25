# Stage 43 — targeted, reconciled retry of failed Stage 42 borrower observations

Stage 42 reconciles a **bounded historical debt-finding window** (four shards of 80) even when public RPC/active Pyth reads failed for individual accounts. A successful Stage 42 GitHub job therefore does **not** establish current health coverage for all 320 borrowers.

Stage 43 consumes:
1. The **actual verified Stage 30 full-index artifact** from run `40128285853`.
2. All four original Stage 42 shard reports (`stage32-reprice-report.json` and `stage38-qualification.json`).
3. Stage 42's `stage42-reconciled-window.json`.

**Before any RPC**, the module recomputes Stage 42's reconciliation and rejects missing, mismatched, forged, duplicate, out-of-window, or money-authorizing source evidence. It selects exactly two failure groups: accounts whose *initial active Pyth paper-health observation* was blocked and accounts classified paper-risk whose later *fresh Stage 35 source sizing* failed. Successful observations are not retried.

The read-only worker retries at most **12 failed findings per GitHub job**, using one newly selected finalized NEAR block and the Stage 29 active Pyth valuation route. The report records both the **historical finding index** and the **separate retry cursor** (`fromTarget`, `nextTarget`, `remainingTargets`) so missing or repeated work is detectable. Any untrusted valuation, RPC failure, or cross-block reply is **STILL_BLOCKED**, not healthy and not liquidatable.

A newly paper-risk position is explicitly **PAPER_AT_RISK_NEEDS_FRESH_SIZING**. Even if the original failure occurred during Stage 35 sizing, this stage **does not** reuse the old proposal or claim an executable liquidation: a fresh source sizing and actual stateful Sandbox callback and balance proof must be performed after repricing.

## Workflow

`.github/workflows/rhea-stage43-blocked-retry.yml` runs after a **successful** Stage 42 workflow in the same repository or can be dispatched manually with the Stage 42 run ID, exact historical base cursor, and target retry cursor. It downloads the original Stage 42 artifacts by that exact run ID and keeps its own report. An incomplete or untrusted upstream index cannot become a successful completed result.

A single job covers at most 12 targeted failures. When `remainingTargets > 0`, dispatch with the returned `nextTarget` for the **same original Stage 42 run**. New observations remain research-only and do not retroactively rewrite the Stage 42 historic artifact.

## Current limits

- Stage 42 may itself be queued, failed or cancelled. **Stage 43 has not recovered any mainnet reads until its own live workflow has completed.**
- This does not cover borrowers outside the original Stage 42 320-finding window, nor does it guarantee complete current-market health.
- RPC 429s, oracle staleness, historical drift and changed borrower debt can still block individual reads.
- No verified deployed liquidation parity, financing, swap proceeds, gas costs, realized profit, or spending authorization.
- `executionEnabled=false`, `maySignMainnet=false`, `mayBroadcastMainnet=false`; no mainnet transactions or sandbox mutation.

Verification: `npm run check`, and inspect the GitHub Actions artifact `rhea-stage43-targeted-blocked-retry`, **not just the green workflow status**.
