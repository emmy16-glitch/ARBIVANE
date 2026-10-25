# Stage61: recovered Rhea risk must reach the same actual Sandbox execution gate

Stage43 previously retried authentic Stage42 blocked observations, but stopped when it recovered paper-at-risk borrowers. The workflow did not independently source-size or attempt a liquidation for these recovered candidates. The Stage42 live run 40178609223 included many blocked borrower reads; Stage60's in-shard candidate retries alone cannot recover accounts originally blocked before risk classification.

Stage61 takes the completed Stage43 retry batch and independently recalculates the exact parent Stage42 window and blocked candidate IDs from its authenticated historical source registry and shard artifacts. It rejects altered borrower identities, mismatched observation indices, forged risk classifications, missing current pricing block, and any signing or execution-authority flags before any network call. It source-sizes only original blocked borrowers newly observed as paper-at-risk on a coherent current block, using fresh Rhea contract hashes and active Pyth evidence.

A recovered candidate is **not** liquidation permission: only a fresh positive Stage35 plan passing Stage37 argument checks may trigger a genuine local `near-workspaces` import and `execute_with_pyth` attempt. Actual Stage55 phases, Stage37 receipts, Stage41 balances, Stage48 persistence and Stage56 terminal blocked/success classification remain mandatory. An unsuccessful imported-contract call never counts as real profit. Mainnet signing and broadcasting stay disabled.

The Stage43 workflow records the Stage61 source evidence, optional actual Sandbox artifacts, and independently verified outcome. It then continues its bounded retries of the remaining historically blocked candidates only after the proof gate passes. CI tests cover valid recovered risk, healthy outcomes, forged evidence, untrusted source sizing and no mainnet signing.

Scope: this implementation does not establish an eligible borrower, successful Sandbox receipt, or live-wallet profit. The parent Stage42 run must complete and produce unexpired artifacts, and a new current verified borrower must appear.
