# Stage 31 — Fresh active-Pyth screening for every indexed debt finding

Stage 30 scans the complete market in four pinned-block bulk shards and produces a validated `rhea-full-paged-index.json` only when ALL accounts are covered without duplicates. Stage 31 uses its **actual** debt findings (no hardcoded accounts or mock opportunities) to refresh current on-chain position details and active Pyth prices via `inspectActivePythValuation`. It enforces the Stage 29 fixed-point and derivative-conversion model, and blocks stale/changed/unpriceable positions rather than emitting fake opportunities.

The new `src/rhea/active-pyth-debt-queue.ts` takes a verified full-market source, an explicit debt finding cursor, and a bounded review budget. It returns per-account classifications: `PAPER_AT_RISK_UNAPPROVED`, `PAPER_HEALTHY_UNAPPROVED`, `NO_DEBT_NOW`, `BLOCKED_INCOMPLETE_QUOTES`, `BLOCKED_SOURCE_POSITION_CHANGED`, or `BLOCKED_RPC`. All candidates explicitly retain `executionEligible: false` and `tradeProfitVerified: false` even with sub-100% reference health.

The new workflow automatically starts a 12-account initial batch when the Stage 30 full scan successfully completes and can be manually dispatched with `scan_run_id` and `from_finding` to consume subsequent batches. Each batch carries `nextFinding` and `remainingFindings` and uploads a persisted JSON report. Large markets require multiple bounded batches and should eventually use a persistent worker and task queue; the current GitHub Actions workflow is the initial safe vertical slice, **not** continuous complete-market monitoring.

The source scan is a single historical finalized block; Stage 31 refreshes each candidate on its own fresh finalized block, which is clearly disclosed. A changed position debt asset set or missing position is NOT silently accepted. No eligible liquidation is claimed until actual current deployed liquidation rules and a stateful sandbox transaction replay are independently verified.

CI tests use injected read-only pricing responses for repeatability. This workflow uses the mainnet RPC **read-only**, with no signer, wallet, state-changing actions or transactions.

After successful full scan, visit GitHub Actions > "Rhea Stage31 active Pyth borrower queue (read only)" for the initial run or dispatch with a scan-run ID and debt finding cursor to advance. Each batch output includes a next cursor. Do not infer complete repricing from the first batch.
