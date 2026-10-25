# Stage 44 — actually start an executable, disposable NEAR Sandbox

Stage 37–43 already contains a guarded Rhea liquidation runner, but a safe **positive source-sizing candidate** was not available in its verified Stage 37 preflight; the live Stage 42 continuation was still running when Stage 44 started. A green scanning workflow is not proof of a successful liquidation. This stage independently proves whether the underlying isolated execution environment can perform a real state-changing contract call.

## Live executable integration (not a mocked transaction)

`.github/workflows/rhea-stage44-executable-sandbox.yml` triggers automatically after this workflow is merged into `main` and can also be dispatched manually. It:

1. Installs `near-workspaces@5.0.0` in GitHub Actions and downloads the public, compiled `status_message.wasm` from the immutable upstream NEAR Workspaces revision `d0eba4afcd17aebbb8a71db57eef898866901dbf`. It verifies Git blob SHA `313f4fda3a2917739b9a76b770a57c33dcb6d0ef` and exact file length, aborting on any mismatch.
2. Starts an independent local NEAR Sandbox through `Worker.init({network:'sandbox'})`. This worker has only disposable Sandbox keys; **no mainnet account, private key, seed, wallet, signer or state-changing mainnet RPC** is supplied.
3. Deploys the pinned test contract in Sandbox and creates a disposable actor.
4. Calls `get_status` to verify the previous value is `null`, sends an **actual state-changing Sandbox transaction** with `actor.callRaw(...,'set_status',...)`, and reads `get_status` again to verify that the value changed to the submitted message.
5. Rejects failed/missing receipts or wrong state. NEAR Workspaces 5.0 can return `EXECUTED_OPTIMISTIC` even after a successful local contract call. Instead of inventing finality, Stage 44 advances the **local** Sandbox eight blocks, reads a later block using `finality: 'final'`, and verifies the contract value still matches. This supports **execution and persistence** while keeping `transactionFinal=false` for optimistic transaction responses. A `FINAL` response alone sets `transactionFinal=true`. The exact receipt count, gas and finalized block heights are saved in `stage44-local-sandbox-execution.json` and verified by CI.

The deployed contract is **NOT Rhea**. A Stage 44 local Sandbox success proves a working test transaction environment, **not** an executed Rhea liquidation, seized collateral or profit.

## Rhea import capability test

The workflow also checks whether NEAR Workspaces can import the actual `contract.main.burrow.near` contract **with on-chain data** (`withData:true`) at the historical finalized block `221433162`, enforcing the previously observed deployed code hash, then comparing lending `get_config` to that pinned archival block.

If the archival RPC returns an oversized state response, fails to provide that block, or the Workspaces import fails, the diagnostic explicitly records `BLOCKED_RHEA_IMPORT_NOT_PROVEN`. Even a matching `get_config` does **not** attest the entire state keyset, FT contracts, prices, borrower positions, callback completion or liquidation semantics. The main Sandbox execution job may pass while Rhea import remains blocked; read the **two different artifact statuses**.

## Actual Rhea liquidation replay path

The existing Stage 37/38/40/42 work can attempt `Borrow → Liquidate → Withdraw` against **imported local Sandbox only** after a genuine, refreshed Stage 35 positive source-sizing report passes the transaction gate. No invented candidate or manufactured health below 100% will be used to force a green liquidation replay. Stage 43 retries blocked observations before risking such claims.

A successful *actual Rhea replay* must separately verify finalized `execute_with_pyth` and callback receipts, borrower debt and collateral decrease, received NEP-141 collateral, and no outstanding actor debt. Those observations still do not prove a profitable trade until financing, sale/swap proceeds and all gas/storage/slippage costs have been reconciled in one settlement asset.

**All Stage 44 reports have** `executionEnabled=false`, `maySignMainnet=false`, `mayBroadcastMainnet=false`, `realRheaLiquidationAttempted=false` for the independent smoke test, and `profitVerified=false`. Nothing will sign or broadcast to mainnet.

Verify using `npm run check` and inspect the Stage 44 [Actions workflow](https://github.com/emmy16-glitch/ARBIVANE/actions/workflows/rhea-stage44-executable-sandbox.yml). Never confuse local test-contract execution with actual Rhea profit.
