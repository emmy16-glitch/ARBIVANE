# Stage 44 — Fresh Stage35 source sizing and isolated Sandbox gate for Stage43 recovered risk

Stage43 retry recovers up to twelve previously blocked observations in a single finalized-block batch. **A recovered paper-risk account is not a valid liquidation opportunity.** Stage44 closes the next missing link: its only inputs are the completed Stage43 retry artifact and the original verified Stage30 historical borrower index (run `40128285853`).

Before making an RPC call, Stage44 rejects conflicting source totals, duplicated or invented borrowers, bad source cursor coverage, stale/cross-block successful observations, misreported status counts, positive execution flags, and reference health factors inconsistent with Stage43's classifications. Only entries with status `PAPER_AT_RISK_NEEDS_FRESH_SIZING` become candidates. This is a bounded subset of at most 12 per Stage43 batch; Stage43 remaining retry targets are **not** silently counted as complete.

For each selected account, Stage44 independently reads the current finalized Rhea deployment, its active Pyth quotes, full position/asset state and recalculates a **fresh** Stage35 source-reference liquidation scenario. A previously observed 99% paper health does not qualify automatically. Incomplete RPC/oracle data and mismatched source evidence remain `BLOCKED_FRESH_SIZING`. Nonpositive plans are `NO_CURRENT_SAFE_REFERENCE_SCENARIO`.

A genuinely positive source-only repay/seize plan must also pass the Stage37 exact plan verifier; the GitHub workflow may then attempt a **local isolated NEAR Sandbox Workspaces transaction** using imported mainnet code/state. It preserves the actual receipts and Stage41 borrower/actor post-balance proof if execution reaches those stages. A failed state import, transaction callback or missing settlement proof is a blocker, not success.

## Boundaries

- Stage44 **does not** broadcast or sign mainnet transactions, connect a wallet, authorize funds or transfer realized profits.
- Stage35 source math does **not** establish current deployed liquidation-rule parity or native FT transfer-unit correctness. A Sandbox replay may fail even when paper spread is positive.
- Collateral inventory in Sandbox is **not** a completed swap or economic net profit. Financing, actual swap execution, slippage, gas/storage, competing liquidations, settlement into one token, risk limits and explicit owner authorization are separate unsatisfied gates.
- Stage43 may still be queued because its parent Stage42 has not completed. No Stage44 live borrowing numbers or successful Sandbox receipts can be inferred from passing CI.

## Usage

The workflow `.github/workflows/rhea-stage44-recovered-risk-sandbox.yml` follows only a successful Stage43 run in the same repository and main branch, or may be manually dispatched with a completed Stage43 run ID. It downloads immutable artifacts by run ID, limits RPC concurrency and preserves JSON evidence.

```bash
npm run check
```

Inspect [Stage44 Actions](https://github.com/emmy16-glitch/ARBIVANE/actions/workflows/rhea-stage44-recovered-risk-sandbox.yml) and its saved detailed JSON reports. A green workflow only establishes that the requested checks ran under the stated gates, **not** that an executable or profitable liquidation occurred.
