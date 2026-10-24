# Stage 36 — verify actual historical Rhea execute_with_pyth liquidation receipts

The live Stage35 pinned-block probe of `godlike.near` at block 221440179 examined nine repay/seize token combinations. None passed the configured source-reference constraints with a positive minimum paper spread. **ARBIVANE must not submit a transaction for this candidate on that evidence**. No account, wallet, signer, loss cap or executable swap funding is authorized.

Instead of fabricating mainnet execution parity, Stage36 investigates **real historical NEAR transaction evidence**:

- On April 21, 2026, transaction `4zWtj3LppFhsSxY589ZqBBvVW5gKtmC6qYxRt53oezXV` from `collector1.near` to `contract.main.burrow.near` submitted the `execute_with_pyth` method with `Borrow`, `Liquidate` (borrower `fambam.near`) and `Withdraw` actions.
- The entry call and Pyth price-lookup receipts succeeded, **but callback_execute_with_pyth failed**, with an execution error indicating the asset was not permitted for borrowing. It did **not** represent a successful liquidation or realized profit.
- This is a concrete current-protocol method/shape witness, more relevant than archived `oracle_call` bot code. It is **not** proof the deployed bytecode at this old block matches today's code hash.

`src/rhea/stage36-mainnet-receipt-audit.ts` requires finality, matches the transaction hash/signer/receiver, decodes the NEAR transaction's base64 JSON action args, checks one legitimate `Borrow → Liquidate → Withdraw` action chain, verifies the individual callback outcomes and classifies failed callbacks. It rejects contradictory overall/receipt outcomes, stale execution and missing callbacks.

Live action `rhea-stage36-observed-liquidation-receipts.yml` fetches the historical `tx` RPC **read-only**, stores a redacted witness and never signs or submits anything. If the public RPC prunes an old historical transaction, the evidence says `BLOCKED_ARCHIVAL_TRANSACTION_UNAVAILABLE`; this is not an execution success.

Next steps: search genuinely **successful** final on-chain `Liquidate` callback receipts (including final borrower and liquidator token balance deltas); verify their code hash to today's deployed code; independently derive token-denomination and share conversion; construct a funded near-workspaces Sandbox clone with complete contract state and real `execute_with_pyth` action replay; obtain executable financing/swap quotes, gas and loss controls; ask operator for public liquidator wallet and explicit approved trading limits. **Only then** can real mainnet funds be risked. No PDFs, keys or signing in the repo.
