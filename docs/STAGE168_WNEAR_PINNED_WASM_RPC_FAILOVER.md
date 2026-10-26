# Stage168 — Recover pinned Workspaces wNEAR code imports after SDK JSON-RPC rate limiting

## Verified defect

On 26 October 2026 the genuine Stage93 [run #40400219939](https://github.com/emmy16-glitch/ARBIVANE/actions/runs/40400219939), artifact #12688970925, passed source Rhea/Pyth risk sizing (single original historical account, index 2579) and pinned liquidity preflight. **It did not fund or execute any Sandbox liquidation**.

The state-clone witness independently showed `contract.main.burrow.near` cloned successfully (169 patched records); `wrap.near` failed with `STAGE119_CLONE_SDK_OR_RUNTIME_FAILED` while importing its deployed Wasm; other dependencies were not attempted. Its original `stage119-clone-failure.json` contains a JSON-RPC **`-429 Rate limits exceeded`** envelope. The failure came from the near-workspaces SDK import, not from the separate `ArchivalStateRpc.viewState` retry handler.

At the same commit, source and Safety CI passed. That does **not** mean the original Stage93 end-to-end liquidation succeeded.

## Stage168 implementation

- Apply the same strictly pinned source-code import failover already used by Stage91 LiNEAR to Stage89 `wrap.near` code imports.
- Request **exactly the same deployed contract, same historical `blockId` and `withData:false`**, trying an independent validated archival endpoint only after a transient SDK RPC failure. There is no latest-block fallback, invented WASM, modified borrower state, oracle override, mock token or mainnet signing.
- Restore the original `NEAR_CLI_MAINNET_RPC_SERVER_URL` after both success and failure. Every imported code hash is still independently compared to the original pinned `view_account.code_hash` **before** patching original source state and verifying FT views.
- Persist bounded `wasmImportAttempts` and `wasmImportFallbackUsed` without provider credentials. Both endpoints failing leaves `STAGE168_PINNED_WNEAR_WASM_IMPORT_PROVIDERS_EXHAUSTED`, preserving the failure.
- Distinguish SDK-encoded `-429` from a generic runtime error in Stage119 diagnostics. No decoded raw exception is trusted as proof of a contract result.
- Regression tests cover first-provider `-429` and second-provider success, provider exhaustion, deterministic no-retry rejection, source code hash mismatch, and unchanged live-spending safeguards.

### Acceptance and limitations

The workflow test suite must pass, and original post-merge Stage93 Sandbox artifacts must establish whether the wNEAR clone now completes. Further blocked steps must be recorded as genuine new errors rather than declared fixed prematurely. Original `FINAL` callback receipts, borrower health/debt/collateral deltas, liquidator FT balance increase, all financing liabilities repaid and independently verified net economic profit are separate requirements.

**Mainnet remains disabled (`EXECUTION_ENABLED=false`); no real cash profit or mainnet settlement is claimed.** A transient provider outage could still affect other archive reads; fallbacks cannot guarantee provider availability.
