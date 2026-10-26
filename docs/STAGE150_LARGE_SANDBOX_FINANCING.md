# Stage150 — Large-capital genuine local Rhea financing experiment

Status: **implemented, pending real GitHub Actions NEAR Workspaces original receipt proof**.

Target: **10 entire test LiNEAR** of financing, equivalent to `10000000000000000000000000` NEP-141 atomic LiNEAR units (24 decimals), backed by **1,000 entire disposable test NEAR** of the funding partner's own wrapped NEAR collateral. An opt-in 100 LiNEAR ceiling exists for a subsequent larger stress test, **not yet demonstrated or approved for mainnet**.

Why this is larger: Stage148's original fully repaid experiment moved **1858490264605800 atomic LiNEAR**, or approximately 0.00000000185849 LiNEAR. The Stage150 target moves roughly 5.38 **billion times more actual test token principal** through cloned Rhea and NEP-141 contracts. The local partner's collateral is also increased from 1 to 1,000 disposable test NEAR. This increases financing scale but **does not increase the historical liquidatable amount** of original borrower 2579.

The finance mechanics are real **in a local nearcore Sandbox**:
1. Create a local disposable partner with extra Sandbox balance.
2. Wrap and deposit 1,000 test NEAR with original imported `wrap.near` and Rhea lending code, preserving original WNEAR share/vault and callback conservation checks.
3. Independently fail if genuine cloned Rhea LiNEAR token vault, available lending headroom, or Pyth-priced conservative collateral capacity is insufficient for 10 LiNEAR (or 100 in separately selected tier). Do not fabricate market liquidity or scale historical borrower state.
4. Borrow 10 LiNEAR using genuine Rhea `Borrow`/`Withdraw` and independently attest actual wallet FT credit. Transfer that 10 LiNEAR to a brand-new liquidator that **holds zero collateral and debt** and deposit it into Rhea as supplied LiNEAR.
5. Execute the original historical, source-authenticated **small** Rhea `Liquidate`/`Withdraw` with its original source-sized maximum. The borrower's recoverable debt/collateral may not be exaggerated to consume excess principal.
6. Using original Rhea method `Withdraw:{token_id:linear-protocol.near}`, separately withdraw the **remaining unconsumed LiNEAR supply** from Rhea with actual finalized token transfer receipts. Verify zero remaining supplied shares, no liquidator debt/collateral, and real wallet token conservation.
7. Repay the actual observed full large principal to the separate partner and let it settle its original Rhea Borrow. Allow only actual independently observed interest/rounding debt topups from the liquidator's own remaining FT proceeds and only within a strict **0.1% of principal** cap; reject any economics that cannot cover the extra debt. Require zero partner borrowed shares, positive final liquidator wallet inventory and complete original Rhea/NEP-141 receipt trees.

Everything uses explicitly local Workspaces with `NEAR_WORKSPACES_NETWORK=sandbox`, `EXECUTION_ENABLED=false`, `STAGE146_ALLOW_LOCAL_NEAR_LOAN=true`, `STAGE150_LARGE_SANDBOX=true` and 20× artificial historical wall-clock compression from Stage147. The price/oracle contract and original quote stay unchanged. Consequently a successful run demonstrates genuine local financing accounting and callback compatibility but **cannot prove** live mainnet oracle timing, current borrow opportunity, real third-party capital, liquidity availability in the real market, gas economics or withdrawable profit. No wallet keys, mainnet signing or actual funds are used.

[Run the independent large-capital NEAR Workspaces workflow](../.github/workflows/rhea-stage150-large-financing-sandbox.yml). It includes original pinned Stage93 source input, adversarial tests and always-preserved receipts/failure evidence.

Never label the configured test quantity, code existence or passing unit tests as a large loan execution. Only the independent post-merge GitHub Actions artifact of actual original FINAL contract receipts establishes that claim.
