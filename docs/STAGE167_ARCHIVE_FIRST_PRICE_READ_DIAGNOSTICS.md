# Stage167 — archival-first historical price views and original failure evidence

## What the genuine Stage165/166 evidence proves

The original completed [Stage157 larger-source run #40387459139](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40387459139) produced 12 original verified-source borrower rechecks, one paper LiNEAR/LiNEAR source proposal (borrower `fukaih.near`) and one attempted isolated Sandbox reconstruction. The Stage88 source clone witnessed the same block hash for lender/oracle/FTs and `meta-pool.near`, including its 62,971 original patched storage keys. Stage51 Pyth parity passed. The Sandbox halted before actor funding at `STAGE164_PINNED_SOURCE_RATIO_VIEW_FAILED`. No original borrower Rhea liquidation receipt or real profit resulted.

Stage166 merged independently in PR #255 and implemented transient-only archival RPC fallback, preserving all oracle validity checks. However, Stage166 still tried the **regular RPC first** for a historical block that may no longer be available on a non-archival provider after a long replay import. If that error was the generic JSON-RPC view failure rather than a 429/5xx, Stage166 correctly refused fallback but could not restore replay progress.

## Repair

1. Stage167 calls a configured authentic `STAGE45_ARCHIVAL_FALLBACK_URL` or `https://archival-rpc.mainnet.fastnear.com` **first** for each original, pinned source derived-price ratio; it offers a genuinely separate archival fallback endpoint for classified transient failures.
2. Both endpoints use the **exact** historical block number; a different block, contract panic, missing price, unexpected token method, altered local price or byte-for-byte source mismatch still blocks. Original cloned code, state and oracle are never edited.
3. Every source/clone comparison attempts to persist a bounded, credential-free `stage167-pinned-derived-price-diagnostics.json` with the contract ID, method name, result status and whether a secondary provider was used. The original error, source price, URL and any credentials never enter it. Failed checks retain their diagnosis before throwing, and a failed write fails closed.
4. Archive the evidence alongside all Stage157 source/borrower/Sandbox artifacts and run new regression tests, including non-transient source failures, 429 fallback, altered ratios and strict no-mainnet properties.

## Acceptance

- Full Safety and type checks pass, including the Stage164-167 tests.
- The original 12-borrower Stage157 scan and separate 320-account workflow run after merge, with source/clone pricing witnesses retained.
- If a new Sandbox real operation reaches Rhea's callback, inspect authentic `FINAL` receipts, debt-share changes, FT balances, actor's borrowing, interest and repayment.
- Do not call any green CI run a successful liquidation or realize paper gross as wallet profit.

Execution remains `EXECUTION_ENABLED=false`, mainnet signing forbidden, no user wallet risk authorized, Stage160's no arbitrary minimum amount policy retained.
