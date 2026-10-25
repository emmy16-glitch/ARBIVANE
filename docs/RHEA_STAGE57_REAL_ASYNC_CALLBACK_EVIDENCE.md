# Stage 57 — real Rhea asynchronous liquidation receipt evidence

The existing authenticated Stage42/56 borrower scan conditionally invokes **the actual imported Rhea `execute_with_pyth` method**, but the Stage37 verifier used to throw a `SANDBOX_RECEIPT_FINALITY_CONTRADICTION` whenever a transaction-level success coexisted with a **failed asynchronous child or callback receipt**. This is a valid NEAR promise-chain failure shape: a parent can succeed in submitting a cross-contract operation while the subsequent Rhea callback fails. Throwing away that result prevented an auditable rejection witness and weakened debugging of real attempts.

## Changed behavior

Stage37 now independently parses the NEAR execution-level status, every receipt outcome and the identified actual `callback_execute_with_pyth` receipt IDs. Only a well-formed status with exactly one NEAR status variant (`Failure`, `SuccessValue`, or `SuccessReceiptId`) can enter the evidence. Duplicate receipt IDs, omitted callbacks or receipt outcomes, malformed statuses and unsupported finality **still fail closed**.

- Any failed Rhea callback emits `SANDBOX_RECEIPT_FAILURE` and includes `SANDBOX_RHEA_ASYNC_CALLBACK_FAILED`. Never promotes a failed receipt when its top-level status says success.
- An unrelated failed asynchronous dependency emits `SANDBOX_ASYNC_DEPENDENCY_RECEIPT_FAILED`, even if the Rhea callback itself reports a successful receipt.
- A top-level failed transaction emits `SANDBOX_TOP_LEVEL_TRANSACTION_FAILED`, including when all received child receipts happen to be successful.
- The output includes bounded integers `callbackReceiptCount`, `failedCallbackReceiptCount` and boolean `topLevelFailureObserved`, alongside raw receipt count, failed receipt count and summed gas. The report does **not** include the RPC failure string or secrets.
- Both Stage37 and Stage42 GitHub workflow summaries expose these new fields when a genuine isolated contract attempt reaches the receipt stage.

The Stage41 and Stage55 independently enforced settlement proof remains unchanged: **zero failed receipts**, successful actual callback, debt reduction, collateral reduction, seized FT gain, no liquidator debt and persistence at a later finalized local block. Receipt-format improvements do not bypass qualifying Stage35/38 candidate or enable mainnet.

## Explicit limitations

This is **real execution-path code**, not an assertion that a fresh source-positive borrower has been discovered or that a successful liquidation has been sent. GitHub CI exercises controlled receipt fixtures, **not a completed actual Rhea liquidation**. Existing Stage42 scans submit only when they discover an authentic, currently valid, source-positive candidate. No mainnet signer, profit or withdrawal is implemented here.

CI: `npm run check`; production-relevant run path: `.github/workflows/rhea-stage42-reconciled-continuation.yml`.
