# Stage 48 — Rhea Sandbox callback result versus finality and persistent state

## Specific verified defect

The Stage37 liquidation receipt attestor required `final_execution_status: "FINAL"`. Stage44's actual NEAR Workspaces local transaction produced `EXECUTED_OPTIMISTIC` despite its successful result and receipts, and Stage44 subsequently proved local contract-state persistence by advancing the Sandbox **10,000 blocks** and checking an explicitly finalized block. Stage37 never gained that correction.

An optimistic callback receipt is **not final transaction status**, and even successful callback receipts do not demonstrate a liquidation, seized NEP-141 tokens or profits.

## Implementation

- `summarizeStage37SandboxOutcome` accepts properly structured, success-only `EXECUTED_OPTIMISTIC` receipts, but reports `ISOLATED_CALLBACK_PENDING_FINALIZED_PERSISTENCE`, not success. It does not set `transactionFinal=true` unless the raw status was genuinely `FINAL`.
- The real Stage37 Workspaces runner queries pre-replay borrower and actor positions and both FT balances; immediately after calling Rhea it records the same views. Following a successful callback, it observes the local Sandbox's finalized block, calls `fastForward(10000)`, records the advanced finalized block height, and **re-reads all four real contract/token views**.
- `attestStage48FinalizedSandboxReplay` requires both finalized heights to be plausible and advancing, borrower state to have changed, and every immediate poststate observation to match its later post-finalization observation. Missing or contradictory data aborts without promotion. A failed callback is never promoted.
- Stage41's existing per-position debt/collateral reductions, actor debt constraints and received FT collateral gate are still mandatory. An optimistic receipt may pass Stage41 only if the separate Stage48 persistence attestation succeeded.
- The result reports `transactionExecutionStatus`, `transactionFinal`, `persistedAtLaterFinalizedBlock`, and local finalized heights separately. An optimistic result **stays optimistic** even if persistent later-finalized state is verified.

## Validation and still-unproven work

Tests include optimistic pending outcomes, final receipts, failed async callback, stagnant final height, borrower-state unchanged, inconsistent later state, and Stage41 evidence coupling. GitHub CI verifies tests and type checking. For a real integration check, a **genuine** positive source-sized borrower must still pass the already present Stage35/37 strict gate; the known historical Stage35 candidate did not qualify.

Local Sandbox advancement is not independent proof of the original transaction's finality, cryptographic contract state parity, current borrower liquidation permission, available financing, executable token swaps, or realized profit. No mainnet signer, sending funds, broadcasting, or withdrawal is introduced.

See the [Stage37 workflow](https://github.com/emmy16-glitch/ARBIVANE/actions/workflows/rhea-stage37-sandbox-execution.yml) and the new receipt/state test evidence. The accepted outcome remains *isolated contract execution proof*, not money movement.
