# Stage 55 — durable evidence from actual Rhea Sandbox execution

## Why this is needed

Stage37's genuine `execute_with_pyth` flow has multiple independent gates: source-pinned lending and token reserves, archival cloned storage, live Pyth view parity, actor account registration, wrapping/depositing sandbox NEAR, source-only actor borrow sizing, asynchronous Rhea callback verification, finalized local persistence, and borrower/FT balance settlement. Previously a failure anywhere was broadly reported as `BLOCKED_STATE_IMPORT_OR_INCOMPLETE_PROOF`, leaving operators unable to tell **where the attempted execution actually stopped**.

Stage55 records an ordered **durable local-phase witness** (`stage55-sandbox-phase-evidence.json`) during the actual Stage37 execution, including before potentially failing steps. Its immutable security fields deny all mainnet execution and profit claims. It never signs or sends real transactions.

The ledger records 13 phases, beginning at `SOURCE_ADMISSION` and ending at `SANDBOX_BALANCE_SETTLEMENT`. It independently records whether disposable local collateral funding was attempted and whether the local liquidation function call was invoked. An invoked call is **not** proof that any NEAR transaction was submitted, finalized or successful.

For failure it records `BLOCKED_LOCAL_RHEA_EXECUTION` with the precise last phase and an allowlisted diagnostic **code**, not arbitrary RPC/SDK error strings that might contain secrets or untrusted content. The runner still exits nonzero; failures are not silently green.

For a terminal local success it requires both:
- Verified Stage37/Stage48 callback result with actual persisted state at a later finalized local block and zero receipt failures.
- Verified Stage41 liquidation accounting: actual borrower mutation, collateral FT receipt and no false profit approval.

Any callback-only success, missing FT collateral or absent borrower debt reduction is blocked. A successful local settlement does **not** prove mainnet profitability or immutable state trie parity.

## Evidence and workflow

The actual `stage37-workspaces-sandbox-replay.mjs` now writes this record while running, not only when it finishes. All Stage37/40/42/44 conditional Sandbox workflows upload the phase record when available. Stage37 also appends a sanitized failure/success phase summary to GitHub Actions **even if the execution job fails**.

Regression tests enforce monotonic phase transitions, non-authorization, failure-code redaction, real receipt/settlement requirements, and runner placement before actual account funding and actual Rhea function call.

## Still outstanding

A new authentic source-positive, fresh and funded Rhea borrower is still required to trigger a real source-admitted isolated liquidation. No mainnet signer, trade, realized profit or unconditional execution is introduced. Stage55 makes the next genuine attempt diagnosable, **not automatically successful**.

GitHub workflow: `.github/workflows/rhea-stage37-sandbox-execution.yml`; strict source gating remains `src/rhea/stage37-sandbox-replay-gate-cli.ts`.
