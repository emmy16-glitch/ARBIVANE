# Stage 59: finite multi-thousand borrower continuation from authentic Rhea registry

## Previous operational blocker
The authenticated Stage30 snapshot contains 7,801 historical accounts with recorded debt. The Stage42 read-only verifier and conditional actual Workspaces local Rhea executor only scanned four 320-borrower windows per initial push: 1,280 historical findings from cursor 1292. Each downstream Stage47 dispatch consumed its strictly limited three followups and stopped, even though thousands of archived borrower accounts were not examined in that run.

A source-positive finding also stopped subsequent borrower scanning, despite Stage42's discover job already invoking the conditionally permitted Stage56 local Sandbox attempt before the reconciliation job could proceed. This prevented broad autonomous coverage after any unsuccessful source-positive reference.

## Stage 59 implementation
- Extend the authenticated dispatch budget on the **main-branch push** to **19 followups**, permitting **20 contiguous, fully reconciled 320-finding windows**. From the existing documented start cursor **1292**, a complete successful series visits precisely **6,400 distinct historical debt findings**, reaching source cursor **7692**.
- The Stage47 planner validates each completed Stage42 320-account reconciliation, source registry size, exact expected cursor, 4 independently attested shards, blocked/read dispositions, execution-disabled flags and a strict budget in **0..23**. Never emit a speculative future cursor or reuse a previously visited borrower range.
- A positive source-sized plan no longer halts **subsequent source-only window scanning**. The already-running discover job is responsible for strict Stage56 local Rhea Sandbox admission and evidence. If that job fails its actual execution-evidence contract, the reconciliation cannot dispatch.
- Keep the **finite budget** and refuse to dispatch if fewer than 320 archived findings remain. Record `remainingHistoricalFindings`, `fullWindowsRemaining`, and `tailFindingsBeyondFullWindows` in the Stage47 planning artifact and GitHub summary.
- The known 7,801-finding registry leaves **109 findings beyond the final 320-account window** beginning at the existing cursor. These 109 are **not scanned by this implementation**; never call this exhaustive full-market coverage.
- No mainnet signer, execution RPC, wallet keys, real-money transactions, model oracle shortcuts or false profit claims. Existing live Stage32 active-Pyth refreshing, Stage35 safe route sizing, Stage37 Workspaces import, Stage48 finalized callback, Stage49 wrapped Sandbox NEAR actor financing, Stage50 vault reserves, Stage51 oracle parity, Stage52 actor borrow solvency and Stage55/56 execution evidence remain mandatory.

## Evidence and cost limitations
This is **workflow capacity**, not a claim the entire 6,400-account series has already executed. The conditional pipeline requires authentic Stage30 data and real newly refreshed positive borrowers. All source findings are historical and may now be healthy, no longer borrowing, or unpriceable. Each next GitHub Actions job is dispatched **only after a successful independently verified current 320-account reconciliation**, subject to RPC/CI availability and configured execution-time budgets. No success can be claimed from fixture tests alone.

Scanning 6,400 historical borrowers may use significant provider requests and GitHub Actions resources; it is finite by the actual authenticated inventory and bounded run count. Any job failure is a visible blocker, not a substitute for positive liquidation evidence.

## Verification
`tests/rhea-stage47-market-continuation.test.mjs` simulates all twenty index transitions, verifies final cursor **7692** and remaining **109**, checks limited upper budget, source-plan continuation, and non-mainnet execution. GitHub Actions safety/typecheck and advisory read-only compatibility jobs must both pass before merge.
