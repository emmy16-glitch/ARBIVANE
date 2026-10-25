# Stage 60 — make the legacy Stage40 Rhea discovery workflow honor Stage58 and Stage56 evidence

The older Stage40 read-only borrower workflow still used an obsolete `refreshed <= 16` gate after Stage58 expanded Rhea's authentic per-shard at-risk qualification to 80. On a real large risk cohort the qualification would finish but the shell step fail. Worse, if an actual source-positive Rhea contract Sandbox call returned a failure, `set -e` stopped the shard before durable Stage56 outcome classification, losing the distinction between an attempted real call and an unstarted simulation.

Stage60 fixes **that legacy entry point**, independently of Stage42's already-expanded Stage59 sequence:

- Require `reviewed <= 80`, `refreshed == paperAtRiskFromPreviousScan`, `refreshed <= 80` and no `BLOCKED_CANDIDATE_LIMIT`.
- When a source-positive real borrower exists, call **the existing actual imported-state NEAR Workspaces Rhea executor**, retaining its Sandbox-only environment flags, source hash/price/vault gates and checks for finalized callbacks, borrower debt and seized FT deltas.
- Capture the actual process exit code without `set -e` destroying receipt evidence; invoke the already-reviewed **Stage56 fail-closed classifier** to independently validate either a genuine Sandbox rejection or a complete settlement.
- Preserve raw runner output, Stage37 receipts, Stage41 token balance settlement, Stage46 cloned-state report, Stage55 execution-phase ledger, Stage56 attestation and classifier stdout as separate GitHub artifacts.
- Never treat an unknown runtime failure, absent evidence, synthetic candidate, attempted callback or reference paper spread as successful execution.
- No mainnet signing, operator wallet funds or production liquidation broadcast.

Stage59's multi-window scan and this legacy Stage40 fix can both discover accounts and attempt isolated Sandbox execution. Neither guarantees there is an unhealthy borrower at the observed fresh price or that execution produces real net profit.

Source code and automated CI tests establish correct wiring, not that a real Rhea liquidation receipt has been produced.
