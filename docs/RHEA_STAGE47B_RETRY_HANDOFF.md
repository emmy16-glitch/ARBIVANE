# Stage 47B — verified Stage42-to-Stage43 cursor handoff and complete blocked-retry batches

The merged Stage47 Stage42 scan advances from the historical Rhea debt index cursor 1292 to 1612 after a fully reconciled 320-borrower window. Its successor Stage43 incorrectly used hardcoded cursor 972 for automatically triggered workflow runs. That silently tied all later Stage43 searches to the *previous* Stage42 window.

This change removes the Stage43 default for automatic runs and derives the cursor from the downloaded **actual selected Stage42 aggregate** using `scripts/stage47-stage43-cursor-cli.mjs`. The script reuses strict Stage47 complete-window schema and counter validation. A manually supplied cursor must match the aggregate exactly. Stage43 then *independently recomputes* the source/shard/aggregate reconciliation and matches actual borrowers and position IDs, rather than trusting the cursor alone.

## Continue every authentic blocked-target batch

A single Stage43 run rechecks at most 12 genuine previously blocked observations on one current finalized block. Before this change, remaining blocked targets were documented but not automatically revisited. After successful validation, when `remainingTargets > 0`, the workflow queues the **same** Stage43 workflow again with its original Stage42 run ID, aggregate-verified base cursor and observed next target index. It checks exact arithmetic and bounds, uses one serialized concurrency group for a Stage42 parent, and aborts on any invalid input. No candidate gets fabricated and no result is reclassified as healthy or executable because an RPC call failed.

A verified Stage43 run may trigger the existing Stage44 read-only sizing and isolated Sandbox-only replay conditional on actual source-valid opportunities. Chained workflow runs are bounded by the real blocked count (at most 320), 12 targets per run, and strictly increasing `fromTarget`.

## Hard execution boundaries

These are historical registry account IDs refreshed by read-only **mainnet** queries. They are not a proof of current complete market coverage, liquidation permission, funding, successful Rhea `execute_with_pyth`, sold collateral, profits, or withdrawal. Mainnet signing is still disabled. Every action with money effects stays confined to disposable local NEAR Sandbox behind the existing positive-source checks.

## Verification

Run `npm run check`, read the resulting CI jobs and validate Stage42/43 artifacts separately. Stage42 window 972–1291 completed in run `40166087182`; the new Stage47 window begins at 1292. Its actual success must be established from GitHub Actions evidence, not inferred from a merged workflow.
