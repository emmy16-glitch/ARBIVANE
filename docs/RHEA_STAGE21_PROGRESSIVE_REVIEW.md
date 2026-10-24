# Stage 21 — Progressive NEAR borrower shard review

The Stage 19 96-part `get_account_all_positions` index can produce shard artifacts while the overall workflow is still running. Stage 20 can independently re-attest a single detailed-position shard but previously needed a manual workflow launch.

Stage 21 adds a low-frequency read-only GitHub Actions reviewer. On a schedule (hourly, minute 23), manual dispatch, or the first main-branch merge of its own workflow, it locates the newest main-branch sharded-index run (or an explicitly supplied run ID), checks that the source run belongs to this repository and was a push on `main`, lists already uploaded shard artifacts (which can exist before the source run ends), and selects the smallest unreviewed shard. It filters expired artifacts, requires exact provenance and size, and skips successful reviews recorded by run+shard artifact name. A failed review is *not* counted as reviewed.

The reviewer downloads exactly one source shard with the GitHub CLI, invokes the existing Stage 20 independent on-chain pinned-block and health-evidence verification with a budget of four observed borrower records, and uploads a uniquely named review only when that check succeeds. Reports remain `marketCoverageVerified=false`, `executionEnabled=false` with no approved liquidation/profit. Historical Pyth quotes can be stale, and unavailable old-block RPC state may block a review.

A scheduled workflow can be delayed by GitHub; this does not constitute realtime scanning or a guaranteed 96-shard completion. The original full-market reconciliation remains the only source of verified complete-market coverage; this progressive research path must never count partial debt as a market total.

See [Stage 19 run](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40087656497) and [GitHub CLI artifact retrieval](https://cli.github.com/manual/gh_run_download).

No keys, wallet signing, transactions, or PDFs.
