# Stage56 — real Rhea Sandbox attempt without losing authenticated market scan

Stage42 runs live, public mainnet read-only borrower observations across four shards of 80 historic debt accounts. If a borrower has a fresh, source-rule-valid Stage35 proposal, Stage42 installs near-workspaces, clones the real Rhea lending and dependencies and conditionally **executes the genuine `execute_with_pyth` call in a disposable Sandbox only**.

Previously the runner intentionally returned exit code 2 on a failed Rhea callback, missing source data, or unsatisfied lending checks. Stage42 used `set -e`, so this discarded its otherwise fully observed shard and prevented Stage42 from reconciling all 320 borrowers, stopping subsequent verified windows.

Stage56 changes the **actual GitHub Actions runner invocation**, not a simulated executor:

- Preserve the real `stage42-sandbox-actual.json` output and the runner's Stage55 phase evidence after an exit code 0 or 2. No result is assumed from exit code alone.
- Validate exit 0 **only if** independent Stage55 terminal execution, Stage48 callback and finalized state, and Stage41 borrower debt/collateral/FT transfer attestations all prove actual LOCAL Sandbox liquidation. Real funds/profit remain expressly unproven.
- Accept exit 2 **only if** it is an authenticated terminal `BLOCKED_LOCAL_RHEA_EXECUTION` with internally consistent phase, liquidator funding flag, actual `callRaw` invocation flag, safe failure taxonomy and no claim of successful settlement.
- Refuse unexpected process exit codes, missing report or phase, generic unclassified runtime errors, forged successful receipts, contradictory account changes, and any mainnet signing/execution.
- Write `stage56-sandbox-attempt-evidence.json` and `stage56-sandbox-attempt-stdout.json` in the real Stage42 per-shard Actions artifacts. A local failure can now be audited without corrupting the independently reconciled read-only Stage32/38 borrower facts. The Stage47 next-window planner still requires fully reconciled, contiguous source windows.

### Live execution entry

Merging this workflow change to `main` activates its configured `push` trigger: [Stage42 reconciled borrower continuation](https://github.com/emmy16-glitch/ARBIVANE/actions/workflows/rhea-stage42-reconciled-continuation.yml), first window at index 1292, up to three additional *independently verified* 320-account windows. On qualifying current source-positive borrowers the workflow attempts the actual Rhea `execute_with_pyth` **inside NEAR Sandbox**. An unresolved candidate legitimately stops with no transaction; nothing fabricates a borrower.

No mainnet signing capability is added. A passing CI test is not a verified on-chain liquidation, and a replay of another actor's historical liquidation is not an ARBIVANE mainnet execution. Inspect the Actions shard's Stage55/56 and Stage41 reports before claiming any real Rhea callback success, and independently verify swaps/gas/profit before even considering operator-authorized mainnet capital.
